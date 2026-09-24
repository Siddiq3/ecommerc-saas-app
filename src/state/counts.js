import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { orders } from '../api/endpoints.js';

/**
 * Actionable order counts for the tab badge.
 *
 * Lives outside the screens because the badge has to be right whichever tab is showing,
 * and refreshes on foreground rather than on a timer: a merchant who has just put the
 * phone down does not need a poll running in their pocket.
 */
export const useOrderCounts = (businessId) => {
  const [counts, setCounts] = useState({ counts: {}, needsAttention: 0, toShip: 0 });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      const next = await orders.counts(businessId);
      if (mounted.current) setCounts(next);
    } catch {
      // A failed count is cosmetic; the badge simply keeps its last value.
    }
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });
    return () => sub.remove();
  }, [load]);

  return { ...counts, reload: load };
};
