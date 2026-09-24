#!/usr/bin/env node
/**
 * Checks the variant maths in src/lib/variants.js.
 *
 * This is the one piece of the product form that can lose a merchant's data silently. Rows
 * are regenerated on every keystroke in the options fields, and each row carries a
 * `variantId` and a stock count. If regeneration matched rows by position instead of by the
 * combination they represent, then inserting a size at the front of the list would shift
 * every id by one — the API would happily accept it, and a shop would wake up with its
 * stock counts rotated. Nothing about that failure looks like an error, so it gets a test.
 */
import assert from 'node:assert/strict';
import {
  MAX_VARIANTS, buildRows, comboLabel, fingerprint, optionsFromVariants, parseValues, usable,
} from '../src/lib/variants.js';

/* ───────────── parseValues ───────────── */

assert.deepEqual(parseValues('S, M, L'), ['S', 'M', 'L']);
assert.deepEqual(parseValues('  S ,, M ,'), ['S', 'M'], 'blank pieces are dropped');
assert.deepEqual(parseValues('S, M, S'), ['S', 'M'], 'a repeated value is only one value');
assert.deepEqual(parseValues(''), []);
assert.deepEqual(parseValues(undefined), []);

/* ───────────── fingerprint ───────────── */

assert.equal(
  fingerprint({ Size: 'S', Colour: 'Red' }),
  fingerprint({ Colour: 'Red', Size: 'S' }),
  'key order must not change a combination\'s identity',
);
assert.notEqual(fingerprint({ Size: 'S' }), fingerprint({ Size: 'M' }));

/* ───────────── usable ───────────── */

assert.equal(usable([{ name: 'Size', values: 'S' }]).length, 1);
assert.equal(usable([{ name: '', values: 'S' }]).length, 0, 'an unnamed option generates nothing');
assert.equal(usable([{ name: 'Size', values: '' }]).length, 0, 'a valueless option generates nothing');

/* ───────────── buildRows: the combinations ───────────── */

const sizes = { name: 'Size', values: 'S, M, L' };
const colours = { name: 'Colour', values: 'Red, Blue' };

assert.deepEqual(buildRows([], []), [], 'no options means no rows');

const single = buildRows([sizes], []);
assert.equal(single.length, 3);
assert.deepEqual(single.map((r) => comboLabel(r.attributes)), ['S', 'M', 'L'], 'order follows the merchant');

const grid = buildRows([sizes, colours], []);
assert.equal(grid.length, 6, '3 sizes x 2 colours');
assert.deepEqual(grid[0].attributes, { Size: 'S', Colour: 'Red' });
assert.deepEqual(grid.map((r) => r.sortOrder), [0, 1, 2, 3, 4, 5], 'sortOrder matches position');

const priced = buildRows([sizes], [], '499');
assert.equal(priced[0].price, '499', 'a fresh row starts at the product price');
assert.equal(priced[0].stock, '0');
assert.equal(priced[0].active, true);

/* ───────────── buildRows: preserving what the merchant already typed ───────────── */

const existing = [
  { variantId: 'v-s', attributes: { Size: 'S' }, price: '100', stock: '7', sortOrder: 0 },
  { variantId: 'v-m', attributes: { Size: 'M' }, price: '200', stock: '3', sortOrder: 1 },
];

// Appending a size must not disturb the two that exist.
const appended = buildRows([{ name: 'Size', values: 'S, M, L' }], existing, '999');
assert.equal(appended.length, 3);
assert.equal(appended[0].variantId, 'v-s');
assert.equal(appended[0].stock, '7');
assert.equal(appended[1].variantId, 'v-m');
assert.equal(appended[1].stock, '3');
assert.equal(appended[2].variantId, undefined, 'the new row has no id until the API issues one');
assert.equal(appended[2].price, '999');

// Inserting at the FRONT is the case that position-matching would get wrong.
const prepended = buildRows([{ name: 'Size', values: 'XS, S, M' }], existing, '999');
assert.equal(prepended.length, 3);
assert.equal(prepended[0].variantId, undefined, 'XS is new');
assert.equal(prepended[1].variantId, 'v-s', 'S keeps its id even though it moved down');
assert.equal(prepended[1].stock, '7', 'and keeps its stock');
assert.equal(prepended[2].variantId, 'v-m');
assert.equal(prepended[2].stock, '3');
assert.deepEqual(prepended.map((r) => r.sortOrder), [0, 1, 2], 'sortOrder is rewritten to the new order');

// Removing a value drops exactly that row.
const shrunk = buildRows([{ name: 'Size', values: 'M' }], existing);
assert.equal(shrunk.length, 1);
assert.equal(shrunk[0].variantId, 'v-m');

// Renaming the option is a different combination: nothing is carried over, and no stale id
// is sent for a row the store never had under that name.
const renamed = buildRows([{ name: 'Sizes', values: 'S, M' }], existing);
assert.equal(renamed.every((r) => r.variantId === undefined), true);

/* ───────────── buildRows: the ceiling ───────────── */

const huge = buildRows(
  [
    { name: 'A', values: Array.from({ length: 30 }, (_, i) => `a${i}`).join(', ') },
    { name: 'B', values: Array.from({ length: 30 }, (_, i) => `b${i}`).join(', ') },
  ],
  [],
);
assert.equal(huge.length, MAX_VARIANTS, 'never more rows than the API will accept');
assert.equal(new Set(huge.map((r) => fingerprint(r.attributes))).size, MAX_VARIANTS, 'and no duplicates');

/* ───────────── optionsFromVariants ───────────── */

const rebuilt = optionsFromVariants([
  { attributes: { Size: 'S', Colour: 'Red' } },
  { attributes: { Size: 'M', Colour: 'Red' } },
  { attributes: { Size: 'S', Colour: 'Blue' } },
]);
assert.deepEqual(rebuilt, [{ name: 'Size', values: 'S, M' }, { name: 'Colour', values: 'Red, Blue' }]);
assert.deepEqual(optionsFromVariants([]), []);
assert.deepEqual(optionsFromVariants(undefined), []);

// A product whose options were reconstructed must rebuild to the rows it already had.
const roundTrip = buildRows(rebuilt, []);
assert.equal(roundTrip.length, 4, '2 sizes x 2 colours, including the pair never saved');

/* ───────────── comboLabel ───────────── */

assert.equal(comboLabel({ Size: 'S', Colour: 'Red' }), 'S · Red');
assert.equal(comboLabel({}), '');

console.log('✓ Variant options, combinations and row identity all behave.');
