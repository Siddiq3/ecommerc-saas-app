import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as client from '../api/client.js';
import { auth as authApi, businesses as businessApi } from '../api/endpoints.js';
import { saveBusinessId, loadSession, getDeviceId } from '../api/storage.js';

/**
 * Session state for the whole app.
 *
 * Holds the signed-in owner and the store they are operating, and nothing else — plan
 * and entitlement live in their own provider, because they refresh on a different
 * schedule and for different reasons.
 */

const AuthContext = createContext(null);

/**
 * Identifies this install to the backend's session list and new-device alerts.
 *
 * The id is generated once and kept locally rather than read from a hardware identifier:
 * a random value tells the backend exactly what it needs (“is this the same install as
 * last time”) while being useless to anyone correlating users across apps.
 */
const deviceInfo = async () => ({
  deviceId: await getDeviceId(),
  deviceName: `${Platform.OS === 'ios' ? 'iPhone' : 'Android'} · StoreKit`,
});

export const AuthProvider = ({ children }) => {
  const [state, setState] = useState({ status: 'loading', user: null, businessId: null });
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const apply = useCallback((next) => {
    if (mounted.current) setState((prev) => ({ ...prev, ...next }));
  }, []);

  /** Pulls the owner and resolves which store the app is operating. */
  const loadUser = useCallback(async () => {
    const user = await authApi.me();
    // V1 is one store per owner. `/auth/me` already carries the memberships, so this
    // costs nothing; the businesses call is only a fallback for an older token shape.
    let list = user?.businesses ?? [];
    if (!list.length) {
      const page = await businessApi.list().catch(() => null);
      list = page?.items ?? [];
    }
    const businessId = list[0]?.businessId ?? null;
    await saveBusinessId(businessId);
    apply({ status: 'authenticated', user: { ...user, businesses: list }, businessId });
    return { user, businessId };
  }, [apply]);

  /* Restore a stored session on cold start. */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      await client.hydrate();
      const stored = await loadSession();

      if (!client.hasSession()) {
        if (!cancelled) apply({ status: 'unauthenticated', user: null, businessId: null });
        return;
      }

      // Show the last known store immediately so the dashboard can render its skeleton
      // against the right tenant while /auth/me is still in flight.
      if (stored.businessId && !cancelled) apply({ businessId: stored.businessId });

      try {
        await loadUser();
      } catch (error) {
        // A network failure on launch must not log anyone out — only a rejected session
        // does that, and the client has already cleared the tokens in that case.
        if (cancelled) return;
        if (!client.hasSession()) apply({ status: 'unauthenticated', user: null, businessId: null });
        else apply({ status: 'authenticated', user: null, error });
      }
    })();

    return () => { cancelled = true; };
  }, [apply, loadUser]);

  /* A refresh token that the backend refuses drops the app straight to the login screen. */
  useEffect(() => {
    client.setUnauthenticatedHandler(() => apply({ status: 'unauthenticated', user: null, businessId: null }));
    return () => client.setUnauthenticatedHandler(null);
  }, [apply]);

  const signIn = useCallback(
    async ({ email, mobile, password }) => {
      const result = await authApi.login({ email, mobile, password, ...(await deviceInfo()) });
      await client.setTokens(result.tokens);
      const businessId = result.user?.businesses?.[0]?.businessId ?? null;
      await saveBusinessId(businessId);
      apply({ status: 'authenticated', user: result.user, businessId });
      return result;
    },
    [apply],
  );

  // Email codes are off until SES is approved: signing up returns a session, exactly as signing in does.
  // (The feature/email-otp branch goes back to sending a code and verifying it.)
  const signUp = useCallback(
    async (input) => {
      const result = await authApi.signup(input);
      if (result?.tokens) {
        await client.setTokens(result.tokens);
        const businessId = result.user?.businesses?.[0]?.businessId ?? null;
        await saveBusinessId(businessId);
        apply({ status: 'authenticated', user: result.user, businessId });
      }
      return result;
    },
    [apply],
  );

  /** Completes email verification; the backend returns a session, so this also signs in. */
  const verifyEmail = useCallback(
    async ({ email, code, purpose = 'email_verification' }) => {
      const result = await authApi.verifyOtp({ email, code, purpose, ...(await deviceInfo()) });
      if (!result?.tokens) return result;

      await client.setTokens(result.tokens);
      const businessId = result.user?.businesses?.[0]?.businessId ?? null;
      await saveBusinessId(businessId);
      apply({ status: 'authenticated', user: result.user, businessId });
      return result;
    },
    [apply],
  );

  const signOut = useCallback(async () => {
    // Best effort: the local session is gone either way, so a failed call must not strand
    // the user on a screen they can no longer use.
    await authApi.logout().catch(() => undefined);
    await client.forgetTokens();
    await saveBusinessId(null);
    apply({ status: 'unauthenticated', user: null, businessId: null });
  }, [apply]);

  /** Called after store creation, and whenever the profile changes. */
  const refreshUser = useCallback(async () => loadUser().catch(() => undefined), [loadUser]);

  const value = useMemo(
    () => ({
      ...state,
      isAuthenticated: state.status === 'authenticated',
      isLoading: state.status === 'loading',
      business: state.user?.businesses?.find((b) => b.businessId === state.businessId) ?? state.user?.businesses?.[0],
      signIn,
      signUp,
      signOut,
      verifyEmail,
      refreshUser,
    }),
    [state, signIn, signUp, signOut, verifyEmail, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
