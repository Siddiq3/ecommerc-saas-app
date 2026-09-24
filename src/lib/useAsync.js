import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Data fetching for a screen: load, reload, pull-to-refresh, and cancel on unmount.
 *
 * Small on purpose. The app's screens each read one or two endpoints and re-read them on
 * focus; a full query cache would buy invalidation we would rarely use, at the cost of a
 * dependency every future contributor has to learn.
 */
export const useAsync = (fn, deps = [], { immediate = true } = {}) => {
  const [state, setState] = useState({ data: null, error: null, loading: immediate });
  const [refreshing, setRefreshing] = useState(false);

  const mounted = useRef(true);
  // Only the newest run may write to state; an earlier, slower response is discarded.
  const runId = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // The caller owns the dependency list, exactly as useCallback's own contract works.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const callback = useCallback(fn, deps);

  const run = useCallback(
    async ({ refresh = false } = {}) => {
      const id = ++runId.current;
      if (refresh) setRefreshing(true);
      else setState((prev) => ({ ...prev, loading: true }));

      try {
        const data = await callback();
        if (!mounted.current || id !== runId.current) return null;
        setState({ data, error: null, loading: false });
        return data;
      } catch (error) {
        if (!mounted.current || id !== runId.current) return null;
        setState((prev) => ({ data: refresh ? prev.data : null, error, loading: false }));
        return null;
      } finally {
        if (mounted.current && id === runId.current) setRefreshing(false);
      }
    },
    [callback],
  );

  useEffect(() => {
    if (immediate) run();
    // `run` changes whenever the caller's deps change, which is exactly when to refetch.
  }, [run, immediate]);

  return {
    ...state,
    refreshing,
    reload: () => run(),
    onRefresh: () => run({ refresh: true }),
    setData: (updater) =>
      setState((prev) => ({ ...prev, data: typeof updater === 'function' ? updater(prev.data) : updater })),
  };
};

/**
 * A one-shot action with its own pending and error state — the counterpart to useAsync
 * for buttons that write.
 */
export const useAction = (fn) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const run = useCallback(
    async (...args) => {
      if (pending) return null;
      setPending(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (err) {
        if (mounted.current) setError(err);
        throw err;
      } finally {
        if (mounted.current) setPending(false);
      }
    },
    [fn, pending],
  );

  return { run, pending, error, clearError: () => setError(null) };
};

/**
 * Re-runs `reload` when a screen is focused again, but not on its first focus — the
 * initial fetch has already happened by then, and firing both doubles every cold load.
 */
export const useRefreshOnFocus = (reload) => {
  const firstFocus = useRef(true);
  const saved = useRef(reload);
  saved.current = reload;

  return useCallback(() => {
    if (firstFocus.current) {
      firstFocus.current = false;
      return;
    }
    saved.current?.();
  }, []);
};
