import { API_VERSION } from '@storekit/shared';
import { loadSession, saveTokens, clearSession } from './storage.js';

/**
 * The single HTTP client.
 *
 * Responsibilities, deliberately in one place: attach the access token, refresh it once
 * when it expires, surface the API's error envelope as a real Error, and never let two
 * concurrent 401s fire two refreshes (which would rotate the refresh token twice and trip
 * the backend's reuse detection, logging the user out mid-session).
 */

const BASE_URL = String(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const TIMEOUT_MS = 20_000;

/** Refresh this early, so a token does not expire in flight. */
const EXPIRY_SKEW_MS = 30_000;

export class ApiError extends Error {
  constructor({ status, code, message, details, requestId }) {
    super(message ?? 'Something went wrong. Please try again.');
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details ?? [];
    this.requestId = requestId;
  }

  /** True when retrying the same request could plausibly succeed. */
  get isRetryable() {
    return this.status >= 500 || this.status === 429 || this.status === 0;
  }

  /** Field-level messages, keyed by form field, for rendering under inputs. */
  get fieldErrors() {
    const out = {};
    for (const issue of this.details) {
      if (issue?.path && !out[issue.path]) out[issue.path] = issue.message;
    }
    return out;
  }
}

/* ───────────── In-memory session, mirrored to the keychain ───────────── */

let memory = { accessToken: null, accessTokenExpiresAt: null, refreshToken: null };
let hydrated = false;
let refreshInFlight = null;
let onUnauthenticated = () => {};

/** The auth provider registers here so a dead refresh token can bounce to the login screen. */
export const setUnauthenticatedHandler = (fn) => {
  onUnauthenticated = typeof fn === 'function' ? fn : () => {};
};

export const hydrate = async () => {
  if (hydrated) return memory;
  const stored = await loadSession();
  memory = {
    accessToken: stored.accessToken,
    accessTokenExpiresAt: stored.accessTokenExpiresAt,
    refreshToken: stored.refreshToken,
  };
  hydrated = true;
  return memory;
};

export const setTokens = async (tokens) => {
  memory = {
    accessToken: tokens?.accessToken ?? null,
    accessTokenExpiresAt: tokens?.accessTokenExpiresAt ?? null,
    refreshToken: tokens?.refreshToken ?? null,
  };
  hydrated = true;
  await saveTokens(memory);
};

export const forgetTokens = async () => {
  memory = { accessToken: null, accessTokenExpiresAt: null, refreshToken: null };
  hydrated = true;
  await clearSession();
};

export const hasSession = () => Boolean(memory.refreshToken);

const isExpired = () => {
  if (!memory.accessToken) return true;
  if (!memory.accessTokenExpiresAt) return false;
  return new Date(memory.accessTokenExpiresAt).getTime() - EXPIRY_SKEW_MS <= Date.now();
};

/* ───────────── Transport ───────────── */

const parse = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const send = async (method, path, { body, headers = {}, signal } = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  // A caller-supplied signal (a screen unmounting) must also cancel the request.
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener?.('abort', abortFromCaller);

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await parse(response);
    return { response, payload };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiError({ status: 0, code: 'TIMEOUT', message: 'The request took too long. Check your connection.' });
    }
    throw new ApiError({ status: 0, code: 'NETWORK', message: 'No connection. Check your network and try again.' });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', abortFromCaller);
  }
};

/**
 * Exchanges the refresh token. Single-flight: every caller that arrives while a refresh
 * is running awaits the same promise instead of starting another.
 */
const refreshTokens = async () => {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    if (!memory.refreshToken) return false;

    const { response, payload } = await send('POST', `/${API_VERSION}/auth/refresh`, {
      body: { refreshToken: memory.refreshToken },
    });

    // The route answers 200 with a null body when the token is missing, and 401 when it
    // has been revoked or reused. Both mean the same thing here: the session is over.
    if (!response.ok || !payload?.data?.tokens) {
      await forgetTokens();
      onUnauthenticated();
      return false;
    }

    await setTokens(payload.data.tokens);
    return true;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
};

const raise = (response, payload) => {
  throw new ApiError({
    status: response.status,
    code: payload?.error?.code ?? 'UNKNOWN',
    message: payload?.error?.message,
    details: payload?.error?.details,
    requestId: payload?.error?.requestId,
  });
};

/**
 * @param {string} method
 * @param {string} path  Path below the version prefix, e.g. `/auth/me`.
 * @param {{ body?: unknown, auth?: boolean, headers?: Record<string,string>, signal?: AbortSignal }} [options]
 */
export const request = async (method, path, options = {}) => {
  const { auth = true, ...rest } = options;
  await hydrate();

  const authorize = async () => (memory.accessToken ? { Authorization: `Bearer ${memory.accessToken}` } : {});

  if (auth) {
    // Refresh proactively on a known-expired token: one round trip instead of two.
    if (isExpired() && memory.refreshToken && !(await refreshTokens())) {
      throw new ApiError({ status: 401, code: 'SESSION_EXPIRED', message: 'Please sign in again.' });
    }
  }

  let { response, payload } = await send(method, `/${API_VERSION}${path}`, {
    ...rest,
    headers: { ...(auth ? await authorize() : {}), ...(rest.headers ?? {}) },
  });

  // Reactive path: the token was rejected despite looking valid (revoked session, a
  // password change elsewhere, a clock skew we did not account for).
  if (auth && response.status === 401 && memory.refreshToken) {
    if (!(await refreshTokens())) raise(response, payload);
    ({ response, payload } = await send(method, `/${API_VERSION}${path}`, {
      ...rest,
      headers: { ...(await authorize()), ...(rest.headers ?? {}) },
    }));
  }

  if (response.status === 401 && auth) {
    await forgetTokens();
    onUnauthenticated();
  }

  if (!response.ok) raise(response, payload);

  return payload?.data ?? null;
};

export const api = {
  get: (path, options) => request('GET', path, options),
  post: (path, body, options) => request('POST', path, { ...options, body: body ?? {} }),
  patch: (path, body, options) => request('PATCH', path, { ...options, body: body ?? {} }),
  del: (path, options) => request('DELETE', path, options),
};

export const apiBaseUrl = () => BASE_URL;

/** Builds the querystring, dropping empty values so the API never sees `?q=`. */
export const qs = (params = {}) => {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join('&')}` : '';
};
