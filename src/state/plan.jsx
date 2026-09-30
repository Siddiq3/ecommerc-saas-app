import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { isEntitled } from '@storekit/shared';
import { subscription } from '../api/endpoints.js';
import { useAuth } from './auth.jsx';

/**
 * Subscription state: what the merchant's account is entitled to, as the server says.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  GOOGLE PLAY POLICY BOUNDARY — read before adding anything to this file.
 *
 *  This app is consumption-only. It reads the plan status from our API and shows it; it
 *  never sells, prices, starts or manages a subscription, and never sends the merchant
 *  anywhere to do so — no plan picker, no checkout link, no billing handoff, no return
 *  deep link from a checkout. Signing up for a plan happens on the website, on its own;
 *  the app notices the new status on its next check.
 *
 *  Never add to this app: a payment SDK, `react-native-webview`, `WebView`, a purchase
 *  button or link, a price, or any call to an endpoint that creates an order or a
 *  subscription. `npm run verify:compliance` checks for these.
 * ────────────────────────────────────────────────────────────────────────────
 */

const PlanContext = createContext(null);

/** Background poll, so a status that changes mid-session is noticed without a restart. */
const POLL_INTERVAL_MS = 5 * 60 * 1000;

export const PlanProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const mounted = useRef(true);
  const lastFetch = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(
    async ({ silent = true } = {}) => {
      if (!isAuthenticated) return null;
      if (!silent) setLoading(true);

      try {
        const next = await subscription.status();
        lastFetch.current = Date.now();
        if (mounted.current) {
          setStatus(next);
          setError(null);
        }
        return next;
      } catch (err) {
        // A failed status check must never lock a paying merchant out of their store, so
        // the last known status stands and the error is only surfaced if we have nothing.
        if (mounted.current) setError(err);
        return null;
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [isAuthenticated],
  );

  /* Initial load and reset on sign-out. */
  useEffect(() => {
    if (!isAuthenticated) {
      setStatus(null);
      setLoading(false);
      return;
    }
    refresh({ silent: false });
  }, [isAuthenticated, refresh]);

  /* Re-check when the app comes back to the foreground. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !isAuthenticated) return;
      // Cheap guard against the rapid background/foreground churn of a permission dialog.
      if (Date.now() - lastFetch.current > 10_000) refresh();
    });
    return () => sub.remove();
  }, [isAuthenticated, refresh]);

  /* Slow background poll, so a plan that lapses mid-session is noticed without a restart. */
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const timer = setInterval(() => refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isAuthenticated, refresh]);

  const value = useMemo(() => {
    const planStatus = status?.plan_status ?? null;
    return {
      status,
      planStatus,
      loading,
      error: status ? null : error,
      /** Null until the first successful load, so screens can hold rather than flash the lock. */
      entitled: planStatus === null ? null : isEntitled(planStatus),
      needsOnboarding: Boolean(status?.needsOnboarding),
      refresh,
    };
  }, [status, loading, error, refresh]);

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
};

export const usePlan = () => {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used inside <PlanProvider>');
  return ctx;
};
