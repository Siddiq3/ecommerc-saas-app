import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { book as bookApi } from '../api/endpoints.js';
import { ulid } from '../lib/book.js';
import { useAuth } from './auth.jsx';
import { pendingCount, syncBook } from '../lib/bookSync.js';
import { ENTRY_COLS, PARTY_COLS, SCHEMA, migrate, saveLocal } from '../lib/bookStore.js';

/**
 * The bill book's copy on this phone, and its sync with the server.
 *
 * Every write lands in SQLite first and is marked dirty, so adding a bill never waits for
 * the network. Sync pushes dirty rows, then pulls whatever other phones stored since the
 * last pull. One database per store: a phone signed in to another store never opens it.
 */

export const newBookId = () => ulid((n) => Crypto.getRandomBytes(n));

const BookContext = createContext(null);

export const BookProvider = ({ children }) => {
  const { businessId } = useAuth();
  return <BookSession key={businessId ?? 'signed-out'} businessId={businessId}>{children}</BookSession>;
};

const BookSession = ({ children, businessId }) => {
  const [db, setDb] = useState(null);
  const [version, setVersion] = useState(0);
  const [sync, setSync] = useState({ state: 'syncing', pending: 0, lastSyncedAt: null });
  const running = useRef(null);
  const active = useRef(true);
  const timer = useRef(null);

  useEffect(() => {
    active.current = true;
    let opened;
    let cancelled = false;
    const opening = (async () => {
      if (!businessId) return;
      opened = await SQLite.openDatabaseAsync(`book-${businessId}.db`);
      await opened.execAsync(SCHEMA);
      await migrate(opened);
      if (!cancelled) { setDb(opened); setVersion((v) => v + 1); }
    })().catch((error) => {
      if (!cancelled) setSync({ state: 'error', pending: 0, lastSyncedAt: null, error });
    });
    return () => {
      cancelled = true;
      active.current = false;
      clearTimeout(timer.current);
      // A store change must not close a database under an in-flight transaction.
      Promise.allSettled([opening, running.current]).then(() => opened?.closeAsync()).catch(() => undefined);
    };
  }, [businessId]);

  const syncNow = useCallback(() => {
    if (!db || !businessId || !active.current || running.current) return running.current;
    setSync((s) => ({ ...s, state: 'syncing' }));
    const task = (async () => {
      try {
        await syncBook(db, bookApi, businessId, () => active.current);
        if (active.current) setSync({ state: 'idle', pending: await pendingCount(db), lastSyncedAt: new Date().toISOString() });
      } catch (error) {
        if (active.current) setSync((s) => ({ ...s, state: error?.status === 0 ? 'offline' : 'error', error }));
      } finally {
        running.current = null;
        if (active.current) setVersion((v) => v + 1);
      }
    })();
    running.current = task;
    return task;
  }, [db, businessId]);

  // Sync on open, when the app comes back to the front, and every minute while it is open.
  useEffect(() => {
    if (!db) return undefined;
    syncNow();
    const sub = AppState.addEventListener('change', (state) => state === 'active' && syncNow());
    const interval = setInterval(syncNow, 60_000);
    return () => { sub.remove(); clearInterval(interval); };
  }, [db, syncNow]);

  /** Saved on the phone at once; pushed a moment later, so a run of bills goes in one request. */
  const changed = useCallback(async () => {
    setVersion((v) => v + 1);
    setSync((s) => ({ ...s, pending: s.pending + 1 }));
    clearTimeout(timer.current);
    timer.current = setTimeout(syncNow, 1500);
  }, [syncNow]);

  const value = useMemo(() => ({
    db,
    version,
    sync,
    syncNow,
    saveEntry: async (entry) => {
      await saveLocal(db, 'entries', ENTRY_COLS, entry);
      await changed();
    },
    deleteEntry: async (entry) => {
      await saveLocal(db, 'entries', ENTRY_COLS, { ...entry, deleted: true });
      await changed();
    },
    saveParty: async (party) => {
      await saveLocal(db, 'parties', PARTY_COLS, party);
      await changed();
    },
  }), [db, version, sync, syncNow, changed]);

  return <BookContext.Provider value={value}>{children}</BookContext.Provider>;
};

export const useBook = () => useContext(BookContext);

/**
 * Re-runs `read(db)` whenever the book changes (a save, a delete, a sync). Returns
 * `undefined` until the first read finishes.
 */
export const useBookQuery = (read, deps = []) => {
  const { db, version } = useBook();
  const [data, setData] = useState(undefined);
  useEffect(() => {
    if (!db) return undefined;
    let live = true;
    read(db).then((result) => live && setData(result)).catch(() => undefined);
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, version, ...deps]);
  return data;
};
