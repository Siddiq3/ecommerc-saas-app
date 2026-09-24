import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Cursor pagination for the list screens.
 *
 * The API returns `{ items, nextCursor }`, so this keeps the accumulated pages, knows
 * when it has reached the end, and guards the two ways an infinite list goes wrong: the
 * onEndReached that fires twice before the first page lands, and the filter change that
 * arrives while an older page is still in flight.
 */
export const usePaginated = (fetchPage, deps = []) => {
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [state, setState] = useState({ loading: true, refreshing: false, loadingMore: false, error: null });

  const mounted = useRef(true);
  const runId = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // The caller owns the dependency list, exactly as useCallback's own contract works.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const callback = useCallback(fetchPage, deps);

  const load = useCallback(
    async ({ mode = 'initial' } = {}) => {
      if (inFlight.current && mode === 'more') return;

      const id = mode === 'more' ? runId.current : ++runId.current;
      inFlight.current = true;

      setState((prev) => ({
        ...prev,
        error: null,
        loading: mode === 'initial',
        refreshing: mode === 'refresh',
        loadingMore: mode === 'more',
      }));

      try {
        const page = await callback(mode === 'more' ? cursor : undefined);
        // A newer filter has superseded this request; its results are no longer wanted.
        if (!mounted.current || id !== runId.current) return;

        setItems((prev) => (mode === 'more' ? [...prev, ...(page?.items ?? [])] : page?.items ?? []));
        setCursor(page?.nextCursor ?? null);
        setState({ loading: false, refreshing: false, loadingMore: false, error: null });
      } catch (error) {
        if (!mounted.current || id !== runId.current) return;
        setState({ loading: false, refreshing: false, loadingMore: false, error });
      } finally {
        inFlight.current = false;
      }
    },
    [callback, cursor],
  );

  /* Filters changed: reset to the first page rather than appending to stale results. */
  useEffect(() => {
    setItems([]);
    setCursor(null);
    load({ mode: 'initial' });
    // `load` closes over the cursor, which changes as pages arrive; reloading on that
    // would restart the list mid-scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callback]);

  return {
    items,
    ...state,
    hasMore: Boolean(cursor),
    reload: () => load({ mode: 'initial' }),
    onRefresh: () => load({ mode: 'refresh' }),
    loadMore: () => {
      if (cursor && !inFlight.current) load({ mode: 'more' });
    },
    /** Applies a local edit so a list does not have to round-trip after an action. */
    patchItem: (key, id, changes) =>
      setItems((prev) => prev.map((item) => (item[key] === id ? { ...item, ...changes } : item))),
    removeItem: (key, id) => setItems((prev) => prev.filter((item) => item[key] !== id)),
  };
};
