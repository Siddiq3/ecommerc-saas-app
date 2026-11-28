import assert from 'node:assert/strict';
import { compareVersions, updateNeed, shouldOffer, REMIND_AFTER_MS } from '../src/lib/appUpdate.js';

assert.ok(compareVersions('1.10.0', '1.9.2') > 0, 'numbers, not text');
assert.equal(compareVersions('1.1', '1.1.0'), 0);
assert.ok(compareVersions('1.0.0', '1.1.0') < 0);

const v = { latest: '1.2.0', minimum: '1.1.0' };
assert.equal(updateNeed('1.0.9', v), 'required');
assert.equal(updateNeed('1.1.0', v), 'available');
assert.equal(updateNeed('1.2.0', v), null);
assert.equal(updateNeed('1.3.0', v), null, 'a build still in review is not asked');
assert.equal(updateNeed('1.0.0', {}), null, 'a failed check asks nothing');
assert.equal(updateNeed(undefined, v), null);

const now = 1_000_000_000_000;
assert.equal(shouldOffer('1.2.0', null, now), true);
assert.equal(shouldOffer('1.2.0', { version: '1.2.0', at: now - 1000 }, now), false, '"Later" is respected');
assert.equal(shouldOffer('1.2.0', { version: '1.2.0', at: now - REMIND_AFTER_MS }, now), true, 'and reminds again later');
assert.equal(shouldOffer('1.3.0', { version: '1.2.0', at: now }, now), true, 'a newer version asks again');

console.log('✓ App update: versions compare by number; required below minimum, card below latest, "Later" reminds in 3 days.');
