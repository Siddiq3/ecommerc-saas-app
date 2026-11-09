/** Local SQLite records shared by the book provider and persistence checks. */
export const ENTRY_COLS = ['entryId', 'kind', 'date', 'amount', 'mode', 'partyId', 'category', 'note', 'updatedAt', 'deleted'];
export const PARTY_COLS = ['partyId', 'name', 'mobile', 'note', 'updatedAt', 'deleted'];

export const SCHEMA = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS entries (
    entryId TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, date TEXT NOT NULL, amount INTEGER NOT NULL,
    mode TEXT, partyId TEXT, category TEXT, note TEXT, updatedAt TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS entries_date ON entries (date);
  CREATE INDEX IF NOT EXISTS entries_party ON entries (partyId);
  CREATE TABLE IF NOT EXISTS parties (
    partyId TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, mobile TEXT, note TEXT, updatedAt TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT);
`;

/** A row as the API wants it: no local flags, no nulls for absent optional fields. */
export const toWire = (row, cols) => {
  const out = {};
  for (const col of cols) if (row[col] !== null && row[col] !== undefined) out[col] = row[col];
  out.deleted = Boolean(row.deleted);
  return out;
};

export const upsert = (db, table, cols, record, dirty) => {
  const values = cols.map((c) => (c === 'deleted' ? (record.deleted ? 1 : 0) : record[c] ?? null));
  return db.runAsync(
    `INSERT INTO ${table} (${cols.join(', ')}, dirty) VALUES (${cols.map(() => '?').join(', ')}, ?)
     ON CONFLICT(${cols[0]}) DO UPDATE SET
       ${cols.slice(1).map((col) => `${col} = excluded.${col}`).join(', ')}, dirty = excluded.dirty
     ${dirty ? '' : `WHERE ${table}.dirty = 0 OR excluded.updatedAt >= ${table}.updatedAt`}`,
    [...values, dirty ? 1 : 0],
  );
};

/** Serialize local edits and stamp each revision later than the previous one. */
export const saveLocal = (db, table, cols, record, now = Date.now()) =>
  withBookTransaction(db, async (tx) => {
    const previous = await tx.getFirstAsync(`SELECT updatedAt FROM ${table} WHERE ${cols[0]} = ?`, [record[cols[0]]]);
    const updatedAt = new Date(Math.max(now, (Date.parse(previous?.updatedAt) || 0) + 1)).toISOString();
    await upsert(tx, table, cols, { ...record, updatedAt }, true);
  });

// Expo opens a separate connection for each exclusive transaction. Queue our writers
// so a sync acknowledgement cannot collide with a merchant saving an entry.
const writers = new WeakMap();
export const withBookTransaction = (db, task) => {
  const work = (writers.get(db) ?? Promise.resolve()).then(() => db.withExclusiveTransactionAsync(task));
  writers.set(db, work.catch(() => undefined));
  return work;
};

