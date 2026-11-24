import { dayKey, repeatDays, repeatId } from './book.js';

/** Local SQLite records shared by the book provider and persistence checks. */
export const ENTRY_COLS = ['entryId', 'kind', 'date', 'amount', 'mode', 'partyId', 'category', 'items', 'billNo', 'discount', 'gstRate', 'label', 'note', 'updatedAt', 'deleted'];
export const PARTY_COLS = ['partyId', 'name', 'mobile', 'partyType', 'dueDate', 'shareToken', 'note', 'updatedAt', 'deleted'];
export const STAFF_COLS = ['staffId', 'name', 'mobile', 'wageType', 'wage', 'note', 'updatedAt', 'deleted'];
export const ATTENDANCE_COLS = ['attendanceId', 'staffId', 'date', 'status', 'updatedAt', 'deleted'];

/** Every synced table, by the record `type` the server uses and the key its rows travel under. */
export const TABLES = {
  party: { table: 'parties', cols: PARTY_COLS, key: 'parties' },
  entry: { table: 'entries', cols: ENTRY_COLS, key: 'entries' },
  staff: { table: 'staff', cols: STAFF_COLS, key: 'staff' },
  attendance: { table: 'attendance', cols: ATTENDANCE_COLS, key: 'attendance' },
};

export const SCHEMA = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS entries (
    entryId TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, date TEXT NOT NULL, amount INTEGER NOT NULL,
    mode TEXT, partyId TEXT, category TEXT, items TEXT, billNo TEXT, discount INTEGER, gstRate INTEGER, label TEXT,
    note TEXT, updatedAt TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS entries_date ON entries (date);
  CREATE INDEX IF NOT EXISTS entries_party ON entries (partyId);
  CREATE TABLE IF NOT EXISTS parties (
    partyId TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, mobile TEXT, partyType TEXT, dueDate TEXT, shareToken TEXT,
    note TEXT, updatedAt TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS staff (
    staffId TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, mobile TEXT, wageType TEXT NOT NULL, wage INTEGER NOT NULL,
    note TEXT, updatedAt TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS attendance (
    attendanceId TEXT PRIMARY KEY NOT NULL, staffId TEXT NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL,
    updatedAt TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS attendance_date ON attendance (date);
  CREATE INDEX IF NOT EXISTS attendance_staff ON attendance (staffId, date);
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT);
  -- Kept on this phone only, never synced: receipt photos, and monthly expenses to repeat.
  CREATE TABLE IF NOT EXISTS receipts (entryId TEXT PRIMARY KEY NOT NULL, uri TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS repeats (
    templateId TEXT PRIMARY KEY NOT NULL, entry TEXT NOT NULL, day INTEGER NOT NULL, startMonth TEXT NOT NULL
  );
`;

/** Columns added after the first release, by table. */
const ADDED = {
  entries: [['items', 'TEXT'], ['billNo', 'TEXT'], ['discount', 'INTEGER'], ['gstRate', 'INTEGER'], ['label', 'TEXT']],
  parties: [['partyType', 'TEXT'], ['dueDate', 'TEXT'], ['shareToken', 'TEXT']],
};

/**
 * Books opened by an earlier app version lack the newer columns. Adding them is the whole
 * upgrade: old rows keep a null, which reads as "not set" (no items, a customer, no due date).
 */
export const migrate = async (db) => {
  for (const [table, added] of Object.entries(ADDED)) {
    const have = new Set((await db.getAllAsync(`PRAGMA table_info(${table})`)).map((c) => c.name));
    for (const [col, type] of added) if (!have.has(col)) await db.runAsync(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  }
};

/** Columns that hold a list, kept as JSON text in SQLite. */
const JSON_COLS = new Set(['items']);
const fromColumn = (col, value) => {
  if (!JSON_COLS.has(col) || typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
};
const toColumn = (col, value) => (JSON_COLS.has(col) && value != null && typeof value !== 'string' ? JSON.stringify(value) : value);

/** A stored row with its lists decoded, for the screens. */
export const decodeRow = (row) => (row && typeof row.items === 'string' ? { ...row, items: fromColumn('items', row.items) } : row);

/** A row as the API wants it: no local flags, no nulls for absent optional fields. */
export const toWire = (row, cols) => {
  const out = {};
  for (const col of cols) {
    const value = fromColumn(col, row[col]);
    if (value !== null && value !== undefined) out[col] = value;
  }
  out.deleted = Boolean(row.deleted);
  return out;
};

export const upsert = (db, table, cols, record, dirty) => {
  const values = cols.map((c) => (c === 'deleted' ? (record.deleted ? 1 : 0) : toColumn(c, record[c]) ?? null));
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


/**
 * Writes this month's (and any missed month's) copy of each monthly expense set up on this
 * phone. Each copy's id is fixed per month (book.js repeatId), so running again never doubles
 * one, and a copy the owner deleted stays deleted.
 * ponytail: templates live on this phone only; syncing them needs a server record type.
 */
export const runRepeats = async (db, today = dayKey()) => {
  let made = 0;
  for (const r of await db.getAllAsync('SELECT * FROM repeats')) {
    const entry = JSON.parse(r.entry);
    for (const date of repeatDays(r.startMonth, r.day, today)) {
      const entryId = repeatId(r.templateId, date.slice(0, 7));
      if (await db.getFirstAsync('SELECT 1 AS found FROM entries WHERE entryId = ?', [entryId])) continue;
      await saveLocal(db, 'entries', ENTRY_COLS, { ...entry, entryId, date, deleted: false });
      made += 1;
    }
  }
  return made;
};
