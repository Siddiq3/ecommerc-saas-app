import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { summarize, balanceOf, takeIncoming, resumeFrom, shiftDay, ulid } from '../src/lib/book.js';
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
