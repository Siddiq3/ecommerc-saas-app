import { useCallback, useEffect, useRef, useState } from 'react';
import { products } from '../api/endpoints.js';

/** Debounced server search, one page at a time. Old searches cannot overwrite a newer one. */
export function useProductSearch(businessId, enabled = true) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState({ items: [], nextCursor: null, loading: false, error: null });
  const generation = useRef(0), pending = useRef(false), current = useRef(page);
  current.current = page;
  const fetchPage = useCallback(async (cursor, id) => {
    if (!businessId || !enabled || pending.current) return;
    pending.current = true;
    setPage(p => ({ ...p, loading: true, error: null }));
    try {
      const result = await products.list(businessId, { active: 'true', limit: 20, q: query.trim(), cursor });
      if (id !== generation.current) return;
      setPage(p => ({ items: cursor ? [...p.items, ...result.items.filter(x => !p.items.some(y => y.productId === x.productId))] : result.items,
        nextCursor: result.nextCursor, loading: false, error: null }));
    } catch (error) {
      if (id === generation.current) setPage(p => ({ ...p, loading: false, error }));
    } finally { if (id === generation.current) pending.current = false; }
  }, [businessId, enabled, query]);
  useEffect(() => {
    const counter = generation;
    const id = ++counter.current;
    pending.current = false;
    setPage({ items: [], nextCursor: null, loading: enabled, error: null });
    const timer = setTimeout(() => { void fetchPage(null, id); }, 300);
    return () => { clearTimeout(timer); counter.current++; };
  }, [fetchPage, enabled]);
  const loadMore = () => { if (current.current.nextCursor && !current.current.error) void fetchPage(current.current.nextCursor, generation.current); };
  const retry = () => { void fetchPage(current.current.nextCursor, generation.current); };
  return { ...page, query, setQuery, loadMore, retry };
}
