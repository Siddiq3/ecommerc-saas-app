import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { isEntitled } from '@storekit/shared';
import { subscription } from '../api/endpoints.js';
import { colors } from '../theme.js';
import { useAuth } from './auth.jsx';

/**
 * Subscription state, and the one place the app is allowed to talk about money.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  GOOGLE PLAY POLICY BOUNDARY — read before adding anything to this file.
 *
 *  This app never takes a payment. It reads an entitlement from our API and, when the
 *  merchant asks to upgrade, hands a short-lived token to the *system browser* via
 *  `WebBrowser.openBrowserAsync`, which is an Android Custom Tab / iOS
 *  SFSafariViewController — the device's real browser, with its own URL bar, not a
 *  surface we control.
 *
 *  Never add to this app: the Cashfree SDK, `react-native-webview`, `WebView`,
 *  `openAuthSessionAsync` pointed at a checkout, a card or UPI entry form, a price the
 *  app itself charges, or any call to an endpoint that creates an order or a
 *  subscription. If a change needs one of those, it belongs on the website.
 * ────────────────────────────────────────────────────────────────────────────
 */

const PlanContext = createContext(null);

/** Background poll. Long, because the deep link and the resume hook do the real work. */
const POLL_INTERVAL_MS = 5 * 60 * 1000;
/** After returning from checkout the webhook may still be in flight, so retry briefly. */
const POST_CHECKOUT_RETRIES = [1500, 4000, 9000, 20_000];

export const PlanProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const mounted = useRef(true);
  const retryTimers = useRef([]);
  const lastFetch = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      retryTimers.current.forEach(clearTimeout);
      retryTimers.current = [];
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

  /**
   * Polls a few times with a widening gap. Cashfree's webhook is what actually grants the
   * plan, and it lands a beat after the browser redirects, so a single refresh on return
   * would usually still show the old status.
   */
  const refreshUntilChanged = useCallback(() => {
    retryTimers.current.forEach(clearTimeout);
    retryTimers.current = POST_CHECKOUT_RETRIES.map((delay) =>
      setTimeout(async () => {
        const next = await refresh();
        // Once entitled through a real subscription, stop burning requests.
        if (next?.plan_status === 'subscribed') {
          retryTimers.current.forEach(clearTimeout);
          retryTimers.current = [];
        }
      }, delay),
    );
    return refresh();
  }, [refresh]);

  /* Initial load and reset on sign-out. */
  useEffect(() => {
    if (!isAuthenticated) {
      setStatus(null);
      setLoading(false);
      return;
    }
    refresh({ silent: false });
  }, [isAuthenticated, refresh]);

  /* Re-check when the app comes back to the foreground, which is also the moment the
     merchant returns from the browser on iOS if the deep link did not fire. */
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

  /* The website sends the merchant back with storekit://payment-success after checkout. */
  useEffect(() => {
    const handle = ({ url }) => {
      if (!url) return;
      const { hostname, path } = Linking.parse(url);
      const target = hostname ?? path?.replace(/^\//, '');
      if (target === 'payment-success') refreshUntilChanged();
    };

    const sub = Linking.addEventListener('url', handle);
    // Covers a cold start: the app was launched by the link rather than resumed by it.
    Linking.getInitialURL().then((url) => url && handle({ url }));
    return () => sub.remove();
  }, [refreshUntilChanged]);

  /**
   * Opens billing in the device's browser.
   *
   * The code is minted server-side, is opaque, lives two minutes and is spent on first use,
   * so the URL in the browser's history is worthless to anyone who finds it later.
   */
  const openBilling = useCallback(
    async ({ manage = false } = {}) => {
      const handoff = await subscription.handoff();
      const url = manage ? (handoff.manageUrl ?? handoff.url) : handoff.url;

      await WebBrowser.openBrowserAsync(url, {
        // Tints only. The browser keeps its own chrome and its own URL bar: the merchant
        // can always see they are on our real domain before they pay.
        toolbarColor: '#ffffff',
        controlsColor: colors.accent600,
        dismissButtonStyle: 'close',
        enableBarCollapsing: true,
        showTitle: true,
      });

      // Reached when the browser sheet is dismissed. On Android the tab may still be open
      // behind us, so this is a best-effort nudge, not the source of truth.
      return refreshUntilChanged();
    },
    [refreshUntilChanged],
  );

  const value = useMemo(() => {
    const planStatus = status?.plan_status ?? null;
    return {
      status,
      planStatus,
      loading,
      error: status ? null : error,
      /** Null until the first successful load, so screens can hold rather than flash a paywall. */
      entitled: planStatus === null ? null : isEntitled(planStatus),
      needsOnboarding: Boolean(status?.needsOnboarding),
      refresh,
      refreshUntilChanged,
      openBilling,
    };
  }, [status, loading, error, refresh, refreshUntilChanged, openBilling]);

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
};

export const usePlan = () => {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used inside <PlanProvider>');
  return ctx;
};
