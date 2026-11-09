import { balanceOf, summarize } from './book.js';

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
  );
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
  );
  return { ...party, balance: balanceOf(entries.map((e) => ({ ...e, total: e.amount }))), entries };
};

export const readEntry = (db, entryId) => db.getFirstAsync('SELECT * FROM entries WHERE entryId = ?', [entryId]);
