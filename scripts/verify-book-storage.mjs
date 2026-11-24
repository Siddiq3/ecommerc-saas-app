import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ATTENDANCE_COLS, ENTRY_COLS, PARTY_COLS, SCHEMA, STAFF_COLS, migrate, runRepeats, saveLocal, toWire, upsert } from '../src/lib/bookStore.js';
import { acknowledge, pendingCount, syncBook } from '../src/lib/bookSync.js';
import { nextBillNumber, readPaidWithBill, searchEntries, readRange, readDay, readParties, readParty, readRegister, readStaffMonth } from '../src/lib/bookQueries.js';

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
  await acknowledge(a, { entry: sent }, [{ ...bill, type: 'entry', amount: 27000, updatedAt: at(2) }]);
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
      for (const [type, rows] of [['party', payload.parties], ['entry', payload.entries], ['staff', payload.staff], ['attendance', payload.attendance]]) {
        for (const row of rows) remote.set(`${type}:${row[{ party: 'partyId', entry: 'entryId', staff: 'staffId', attendance: 'attendanceId' }[type]]}`, { ...row, type });
      }
      return { conflicts: [] };
    },
    async changes(store, params) {
      assert.equal(params.include, 'staff', 'this app asks for staff records');
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
    // Rent names no party: an expense naming one is a supplier payment and comes off that balance.
    const partyId = kind === 'expense' ? undefined : party.partyId;
    await upsert(b, 'entries', ENTRY_COLS, { entryId, kind, mode, amount, date, partyId, updatedAt: at(10) }, true);
  }
  const day = await readDay(b, '2026-11-08');
  assert.equal(day.openingBalance, 100000);
  assert.equal(day.closingBalance, 165000);
  assert.equal(day.sales.total, 100000);
  assert.equal((await readDay(b, '2026-11-09')).openingBalance, 165000);
  assert.equal((await readParties(b))[0].balance, 40000);
  assert.equal((await readParties(b))[0].lastDate, '2026-11-08', 'the khata list shows each party\'s latest entry date');
  assert(counter >= 4);
  const range = await readRange(b, '2026-11-01', '2026-11-30');
  assert.equal(range.opening, 0, 'the starting cash is inside this range');
  assert.equal(range.closing, 165000);
  assert.deepEqual(range.days.map((d) => [d.date, d.closingBalance]), [['2026-11-07', 100000], ['2026-11-08', 165000]]);
  assert.equal((await readRange(b, '2026-11-08', '2026-11-08')).opening, 100000, 'a later range opens on the cash carried into it');
  assert.equal(range.totals.sales.total, 100000);
  assert.deepEqual(range.expensesBy.map((e) => [e.category, e.total]), [[null, 10000]], 'grouped by category (this test row has none)');
  assert.equal(range.purchases, 0, 'no supplier goods in this range');

  // Bill items are stored as a list, travel to the second phone intact, and show in the khata.
  const items = [{ name: 'Silk saree', qty: 1, unit: 'pcs', price: 125000 }, { name: 'Cotton cloth', qty: 2.5, unit: 'm', price: 18000 }];
  const itemBill = { entryId: 'itembill', kind: 'sale', mode: 'credit', partyId: party.partyId, date: '2026-11-08', amount: 170000, items, updatedAt: at(20) };
  await saveLocal(a, 'entries', ENTRY_COLS, itemBill);
  const sentItems = toWire(await a.getFirstAsync("SELECT * FROM entries WHERE entryId = 'itembill'"), ENTRY_COLS);
  assert.deepEqual(sentItems.items, items, 'items go to the server as a list');
  await syncBook(a, api, 'store-a');
  await syncBook(b, api, 'store-a');
  const onB = (await readParty(b, party.partyId)).entries.find((e) => e.entryId === 'itembill');
  assert.deepEqual(onB.items, items, 'the second phone sees what was bought');
  assert.deepEqual((await readDay(b, '2026-11-08')).entries.find((e) => e.entryId === 'itembill').items, items);
  assert.equal((await readDay(b, '2026-11-08')).entries.find((e) => e.entryId === 'cash').items, null, 'older bills have no list');

  // A book created by the previous app version gains the column without losing bills.
  const old = new DatabaseSync(':memory:');
  old.exec(SCHEMA
    .replace('category TEXT, items TEXT, billNo TEXT, discount INTEGER, gstRate INTEGER, label TEXT,', 'category TEXT,')
    .replace('mobile TEXT, partyType TEXT, dueDate TEXT, shareToken TEXT,', 'mobile TEXT,'));
  old.exec("INSERT INTO entries (entryId, kind, date, amount, mode, updatedAt) VALUES ('legacy', 'sale', '2026-11-01', 500, 'cash', '2026-11-01T00:00:00.000Z')");
  old.exec("INSERT INTO parties (partyId, name, updatedAt) VALUES ('oldparty', 'Ravi', '2026-11-01T00:00:00.000Z')");
  const oldDb = { getAllAsync: async (sql, args = []) => old.prepare(sql).all(...args), runAsync: async (sql, args = []) => old.prepare(sql).run(...args) };
  await migrate(oldDb);
  await migrate(oldDb);
  assert.equal(old.prepare("SELECT amount, items FROM entries WHERE entryId = 'legacy'").get().amount, 500);
  assert.equal(old.prepare("SELECT partyType FROM parties WHERE partyId = 'oldparty'").get().partyType, null, 'old parties read as customers');
  assert.equal(old.prepare("SELECT billNo, label FROM entries WHERE entryId = 'legacy'").get().billNo, null, 'old bills gain the new columns');
  old.close();

  // Bill numbers: each phone has its own code and count, so two phones never print the same number.
  assert.equal(await nextBillNumber(a, '2026-11-30', () => 'AAA'), '301126-AAA-1');
  await saveLocal(a, 'entries', ENTRY_COLS, { entryId: 'nb1', kind: 'sale', mode: 'cash', date: '2026-11-30', amount: 100, billNo: '301126-AAA-1' });
  await saveLocal(a, 'entries', ENTRY_COLS, { entryId: 'nb2', kind: 'sale', mode: 'cash', date: '2026-11-30', amount: 100, billNo: '301126-BBB-7' });
  assert.equal(await nextBillNumber(a, '2026-11-30', () => 'ZZZ'), '301126-AAA-2', 'the code is kept, and another phone’s bills are not counted');
  await saveLocal(a, 'entries', ENTRY_COLS, { entryId: 'nb1', kind: 'sale', mode: 'cash', date: '2026-11-30', amount: 100, billNo: '301126-AAA-1', deleted: true });
  assert.equal(await nextBillNumber(a, '2026-11-30'), '301126-AAA-2', 'a deleted bill’s number is not used again');

  // A part-paid credit bill finds the payment saved with it.
  const credit = { entryId: 'pp1', kind: 'sale', mode: 'credit', partyId: 'P9', date: '2026-11-30', amount: 30000, billNo: '301126-AAA-9' };
  await saveLocal(a, 'entries', ENTRY_COLS, credit);
  assert.equal(await readPaidWithBill(a, credit), null, 'nothing paid yet');
  await saveLocal(a, 'entries', ENTRY_COLS, { entryId: 'pp2', kind: 'collection', mode: 'upi', partyId: 'P9', date: '2026-11-30', amount: 10000, note: 'Bill 301126-AAA-9' });
  assert.deepEqual(await readPaidWithBill(a, credit), { amount: 10000, mode: 'upi' });

  // Search finds entries by party, bill number, item, note and exact amount; LIKE wildcards are literal.
  const found = async (q) => (await searchEntries(b, q)).map((e) => e.entryId).sort();
  assert.ok((await found('ramu')).includes('credit'), 'by party name, any case');
  assert.deepEqual(await found('Silk saree'), ['itembill'], 'by item name');
  assert.ok((await found('300')).includes('credit'), 'by amount in rupees');
  assert.deepEqual(await found('%'), [], 'a % is searched for, not a wildcard');
  assert.deepEqual(await found('   '), []);

  // A monthly expense: one copy a month from the next month on, never twice, and a deleted copy stays deleted.
  const rent = { kind: 'expense', category: 'rent', mode: 'cash', amount: 800000 };
  await a.runAsync('INSERT INTO repeats (templateId, entry, day, startMonth) VALUES (?, ?, ?, ?)', ['01JC000000AAAAAAAAAAAAAAAA', JSON.stringify(rent), 5, '2026-09']);
  assert.equal(await runRepeats(a, '2026-11-20'), 2, 'October and November');
  assert.equal(await runRepeats(a, '2026-11-21'), 0, 'not twice');
  const copies = await a.getAllAsync("SELECT entryId, date FROM entries WHERE category = 'rent' AND amount = 800000 ORDER BY date");
  assert.deepEqual(copies.map((c) => c.date), ['2026-10-05', '2026-11-05']);
  await saveLocal(a, 'entries', ENTRY_COLS, { ...rent, entryId: copies[0].entryId, date: copies[0].date, deleted: true });
  assert.equal(await runRepeats(a, '2026-11-22'), 0, 'a deleted copy is not made again');

  // Staff and attendance: saved on one phone, restored on another; a cleared mark stays cleared.
  const worker = { staffId: 'lakshmi', name: 'Lakshmi', wageType: 'monthly', wage: 3000000 };
  await saveLocal(a, 'staff', STAFF_COLS, worker);
  const markOn = (date, status) => saveLocal(a, 'attendance', ATTENDANCE_COLS, { attendanceId: `lakshmi:${date}`, staffId: 'lakshmi', date, status: status ?? 'absent', deleted: !status });
  await markOn('2026-11-02', 'present');
  await markOn('2026-11-03', 'absent');
  await markOn('2026-11-04', 'half');
  await markOn('2026-11-05', 'present');
  await markOn('2026-11-05', null);
  await syncBook(a, api, 'store-a');
  await syncBook(b, api, 'store-a');
  const register = await readRegister(b, '2026-11-03');
  assert.deepEqual(register.map((r) => [r.name, r.status]), [['Lakshmi', 'absent']], 'the second phone has the register');
  assert.equal((await readRegister(b, '2026-11-05'))[0].status, null, 'a cleared mark reaches the second phone');
  const month = await readStaffMonth(b, 'lakshmi', '2026-11');
  assert.deepEqual(month.counts, { present: 1, half: 1, absent: 1, leave: 0 });
  assert.equal(month.pay, 3000000 - 150000, '30 days: one absent and one half day cut 1.5 days of 1,000');
  await saveLocal(a, 'staff', STAFF_COLS, { ...worker, deleted: true });
  await syncBook(a, api, 'store-a');
  await syncBook(b, api, 'store-a');
  assert.deepEqual(await readRegister(b, '2026-11-03'), [], 'a removed person leaves the register');

  // A phone updated from a version without staff attendance reads the feed once from the start.
  const upgraded = database();
  await upgraded.runAsync("INSERT INTO meta (key, value) VALUES ('next', ?)", [`${at(59)}#cursor`]);
  let asked;
  await syncBook(upgraded, { sync: api.sync, changes: async (s, params) => { asked = params.since; return { items: [], next: `${at(59)}#x`, more: false }; } }, 'store-a');
  assert.equal(asked, undefined, 'first sync after the update starts from the beginning');
  await syncBook(upgraded, { sync: api.sync, changes: async (s, params) => { asked = params.since; return { items: [], next: `${at(59)}#x`, more: false }; } }, 'store-a');
  assert.notEqual(asked, undefined, 'later syncs resume where they left off');
  // A record type from a newer server is skipped, not stored as a bill.
  await syncBook(upgraded, { sync: api.sync, changes: async () => ({ items: [{ type: 'payroll', payrollId: 'x', updatedAt: at(1) }], next: `${at(59)}#y`, more: false }) }, 'store-a');
  assert.equal((await upgraded.getFirstAsync('SELECT COUNT(*) AS n FROM entries')).n, 0);
  upgraded.close();

  // If the owner leaves during a network request, its response is not applied.
  let active = true;
  await saveLocal(a, 'entries', ENTRY_COLS, { ...bill, entryId: 'unsent' });
  await syncBook(a, { ...api, sync: async () => { active = false; return { conflicts: [] }; } }, 'store-a', () => active);
  assert.equal(await pendingCount(a), 1);
  console.log('✓ Bill storage: real SQLite totals, revision races, offline retry, two-phone restore/deletion and cancelled sync pass.');
} finally { a.close(); b.close(); }
