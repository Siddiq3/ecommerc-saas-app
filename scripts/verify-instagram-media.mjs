import { strict as assert } from 'node:assert';
import { needsMediaLookup } from '../src/lib/instagram-media.js';

const snap = { id: '1', caption: 'Kurti Reel' };
assert.equal(needsMediaLookup([], []), false, 'nothing on screen');
assert.equal(needsMediaLookup([{ mediaId: 'ALL' }, { mediaId: 'DM' }], [{ mediaId: 'UNKNOWN' }]), false, 'no single posts');
assert.equal(needsMediaLookup([{ mediaId: '1', media: snap }], [{ mediaId: '1', media: snap }]), false, 'all snapshotted');
assert.equal(needsMediaLookup([{ mediaId: '1' }], []), true, 'a rule saved before snapshots');
// The reported bug: a Reel reached only by the "All posts and Reels" rule showed its raw ID.
assert.equal(needsMediaLookup([{ mediaId: 'ALL' }], [{ mediaId: '18000000000000001', media: null }]), true, 'post known only from the report');
console.log('✓ Instagram posts are looked up whenever a rule or reported post has no caption or thumbnail.');
