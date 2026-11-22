import assert from 'node:assert/strict';
import { bookFile, forgetLocalBooks, noteBookClosing } from '../src/lib/localBooks.js';

// The offline book is erased after a store or account is deleted on the server: it waits for book.jsx to close the
// database, retries while it is still open, treats an already-missing file as gone, and gives up rather than loop.
const fake = (script) => {
  const calls = [];
  const remove = async (file) => { calls.push(file); const next = script.shift(); if (next) throw next; };
  return { calls, remove, wait: async () => {} };
};

{ const f = fake([]); assert.deepEqual(await forgetLocalBooks(['b1', 'b1', null, 'b2'], f), ['b1', 'b2']); assert.deepEqual(f.calls, [bookFile('b1'), bookFile('b2')]); }
{ const f = fake([new Error('Unable to delete database that is currently open'), new Error('still open')]);
  assert.deepEqual(await forgetLocalBooks(['b1'], f), ['b1']); assert.equal(f.calls.length, 3); }
{ const f = fake([new Error('Database file not found')]); assert.deepEqual(await forgetLocalBooks(['b1'], f), ['b1']); assert.equal(f.calls.length, 1); }
{ const f = fake(Array.from({ length: 50 }, () => new Error('open'))); assert.deepEqual(await forgetLocalBooks(['b1'], { ...f, attempts: 4 }), []); assert.equal(f.calls.length, 4); }
{ // Waits for the close book.jsx reported before deleting.
  let closed = false; let release; noteBookClosing('b9', new Promise((r) => { release = () => { closed = true; r(); }; }));
  const seen = []; const done = forgetLocalBooks(['b9'], { remove: async () => { seen.push(closed); }, wait: async () => {} });
  release(); await done; assert.deepEqual(seen, [true]); }
console.log('✓ Deleting a store or account erases its offline book from the phone, after it closes; signing out does not.');
