import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

/**
 * Token storage.
 *
 * Tokens go to the OS keychain (iOS) / EncryptedSharedPreferences (Android) rather than
 * AsyncStorage, which is a world-readable plaintext file on a rooted device.
 *
 * The refresh token is critical: without it a cold start looks exactly like a signed-out
 * install. SecureStore can occasionally reject while the native keystore is waking up, so
 * critical reads/writes are retried and a saved refresh token is read back before login or
 * sign-up is allowed to report success. Non-session metadata stays best-effort.
 */

const ACCESS = 'sk.accessToken';
const ACCESS_EXPIRY = 'sk.accessTokenExpiresAt';
const REFRESH = 'sk.refreshToken';
const BUSINESS = 'sk.businessId';

const STORAGE_ATTEMPTS = 3;
const RETRY_DELAY_MS = 80;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const retry = async (operation) => {
  let lastError;

  for (let attempt = 0; attempt < STORAGE_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < STORAGE_ATTEMPTS - 1) await pause(RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw lastError;
};

const sessionStorageError = (message, cause) => {
  const error = new Error(message);
  error.name = 'SessionStorageError';
  error.code = 'SESSION_STORAGE_ERROR';
  error.cause = cause;
  return error;
};

const read = async (key) => {
  try {
    return await retry(() => SecureStore.getItemAsync(key));
  } catch {
    return null;
  }
};

const readRefreshToken = async () => {
  try {
    return await retry(() => SecureStore.getItemAsync(REFRESH));
  } catch (error) {
    throw sessionStorageError(
      'We could not restore your saved sign-in on this device. Please sign in again.',
      error,
    );
  }
};

const write = async (key, value) => {
  try {
    await retry(async () => {
      if (value === null || value === undefined) await SecureStore.deleteItemAsync(key);
      else await SecureStore.setItemAsync(key, String(value));
    });
  } catch {
    // Business id, device id and access-token cache are conveniences. A refresh token is
    // handled separately below and is never allowed to fail silently.
  }
};

const saveRefreshToken = async (value) => {
  if (!value) {
    throw sessionStorageError(
      'Your sign-in could not be saved securely. Please try again.',
      new Error('Missing refresh token'),
    );
  }

  try {
    await retry(async () => {
      const expected = String(value);
      await SecureStore.setItemAsync(REFRESH, expected);
      const stored = await SecureStore.getItemAsync(REFRESH);
      if (stored !== expected) throw new Error('SecureStore refresh-token verification failed');
    });
  } catch (error) {
    throw sessionStorageError('Your sign-in could not be saved securely. Please try again.', error);
  }
};

export const loadSession = async () => {
  // Read the one credential required to survive a restart strictly. The other values are
  // caches: if either is missing the API client can recover them with the refresh token.
  const refreshToken = await readRefreshToken();
  const [accessToken, accessTokenExpiresAt, businessId] = await Promise.all([
    read(ACCESS),
    read(ACCESS_EXPIRY),
    read(BUSINESS),
  ]);

  return { accessToken, accessTokenExpiresAt, refreshToken, businessId };
};

export const saveTokens = async (tokens) => {
  // Commit the long-lived credential first and verify it before the auth flow reports
  // success. If the process is killed immediately afterwards, the next launch can still
  // obtain a fresh access token.
  await saveRefreshToken(tokens?.refreshToken);

  await Promise.all([
    write(ACCESS, tokens?.accessToken ?? null),
    write(ACCESS_EXPIRY, tokens?.accessTokenExpiresAt ?? null),
  ]);
};

export const saveBusinessId = async (businessId) => write(BUSINESS, businessId ?? null);

export const clearSession = async () =>
  Promise.all([write(ACCESS, null), write(ACCESS_EXPIRY, null), write(REFRESH, null), write(BUSINESS, null)]);

const DEVICE = 'sk.deviceId';

/**
 * A random, install-scoped identifier, created on first use.
 *
 * Deliberately not a hardware id: the backend only needs to recognise the same install
 * across logins, and a random value cannot be used to correlate this user with any other
 * app on the device.
 */
export const getDeviceId = async () => {
  const existing = await read(DEVICE);
  if (existing) return existing;

  const bytes = Crypto.getRandomBytes(16);
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await write(DEVICE, id);
  return id;
};
