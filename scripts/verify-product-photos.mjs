import assert from 'node:assert/strict';
import { photoCrop } from '../src/lib/productPhoto.js';

assert.deepEqual(photoCrop(1200, 800), { originX: 200, originY: 0, width: 800, height: 800 });
assert.deepEqual(photoCrop(800, 1200, 2), { originX: 200, originY: 400, width: 400, height: 400 });
assert.deepEqual(photoCrop(800, 1200, 2, { x: 1, y: -1 }), { originX: 0, originY: 800, width: 400, height: 400 });
// Portrait, landscape, odd dimensions and extreme drags must never crop outside the image.
for (const [width, height] of [[4031, 3023], [3023, 4031], [1, 1], [100, 900]]) {
  for (const zoom of [1, 1.25, 2, 4]) {
    for (const x of [-5, -1, 0, 1, 5]) {
      for (const y of [-5, -1, 0, 1, 5]) {
        const crop = photoCrop(width, height, zoom, { x, y });
        assert.ok(crop.originX >= 0 && crop.originY >= 0);
        assert.ok(crop.originX + crop.width <= width);
        assert.ok(crop.originY + crop.height <= height);
        assert.equal(crop.width, crop.height);
      }
    }
  }
}
console.log('✓ Product photo crops stay within bounds across sizes, zoom levels and drags.');
