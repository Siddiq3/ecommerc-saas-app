import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ENTRY_COLS, PARTY_COLS, SCHEMA, saveLocal, toWire, upsert } from '../src/lib/bookStore.js';
import { acknowledge, pendingCount, syncBook } from '../src/lib/bookSync.js';
import { readDay, readParties, readParty } from '../src/lib/bookQueries.js';

// Exercise production SQL and sync with two independent real SQLite databases.
function database() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(SCHEMA);
  let transaction = Promise.resolve();
  const db = {
    getFirstAsync: async (sql, args = []) => raw.prepare(sql).get(...args),
    getAllAsync: async (sql, args = []) => raw.prepare(sql).all(...args),
    runAsync: async (sql, args = []) => raw.prepare(sql).run(...args),
    withExclusiveTransactionAsync(fn) {
      const task = transaction.then(async () => {
        raw.exec('BEGIN');
        try { const value = await fn(db); raw.exec('COMMIT'); return value; }
        catch (error) { raw.exec('ROLLBACK'); throw error; }
      });
      transaction = task.catch(() => undefined);
      return task;
    },
    close: () => raw.close(),
  };
  return db;
}
const a = database(), b = database();
const at = (n) => `2026-11-08T10:${String(n).padStart(2, '0')}:00.000Z`;
const party = { partyId: 'customer', name: 'Ramu', updatedAt: at(0) };
const bill = { entryId: 'bill', kind: 'sale', mode: 'credit', partyId: party.partyId, date: '2026-11-08', amount: 25000, updatedAt: at(1) };
try {
  await upsert(a, 'parties', PARTY_COLS, party, true);
  await upsert(a, 'entries', ENTRY_COLS, bill, true);
  const sent = await a.getAllAsync('SELECT * FROM entries');
  await upsert(a, 'entries', ENTRY_COLS, { ...bill, amount: 30000, updatedAt: at(3) }, true);
  await acknowledge(a, [], sent, [{ ...bill, type: 'entry', amount: 27000, updatedAt: at(2) }]);
  let stored = await a.getFirstAsync('SELECT * FROM entries');
  assert.equal(stored.amount, 30000, 'a delayed server conflict must preserve a newer local edit');
  assert.equal(stored.dirty, 1, 'acknowledging an earlier revision cannot clear a later edit');
  await upsert(a, 'entries', ENTRY_COLS, { ...bill, amount: 35000, updatedAt: at(4) }, false);
  stored = await a.getFirstAsync('SELECT * FROM entries');
  assert.equal(stored.amount, 35000);
  assert.equal(stored.dirty, 0);
  const wire = toWire(stored, ENTRY_COLS);
  assert.equal(wire.deleted, false);
  assert(!('dirty' in wire));
  assert(!('note' in wire));

  // Two edits in one millisecond, and a clock moving backwards, still get unique revisions.
  await saveLocal(a, 'entries', ENTRY_COLS, bill, Date.parse(at(5)));
  const first = await a.getFirstAsync('SELECT * FROM entries');
  await saveLocal(a, 'entries', ENTRY_COLS, { ...bill, amount: 40000 }, Date.parse(at(5)));
  const second = await a.getFirstAsync('SELECT * FROM entries');
  assert(second.updatedAt > first.updatedAt);
  await saveLocal(a, 'entries', ENTRY_COLS, { ...bill, amount: 45000 }, 0);
  assert((await a.getFirstAsync('SELECT updatedAt FROM entries')).updatedAt > second.updatedAt);

  let fail = true, counter = 0;
  const remote = new Map();
  const api = {
    async sync(store, payload) {
      assert.equal(store, 'store-a');
      if (fail) throw Object.assign(new Error('offline'), { status: 0 });
      assert(payload.parties.length + payload.entries.length <= 100);
      for (const [type, rows] of [['party', payload.parties], ['entry', payload.entries]]) {
        for (const row of rows) remote.set(row.partyId && type === 'party' ? row.partyId : row.entryId, { ...row, type });
      }
      return { conflicts: [] };
    },
    async changes() {
      counter += 1;
      return { items: [...remote.values()], next: `${at(20)}#cursor`, more: false };
    },
  };
  await assert.rejects(syncBook(a, api, 'store-a'), /offline/);
  assert.equal(await pendingCount(a), 2, 'offline errors retain all local changes');
  fail = false;
  await syncBook(a, api, 'store-a');
  assert.equal(await pendingCount(a), 0);
  await syncBook(b, api, 'store-a');
  assert.equal((await readParty(b, party.partyId)).balance, 45000, 'another phone restores the khata');

  await saveLocal(a, 'entries', ENTRY_COLS, { ...bill, deleted: true });
  await syncBook(a, api, 'store-a');
  await syncBook(b, api, 'store-a');
  assert.equal((await readParty(b, party.partyId)).balance, 0, 'deletion reaches the second phone');

  // Day closing carries forward; credit/old dues do not inflate cash in hand.
  const rows = [
    ['opening', 'opening', undefined, 100000, '2026-11-07'],
    ['cash', 'sale', 'cash', 50000], ['upi', 'sale', 'upi', 20000],
    ['credit', 'sale', 'credit', 30000], ['rent', 'expense', 'cash', 10000],
    ['paid', 'collection', 'upi', 5000], ['due', 'due', undefined, 15000],
  ];
  for (const [entryId, kind, mode, amount, date = '2026-11-08'] of rows) {
    await upsert(b, 'entries', ENTRY_COLS, { entryId, kind, mode, amount, date, partyId: party.partyId, updatedAt: at(10) }, true);
  }
  const day = await readDay(b, '2026-11-08');
  assert.equal(day.openingBalance, 100000);
  assert.equal(day.closingBalance, 165000);
  assert.equal(day.sales.total, 100000);
  assert.equal((await readDay(b, '2026-11-09')).openingBalance, 165000);
  assert.equal((await readParties(b))[0].balance, 40000);
  assert(counter >= 4);

  // If the owner leaves during a network request, its response is not applied.
  let active = true;
  await saveLocal(a, 'entries', ENTRY_COLS, { ...bill, entryId: 'unsent' });
  await syncBook(a, { ...api, sync: async () => { active = false; return { conflicts: [] }; } }, 'store-a', () => active);
  assert.equal(await pendingCount(a), 1);
  console.log('✓ Bill storage: real SQLite totals, revision races, offline retry, two-phone restore/deletion and cancelled sync pass.');
} finally { a.close(); b.close(); }
