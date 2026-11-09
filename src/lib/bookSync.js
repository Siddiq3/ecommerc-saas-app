import { resumeFrom } from './book.js';
import { ENTRY_COLS, PARTY_COLS, toWire, upsert, withBookTransaction } from './bookStore.js';

export const pendingCount = async (db) => {
  const a = await db.getFirstAsync('SELECT COUNT(*) AS n FROM entries WHERE dirty = 1');
  const b = await db.getFirstAsync('SELECT COUNT(*) AS n FROM parties WHERE dirty = 1');
  return (a?.n ?? 0) + (b?.n ?? 0);
};

/** Only acknowledge the revision sent; a later local edit must stay dirty. */
export const acknowledge = async (db, parties, entries, conflicts = []) => {
  await withBookTransaction(db, async (tx) => {
    for (const r of parties) await tx.runAsync('UPDATE parties SET dirty = 0 WHERE partyId = ? AND updatedAt = ?', [r.partyId, r.updatedAt]);
    for (const r of entries) await tx.runAsync('UPDATE entries SET dirty = 0 WHERE entryId = ? AND updatedAt = ?', [r.entryId, r.updatedAt]);
    for (const record of conflicts) {
      const party = record.type === 'party';
      await upsert(tx, party ? 'parties' : 'entries', party ? PARTY_COLS : ENTRY_COLS, record, false);
    }
  });
};

/** Push local revisions, then pull remote changes. Network calls never hold a SQL lock. */
export const syncBook = async (db, api, businessId, active = () => true) => {
  while (active()) {
    const parties = await db.getAllAsync('SELECT * FROM parties WHERE dirty = 1 LIMIT 50');
    const entries = await db.getAllAsync(`SELECT * FROM entries WHERE dirty = 1 LIMIT ${100 - parties.length}`);
    if (!parties.length && !entries.length) break;
    const result = await api.sync(businessId, {
      parties: parties.map((r) => toWire(r, PARTY_COLS)),
      entries: entries.map((r) => toWire(r, ENTRY_COLS)),
    });
    if (!active()) return;
    await acknowledge(db, parties, entries, result?.conflicts);
  }

  let since = resumeFrom((await db.getFirstAsync("SELECT value FROM meta WHERE key = 'next'"))?.value);
  while (active()) {
    const page = await api.changes(businessId, { since, limit: 200 });
    if (!active()) return;
    await withBookTransaction(db, async (tx) => {
      for (const record of page.items) {
        const party = record.type === 'party';
        // The upsert checks dirty/timestamps atomically, including conflicts from a push.
        await upsert(tx, party ? 'parties' : 'entries', party ? PARTY_COLS : ENTRY_COLS, record, false);
      }
      if (page.next) await tx.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES ('next', ?)", [page.next]);
    });
    if (!page.more) break;
    if (!page.next || page.next === since) throw new Error('The book change feed did not advance.');
    since = page.next;
  }
};
