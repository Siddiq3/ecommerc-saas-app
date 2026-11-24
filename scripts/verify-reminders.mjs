import assert from 'node:assert/strict';
import { nextMondayMorning } from '../src/lib/book.js';

// The weekly nudge lands on the coming Monday at 10, never in the past.
const at = (s) => new Date(s);
assert.equal(nextMondayMorning(at('2026-11-24T15:00:00')).toString(), at('2026-11-30T10:00:00').toString(), 'Tuesday → next Monday');
assert.equal(nextMondayMorning(at('2026-11-30T09:00:00')).toString(), at('2026-11-30T10:00:00').toString(), 'Monday before 10 → today');
assert.equal(nextMondayMorning(at('2026-11-30T10:00:00')).toString(), at('2026-12-07T10:00:00').toString(), 'Monday at 10 → a week on');
assert.equal(nextMondayMorning(at('2026-11-29T23:59:00')).toString(), at('2026-11-30T10:00:00').toString(), 'Sunday night → tomorrow');
console.log('✓ Reminders: the weekly nudge is always the coming Monday at 10.');
