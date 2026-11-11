/**
 * Bill book and khata rules, as plain functions so they can be checked without a phone.
 *
 * The day works like the paper book it replaces:
 *   opening balance (yesterday's closing)
 *   + bills paid in cash or UPI + dues collected + cash the book was started with
 *   − expenses (chit, dealer payments, rent…)
 *   = closing balance, which is tomorrow's opening balance.
 * A bill on credit counts as a sale but brings in no money: it goes into the customer's
 * khata instead, and comes in as money on the day they pay it.
 */

/** Amounts are integer paise everywhere; `groups` are `{ kind, mode, total }` sums. */
export const summarize = (groups = []) => {
  const sum = (match) => groups.filter(match).reduce((acc, g) => acc + Number(g.total ?? 0), 0);
  const sales = {
    cash: sum((g) => g.kind === 'sale' && g.mode === 'cash'),
    upi: sum((g) => g.kind === 'sale' && g.mode === 'upi'),
    credit: sum((g) => g.kind === 'sale' && g.mode === 'credit'),
  };
  sales.total = sales.cash + sales.upi + sales.credit;
  const collections = sum((g) => g.kind === 'collection');
  const expenses = sum((g) => g.kind === 'expense');
  const opening = sum((g) => g.kind === 'opening');
  const net = sales.cash + sales.upi + collections + opening - expenses;
  return { sales, collections, expenses, opening, net };
};

/** What a customer owes: credit bills and carried-over dues, less what they have paid. */
export const balanceOf = (groups = []) =>
  groups.reduce((acc, g) => {
    const total = Number(g.total ?? 0);
    if ((g.kind === 'sale' && g.mode === 'credit') || g.kind === 'due') return acc + total;
    if (g.kind === 'collection') return acc - total;
    return acc;
  }, 0);

/**
 * Whether a record from the server should replace the phone's copy. The phone's copy wins
 * only while it holds an unsynced edit made later than the server's.
 */
export const takeIncoming = (local, incoming) =>
  !local || !local.dirty || String(incoming.updatedAt) >= String(local.updatedAt);

/**
 * Where to ask the change feed to resume. Two minutes earlier than the last position read,
 * because index writes can land slightly out of order; re-reading a few records is harmless.
 */
export const resumeFrom = (next) => {
  if (!next) return undefined;
  const time = Date.parse(next.split('#')[0]);
  return Number.isNaN(time) ? undefined : `${new Date(time - 120_000).toISOString()}#`;
};

/** The phone's own calendar day, as YYYY-MM-DD: the book follows the shop's clock. */
export const dayKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const shiftDay = (day, days) => {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + days));
};

/** Crockford base32 ULID: 10 characters of time, 16 of randomness. Sorts by creation time. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const ulid = (randomBytes, now = Date.now()) => {
  let time = '';
  for (let t = now, i = 0; i < 10; i += 1, t = Math.floor(t / 32)) time = ALPHABET[t % 32] + time;
  const bytes = randomBytes(16);
  let rand = '';
  for (let i = 0; i < 16; i += 1) rand += ALPHABET[bytes[i] % 32];
  return time + rand;
};

/**
 * Staff attendance. One mark per person per day, with the id `<staffId>:<date>` so marks made
 * on two phones for the same day are the same record.
 */
export const attendanceId = (staffId, date) => `${staffId}:${date}`;

/** `2026-02` → 28. */
export const daysInMonth = (month) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

/** `2026-11-10` → `2026-11`; shiftMonth('2026-01', -1) → `2025-12`. */
export const monthOf = (day) => day.slice(0, 7);
export const shiftMonth = (month, by) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * A month of one person's attendance, and what it comes to.
 *
 * Monthly salary: the full salary, less a day's pay for each absent day and half a day's pay
 * for each half day. Leave and unmarked days (weekly offs, holidays) are paid, as most shops
 * pay a monthly hand.
 * Daily wage: paid only for days worked, a full day's wage for present and half for a half day.
 * A day's pay on a monthly salary is the salary divided by the days in that month.
 */
export const monthSummary = (staff, marks, month) => {
  const counts = { present: 0, half: 0, absent: 0, leave: 0 };
  for (const mark of marks) if (mark.status in counts) counts[mark.status] += 1;
  const worked = counts.present + counts.half / 2;
  const wage = Number(staff?.wage ?? 0);
  const pay = staff?.wageType === 'daily'
    ? Math.round(wage * worked)
    : Math.max(0, Math.round(wage - (wage / daysInMonth(month)) * (counts.absent + counts.half / 2)));
  return { counts, worked, pay };
};
