import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { summarize, balanceOf, takeIncoming, resumeFrom, shiftDay, ulid, monthSummary, daysInMonth, shiftMonth, attendanceId } from '../src/lib/book.js';
import { bookAttendanceSchema, bookStaffSchema } from '../packages/validation/src/book.js';
import { bookEntrySchema, itemTotal, itemsTotal } from '../packages/validation/src/book.js';

// A day like the paper book: cash and UPI bills and dues collected come in, expenses go out,
// a credit bill is a sale but no money.
const day = summarize([
  { kind: 'sale', mode: 'cash', total: 50000 },
  { kind: 'sale', mode: 'upi', total: 20000 },
  { kind: 'sale', mode: 'credit', total: 15000 },
  { kind: 'collection', mode: 'cash', total: 5000 },
  { kind: 'expense', mode: 'cash', total: 30000 },
  { kind: 'due', total: 88000 },
]);
assert.deepEqual(day.sales, { cash: 50000, upi: 20000, credit: 15000, total: 85000 });
assert.equal(day.net, 50000 + 20000 + 5000 - 30000, 'credit bills and old dues bring in no money');
assert.equal(summarize([{ kind: 'opening', total: 100000 }]).net, 100000, 'starting cash counts as money in');
assert.equal(summarize([]).net, 0);

// A customer's dues: credit bills and carried-over dues, less payments.
assert.equal(balanceOf([
  { kind: 'sale', mode: 'credit', total: 15000 },
  { kind: 'due', total: 10000 },
  { kind: 'collection', mode: 'upi', total: 5000 },
  { kind: 'sale', mode: 'cash', total: 70000 },
]), 20000);

// Sync merge: an unsynced later edit on the phone survives; otherwise the server copy wins.
assert.equal(takeIncoming(null, { updatedAt: 'b' }), true);
assert.equal(takeIncoming({ dirty: 0, updatedAt: 'z' }, { updatedAt: 'a' }), true);
assert.equal(takeIncoming({ dirty: 1, updatedAt: '2026-11-08T10:05:00.000Z' }, { updatedAt: '2026-11-08T10:01:00.000Z' }), false);
assert.equal(takeIncoming({ dirty: 1, updatedAt: '2026-11-08T10:01:00.000Z' }, { updatedAt: '2026-11-08T10:05:00.000Z' }), true);

assert.equal(resumeFrom('2026-11-08T10:05:00.000Z#01JC000000000000000000000A'), '2026-11-08T10:03:00.000Z#');
assert.equal(resumeFrom(null), undefined);
assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');

// Staff attendance: what a month comes to.
assert.equal(daysInMonth('2026-02'), 28);
assert.equal(daysInMonth('2028-02'), 29);
assert.equal(shiftMonth('2026-01', -1), '2025-12');
assert.equal(shiftMonth('2026-12', 1), '2027-01');
const marks = (...statuses) => statuses.map((status) => ({ status }));
const monthly = { wageType: 'monthly', wage: 3000000 };
assert.equal(monthSummary(monthly, [], '2026-11').pay, 3000000, 'unmarked days (offs, holidays) are paid on a monthly salary');
assert.equal(monthSummary(monthly, marks('absent', 'absent'), '2026-11').pay, 2800000, 'each absent day cuts a day of 1,000');
assert.equal(monthSummary(monthly, marks('half'), '2026-11').pay, 2950000, 'a half day cuts half a day');
assert.equal(monthSummary(monthly, marks('leave', 'leave'), '2026-11').pay, 3000000, 'leave is paid on a monthly salary');
assert.equal(monthSummary(monthly, marks(...Array(40).fill('absent')), '2026-11').pay, 0, 'never below zero');
const daily = { wageType: 'daily', wage: 60000 };
const week = monthSummary(daily, marks('present', 'present', 'half', 'absent', 'leave'), '2026-11');
assert.deepEqual(week.counts, { present: 2, half: 1, absent: 1, leave: 1 });
assert.equal(week.worked, 2.5);
assert.equal(week.pay, 150000, 'a daily wage pays only days worked: 2.5 × 600');
assert.equal(monthSummary({ wageType: 'monthly', wage: 1000000 }, marks('absent'), '2026-11').pay, 966667, 'rounded to the paisa');

// The phone's staff and marks pass the server's checks.
const staffId = ulid(randomBytes);
assert.ok(bookStaffSchema.safeParse({ staffId, name: 'Lakshmi', wageType: 'monthly', wage: 1500000, updatedAt: new Date().toISOString() }).success);
const mark = { attendanceId: attendanceId(staffId, '2026-11-08'), staffId, date: '2026-11-08', status: 'half', updatedAt: new Date().toISOString() };
assert.ok(bookAttendanceSchema.safeParse(mark).success);
assert.ok(!bookAttendanceSchema.safeParse({ ...mark, date: '2026-11-09' }).success, 'a mark is for the day in its id');

// Ids minted on the phone pass the server's own id check.
const id = ulid(randomBytes);
assert.match(id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
assert.ok(ulid(randomBytes, 2) > ulid(randomBytes, 1), 'later ids sort later');
assert.ok(bookEntrySchema.safeParse({ entryId: id, kind: 'sale', date: '2026-11-08', amount: 100, mode: 'cash', updatedAt: new Date().toISOString() }).success);

// Bill items: what was bought, how much, at what price. The bill amount is their total.
const now = new Date().toISOString();
const saree = { name: 'Silk saree', qty: 2, unit: 'pcs', price: 125000 };
const cloth = { name: 'Cotton cloth', qty: 2.5, unit: 'm', price: 18050 };
assert.equal(itemTotal(cloth), 45125, '2.5 m at ₹180.50 is ₹451.25');
assert.equal(itemTotal({ qty: 0.333, price: 100 }), 33, 'line totals round to the paisa');
const withItems = { entryId: id, kind: 'sale', date: '2026-11-08', mode: 'credit', partyId: id, updatedAt: now, items: [saree, cloth] };
assert.ok(bookEntrySchema.safeParse({ ...withItems, amount: itemsTotal(withItems.items) }).success, 'a bill with items is valid');
assert.ok(bookEntrySchema.safeParse({ ...withItems, amount: 300000, items: [{ ...saree, productId: id }, cloth] }).success === false, 'amount must match the items');
assert.ok(!bookEntrySchema.safeParse({ ...withItems, amount: 295125, items: [{ ...saree, qty: 0 }, cloth] }).success, 'qty must be above zero');
assert.ok(!bookEntrySchema.safeParse({ ...withItems, amount: 250000, items: [{ ...saree, qty: 1.2345 }] }).success, 'at most 3 decimals');
assert.ok(!bookEntrySchema.safeParse({ ...withItems, amount: 250000, items: [{ ...saree, unit: 'bag' }] }).success, 'unknown unit');
assert.ok(!bookEntrySchema.safeParse({ ...withItems, amount: 100, items: [] }).success, 'an empty list is not sent');
assert.ok(!bookEntrySchema.safeParse({ entryId: id, kind: 'expense', category: 'rent', mode: 'cash', date: '2026-11-08', amount: 250000, updatedAt: now, items: [saree] }).success, 'only a bill has items');

console.log('✓ Bill book: day totals, carried balance, khata dues, sync merge and phone-made ids all behave.');
