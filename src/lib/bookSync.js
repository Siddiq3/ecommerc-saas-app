import { resumeFrom } from './book.js';
import { TABLES, toWire, upsert, withBookTransaction } from './bookStore.js';

const TYPES = Object.keys(TABLES);

export const pendingCount = async (db) => {
  let n = 0;
  for (const type of TYPES) n += (await db.getFirstAsync(`SELECT COUNT(*) AS n FROM ${TABLES[type].table} WHERE dirty = 1`))?.n ?? 0;
  return n;
};

/** Stores a record from the server in its table. A type this app version does not know is skipped. */
const storeIncoming = (tx, record) => {
  const spec = TABLES[record.type];
  return spec ? upsert(tx, spec.table, spec.cols, record, false) : undefined;
};

/**
 * Only acknowledge the revision sent; a later local edit must stay dirty.
 * `sent` maps each record type to the rows pushed: `{ entry: rows, party: rows, ... }`.
 */
export const acknowledge = async (db, sent, conflicts = []) => {
  await withBookTransaction(db, async (tx) => {
    for (const [type, rows] of Object.entries(sent)) {
      const { table, cols } = TABLES[type];
      for (const r of rows) await tx.runAsync(`UPDATE ${table} SET dirty = 0 WHERE ${cols[0]} = ? AND updatedAt = ?`, [r[cols[0]], r.updatedAt]);
    }
    for (const record of conflicts) await storeIncoming(tx, record);
  });
};

/** Push local revisions, then pull remote changes. Network calls never hold a SQL lock. */
export const syncBook = async (db, api, businessId, active = () => true) => {
  while (active()) {
    // Up to 100 rows a request across every table, customers first so a bill's customer lands with it.
    const sent = {};
    let room = 100;
    for (const type of TYPES) {
      if (room <= 0) break;
      const rows = await db.getAllAsync(`SELECT * FROM ${TABLES[type].table} WHERE dirty = 1 LIMIT ${room}`);
      if (rows.length) { sent[type] = rows; room -= rows.length; }
    }
    if (room === 100) break;
    const body = Object.fromEntries(TYPES.map((type) => [TABLES[type].key, (sent[type] ?? []).map((r) => toWire(r, TABLES[type].cols))]));
    const result = await api.sync(businessId, body);
    if (!active()) return;
    await acknowledge(db, sent, result?.conflicts);
  }

  // A book last synced by an app version without staff attendance moved its position past the
  // staff records it was not sent. Read the feed once from the start to pick them up; records
  // already on the phone are simply stored again.
  const feed = (await db.getFirstAsync("SELECT value FROM meta WHERE key = 'feed'"))?.value;
  let since = feed === 'staff' ? resumeFrom((await db.getFirstAsync("SELECT value FROM meta WHERE key = 'next'"))?.value) : undefined;
  while (active()) {
    const page = await api.changes(businessId, { since, limit: 200, include: 'staff' });
    if (!active()) return;
    await withBookTransaction(db, async (tx) => {
      // The upsert checks dirty/timestamps atomically, including conflicts from a push.
      for (const record of page.items) await storeIncoming(tx, record);
      if (page.next) await tx.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES ('next', ?)", [page.next]);
      await tx.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES ('feed', 'staff')");
    });
    if (!page.more) break;
    if (!page.next || page.next === since) throw new Error('The book change feed did not advance.');
    since = page.next;
  }
};
