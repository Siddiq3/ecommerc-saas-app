import assert from 'node:assert/strict';
import { shortAgo } from '../src/lib/format.js';

// The short age used in list rows: every step of the scale, and the edges between them.
const now = Date.parse('2026-09-28T12:00:00Z');
const ago = (ms) => new Date(now - ms).toISOString();
const MIN = 60_000;
assert.equal(shortAgo(ago(20_000), now), 'just now');
assert.equal(shortAgo(ago(-5 * MIN), now), 'just now', 'a skewed clock never says "-5 min ago"');
assert.equal(shortAgo(ago(1 * MIN), now), '1 min ago');
assert.equal(shortAgo(ago(59 * MIN), now), '59 min ago');
assert.equal(shortAgo(ago(60 * MIN), now), '1 hr ago');
assert.equal(shortAgo(ago(23 * 60 * MIN), now), '23 hr ago');
assert.equal(shortAgo(ago(24 * 60 * MIN), now), 'yesterday');
assert.equal(shortAgo(ago(6 * 24 * 60 * MIN), now), '6 days ago');
assert.match(shortAgo(ago(8 * 24 * 60 * MIN), now), /^20 Sept?$/);
assert.equal(shortAgo(undefined, now), '');
console.log('✓ Format: short ages read right from "just now" to a date.');
