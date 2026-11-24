import { partyEffect } from '@storeflick/validation';

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
  const paidNow = (kind) => sum((g) => g.kind === kind && g.mode !== 'credit');
  const all = (kind) => sum((g) => g.kind === kind);
  const purchases = { paid: paidNow('purchase'), total: all('purchase') };
  const salesReturns = { paid: paidNow('salesReturn'), total: all('salesReturn') };
  const purchaseReturns = { paid: paidNow('purchaseReturn'), total: all('purchaseReturn') };
  const collections = sum((g) => g.kind === 'collection');
  const expenses = sum((g) => g.kind === 'expense');
  const opening = sum((g) => g.kind === 'opening');
  // Cash and UPI only: purchases paid out, refunds given for returns, refunds from suppliers.
  const net = sales.cash + sales.upi + collections + opening - expenses
    - purchases.paid - salesReturns.paid + purchaseReturns.paid;
  return { sales, collections, expenses, opening, purchases, salesReturns, purchaseReturns, net };
};

/**
 * A party's balance. For a customer: credit bills and carried-over dues, less what they paid.
 * For a supplier: goods bought on credit (`due`), less what the shop paid them (an expense
 * naming the supplier). Positive means the money is owed the usual way round.
 */
export const balanceOf = (groups = []) =>
  groups.reduce((acc, g) => acc + partyEffect(g) * Number(g.total ?? 0), 0);

/**
 * Which khata column an entry sits in: 'gave' (money or goods went out to them) or 'got'.
 * It follows from what the entry does to the balance: with a customer, adding to what they owe
 * is something the shop gave; with a supplier, adding to what the shop owes is goods it got.
 */
export const ledgerSide = (entry, partyType) => {
  const effect = partyEffect(entry);
  if (!effect) return null;
  return (effect > 0) === (partyType === 'supplier') ? 'got' : 'gave';
};

/**
 * A customer's entries, newest first, each with `balanceAfter`: what they owed once that
 * entry was written, like the running balance column of a paper khata.
 */
export const withRunningBalance = (entries = []) => {
  let balance = balanceOf(entries.map((e) => ({ ...e, total: e.amount })));
  return entries.map((e) => {
    const after = balance;
    balance -= balanceOf([{ ...e, total: e.amount }]);
    return { ...e, balanceAfter: after };
  });
};

/** A phone-contact number ("+91 98765-43210", "(0) 98765 43210") as the 10 digits the khata keeps. */
export const contactMobile = (raw = '') => {
  const digits = String(raw).replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

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

/**
 * A printed bill number: the day, this phone's code and its count for the day, `231126-K7Q-4`.
 * The code keeps two phones billing offline on the same day from ever printing the same
 * number; each phone counts only its own bills.
 */
export const billDay = (date) => date.slice(2).split('-').reverse().join('');
export const billNumber = (date, countSoFar, code) => `${billDay(date)}-${code}-${countSoFar + 1}`;

/** Three Crockford letters, made once per phone per store: 32,768 possible codes. */
export const phoneCode = (random = Math.random) => Array.from({ length: 3 }, () => ALPHABET[Math.floor(random() * 32)]).join('');

/** A customer's ledger link token: 26 random base32 characters. */
export const shareToken = (randomBytes) => {
  const bytes = randomBytes(26);
  let out = '';
  for (let i = 0; i < 26; i += 1) out += ALPHABET[bytes[i] % 32];
  return out;
};

/**
 * The id of a monthly repeat of an expense: the template's id with the month folded into the
 * random half, so one month's repeat is always the same record however often the book opens.
 */
export const repeatId = (templateId, month) => {
  let h = 2166136261;
  for (const c of `${templateId}${month}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  let tail = '';
  for (let i = 0; i < 16; i += 1) { tail += ALPHABET[h % 32]; h = Math.imul(h ^ i, 2654435761) >>> 0; }
  return templateId.slice(0, 10) + tail;
};

/**
 * The days a monthly expense falls due between the month after it was set up and `today`,
 * on its day of the month (or the month's last day, for the 31st in a short month).
 */
export const repeatDays = (startMonth, day, today) => {
  const out = [];
  for (let m = shiftMonth(startMonth, 1); m <= monthOf(today); m = shiftMonth(m, 1)) {
    const date = `${m}-${String(Math.min(day, daysInMonth(m))).padStart(2, '0')}`;
    if (date <= today) out.push(date);
  }
  return out;
};

/** When an entry was first written: the time half of its ULID id (ms since 1970). */
export const entryTime = (entryId) => {
  let t = 0;
  for (const c of String(entryId).slice(0, 10)) {
    const v = ALPHABET.indexOf(c);
    if (v < 0) return null;
    t = t * 32 + v;
  }
  return new Date(t);
};

/**
 * How long ago a day was, for khata rows: { unit: 'today' | 'yesterday' | 'days' | 'weeks' |
 * 'months', n }. Whole calendar days between `day` and `today`, both YYYY-MM-DD.
 */
export const dayAge = (day, today = dayKey()) => {
  const at = (d) => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd); };
  const n = Math.max(0, Math.round((at(today) - at(day)) / 86_400_000));
  if (n === 0) return { unit: 'today', n };
  if (n === 1) return { unit: 'yesterday', n };
  if (n < 7) return { unit: 'days', n };
  if (n < 30) return { unit: 'weeks', n: Math.floor(n / 7) };
  return { unit: 'months', n: Math.floor(n / 30) };
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

/** The Monday 10 am after `now` (today, if it is Monday before 10). */
export const nextMondayMorning = (now = new Date()) => {
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0, 0);
  const days = (8 - at.getDay()) % 7; // 0 on a Monday
  at.setDate(at.getDate() + days);
  if (at <= now) at.setDate(at.getDate() + 7);
  return at;
};


/** How much of a GST-inclusive amount is tax: ₹105 at 5% is ₹100 taxable and ₹5 tax. */
export const taxInside = (amount, rate) => {
  const taxable = Math.round((amount * 100) / (100 + rate));
  return { taxable, tax: amount - taxable };
};

/**
 * The GST in a stretch of the book, for the accountant: tax collected on bills (less sales
 * returns) and tax paid on purchases (less returns to suppliers), by rate, and the difference.
 * Only entries that carry a GST rate count; prices include the tax, as on the bills.
 * A summary to file from, not a GSTR-1: it has no HSN codes or customers' GSTINs.
 */
export const gstSummary = (entries = []) => {
  const SIGN = { sale: ['output', 1], salesReturn: ['output', -1], purchase: ['input', 1], purchaseReturn: ['input', -1] };
  const rates = new Map();
  const totals = { output: { taxable: 0, tax: 0 }, input: { taxable: 0, tax: 0 } };
  for (const e of entries) {
    const [side, sign] = SIGN[e.kind] ?? [];
    if (!side || !e.gstRate || e.deleted) continue;
    const { taxable, tax } = taxInside(e.amount, e.gstRate);
    const row = rates.get(e.gstRate) ?? { rate: e.gstRate, output: { taxable: 0, tax: 0 }, input: { taxable: 0, tax: 0 } };
    row[side].taxable += sign * taxable;
    row[side].tax += sign * tax;
    totals[side].taxable += sign * taxable;
    totals[side].tax += sign * tax;
    rates.set(e.gstRate, row);
  }
  return { rates: [...rates.values()].sort((a, b) => a.rate - b.rate), ...totals, payable: totals.output.tax - totals.input.tax };
};
