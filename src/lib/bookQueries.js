import { balanceOf, monthSummary, summarize } from './book.js';
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
    `SELECT partyId, kind, mode, SUM(amount) AS total FROM entries
     WHERE deleted = 0 AND partyId IS NOT NULL GROUP BY partyId, kind, mode`,
  );
  return parties
    .map((p) => ({ ...p, balance: balanceOf(groups.filter((g) => g.partyId === p.partyId)) }))
    .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
};

export const readParty = async (db, partyId) => {
  const party = await db.getFirstAsync('SELECT * FROM parties WHERE partyId = ?', [partyId]);
  if (!party) return null;
  const entries = await db.getAllAsync(
    'SELECT * FROM entries WHERE deleted = 0 AND partyId = ? ORDER BY date DESC, entryId DESC',
    [partyId],
  ).then((rows) => rows.map(decodeRow));
  return { ...party, balance: balanceOf(entries.map((e) => ({ ...e, total: e.amount }))), entries };
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
