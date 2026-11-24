import { balanceOf, billDay, billNumber, gstSummary, monthSummary, phoneCode, summarize, withRunningBalance } from './book.js';
import { decodeRow } from './bookStore.js';

/**
 * Reads for the bill book screens. SQL only groups and sums; what the sums mean (what is
 * money in, what a customer owes) is decided once, in book.js, where it is tested.
 */

const GROUPS = 'SELECT kind, mode, SUM(amount) AS total FROM entries WHERE deleted = 0';

/** One day: its totals, the balance it opened with and closed on, and its entries. */
export const readDay = async (db, date) => {
  const today = summarize(await db.getAllAsync(`${GROUPS} AND date = ? GROUP BY kind, mode`, [date]));
  const before = summarize(await db.getAllAsync(`${GROUPS} AND date < ? GROUP BY kind, mode`, [date]));
  const entries = await db.getAllAsync(
    `SELECT e.*, p.name AS partyName FROM entries e LEFT JOIN parties p ON p.partyId = e.partyId
     WHERE e.deleted = 0 AND e.date = ? ORDER BY e.entryId`,
    [date],
  ).then((rows) => rows.map(decodeRow));
  const openingBalance = before.net;
  return { ...today, openingBalance, closingBalance: openingBalance + today.net, entries };
};

/** Every khata customer with what they owe, largest dues first. */
export const readParties = async (db) => {
  const parties = await db.getAllAsync('SELECT * FROM parties WHERE deleted = 0');
  const groups = await db.getAllAsync(
    `SELECT partyId, kind, mode, SUM(amount) AS total, MAX(date) AS lastDate FROM entries
     WHERE deleted = 0 AND partyId IS NOT NULL GROUP BY partyId, kind, mode`,
  );
  return parties
    .map((p) => {
      const mine = groups.filter((g) => g.partyId === p.partyId);
      const lastDate = mine.reduce((max, g) => (!max || g.lastDate > max ? g.lastDate : max), null);
      return { ...p, balance: balanceOf(mine), lastDate };
    })
    .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
};

/** Parties deleted from the khata, newest first, so a mistaken delete can be undone. */
export const readDeletedParties = (db) =>
  db.getAllAsync('SELECT * FROM parties WHERE deleted = 1 ORDER BY updatedAt DESC LIMIT 30');

export const readParty = async (db, partyId) => {
  const party = await db.getFirstAsync('SELECT * FROM parties WHERE partyId = ?', [partyId]);
  if (!party) return null;
  const entries = await db.getAllAsync(
    'SELECT * FROM entries WHERE deleted = 0 AND partyId = ? ORDER BY date DESC, entryId DESC',
    [partyId],
  ).then((rows) => withRunningBalance(rows.map(decodeRow)));
  return { ...party, balance: entries[0]?.balanceAfter ?? 0, entries };
};

export const readEntry = (db, entryId) => db.getFirstAsync('SELECT * FROM entries WHERE entryId = ?', [entryId]).then(decodeRow);

/** Everyone on the staff list, by name. */
export const readStaff = (db) =>
  db.getAllAsync('SELECT * FROM staff WHERE deleted = 0 ORDER BY name COLLATE NOCASE');

/** The register for one day: every person on the staff list and how they are marked, if at all. */
export const readRegister = async (db, date) => {
  const staff = await readStaff(db);
  const marks = await db.getAllAsync('SELECT staffId, status FROM attendance WHERE deleted = 0 AND date = ?', [date]);
  const byStaff = new Map(marks.map((m) => [m.staffId, m.status]));
  return staff.map((s) => ({ ...s, status: byStaff.get(s.staffId) ?? null }));
};

/** One person's month: their marks by day and what the month comes to. */
export const readStaffMonth = async (db, staffId, month) => {
  const staff = await db.getFirstAsync('SELECT * FROM staff WHERE staffId = ?', [staffId]);
  if (!staff) return null;
  const marks = await db.getAllAsync(
    "SELECT date, status FROM attendance WHERE deleted = 0 AND staffId = ? AND date LIKE ? ORDER BY date",
    [staffId, `${month}-%`],
  );
  return { staff, marks: Object.fromEntries(marks.map((m) => [m.date, m.status])), ...monthSummary(staff, marks, month) };
};

/**
 * A stretch of days (a week, a month) for reports and exports: what came in and went out,
 * the cash it opened and closed on, each day's line, and every entry for the export.
 */
export const readRange = async (db, from, to) => {
  const opening = summarize(await db.getAllAsync(`${GROUPS} AND date < ? GROUP BY kind, mode`, [from])).net;
  const groups = await db.getAllAsync(
    'SELECT date, kind, mode, SUM(amount) AS total FROM entries WHERE deleted = 0 AND date BETWEEN ? AND ? GROUP BY date, kind, mode',
    [from, to],
  );
  let running = opening;
  const days = [...new Set(groups.map((g) => g.date))].sort().map((date) => {
    const day = summarize(groups.filter((g) => g.date === date));
    const open = running;
    running += day.net;
    return { date, ...day, openingBalance: open, closingBalance: running };
  });
  const expensesBy = await db.getAllAsync(
    `SELECT category, label, SUM(amount) AS total FROM entries
     WHERE deleted = 0 AND kind = 'expense' AND date BETWEEN ? AND ? GROUP BY category, label ORDER BY total DESC`,
    [from, to],
  );
  const purchases = await db.getFirstAsync(
    `SELECT COALESCE(SUM(e.amount), 0) AS total FROM entries e JOIN parties p ON p.partyId = e.partyId
     WHERE e.deleted = 0 AND e.kind = 'due' AND p.partyType = 'supplier' AND e.date BETWEEN ? AND ?`,
    [from, to],
  );
  const entries = await db.getAllAsync(
    `SELECT e.*, p.name AS partyName, p.partyType AS partyType FROM entries e LEFT JOIN parties p ON p.partyId = e.partyId
     WHERE e.deleted = 0 AND e.date BETWEEN ? AND ? ORDER BY e.date, e.entryId`,
    [from, to],
  ).then((rows) => rows.map(decodeRow));
  return { from, to, opening, closing: running, totals: summarize(groups), days, expensesBy, purchases: Number(purchases?.total ?? 0), entries, gst: gstSummary(entries) };
};

/** The owner's own expense names, most used first, for one-tap reuse. */
export const readExpenseLabels = (db) =>
  db.getAllAsync(
    "SELECT label FROM entries WHERE deleted = 0 AND kind = 'expense' AND label IS NOT NULL GROUP BY label ORDER BY COUNT(*) DESC LIMIT 8",
  ).then((rows) => rows.map((r) => r.label));

/** This phone's bill-number code for the store, made on first use and kept in the book. */
export const readPhoneCode = async (db, make = phoneCode) => {
  const row = await db.getFirstAsync("SELECT value FROM meta WHERE key = 'phoneCode'");
  if (row?.value) return row.value;
  const code = make();
  await db.runAsync("INSERT OR IGNORE INTO meta (key, value) VALUES ('phoneCode', ?)", [code]);
  return (await db.getFirstAsync("SELECT value FROM meta WHERE key = 'phoneCode'")).value;
};

/**
 * The next bill number for a day on this phone: one past the highest this phone has used,
 * deleted bills included, so a number is never printed twice.
 */
export const nextBillNumber = async (db, date, make) => {
  const code = await readPhoneCode(db, make);
  const rows = await db.getAllAsync("SELECT billNo FROM entries WHERE kind = 'sale' AND billNo LIKE ?", [`${billDay(date)}-${code}-%`]);
  const used = rows.map((r) => Number(String(r.billNo).split('-').pop())).filter(Number.isFinite);
  return billNumber(date, used.length ? Math.max(...used) : 0, code);
};

export const readReceipt = (db, entryId) =>
  db.getFirstAsync('SELECT uri FROM receipts WHERE entryId = ?', [entryId]).then((r) => r?.uri ?? null);

/** Monthly expenses set up on this phone. */
export const readRepeats = (db) =>
  db.getAllAsync('SELECT * FROM repeats ORDER BY day').then((rows) => rows.map((r) => ({ ...r, entry: JSON.parse(r.entry) })));

/**
 * What was paid at the counter on a part-credit bill: the payment saved with it (note
 * "Bill <number>"), or null. Shown on the bill so the customer sees what is still owed.
 */
export const readPaidWithBill = async (db, entry) => {
  if (!entry?.partyId || !entry.billNo || entry.mode !== 'credit') return null;
  const row = await db.getFirstAsync(
    "SELECT SUM(amount) AS amount, MAX(mode) AS mode FROM entries WHERE deleted = 0 AND kind = 'collection' AND partyId = ? AND note = ?",
    [entry.partyId, `Bill ${entry.billNo}`],
  );
  return row?.amount ? { amount: Number(row.amount), mode: row.mode } : null;
};

/**
 * Search the whole book: party name, bill number, items, note and expense name, or an exact
 * amount when the search is a number ("250" finds ₹250 entries). Newest first, at most 100.
 */
export const searchEntries = async (db, query) => {
  const q = String(query ?? '').trim();
  if (!q) return [];
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rupees = /^\d+(\.\d{1,2})?$/.test(q) ? Math.round(Number(q) * 100) : -1;
  return db.getAllAsync(
    `SELECT e.*, p.name AS partyName, p.partyType AS partyType FROM entries e LEFT JOIN parties p ON p.partyId = e.partyId
     WHERE e.deleted = 0 AND (
       p.name LIKE ? ESCAPE '\\' OR e.note LIKE ? ESCAPE '\\' OR e.billNo LIKE ? ESCAPE '\\'
       OR e.items LIKE ? ESCAPE '\\' OR e.label LIKE ? ESCAPE '\\' OR e.amount = ?)
     ORDER BY e.date DESC, e.entryId DESC LIMIT 100`,
    [like, like, like, like, like, rupees],
  ).then((rows) => rows.map(decodeRow));
};
