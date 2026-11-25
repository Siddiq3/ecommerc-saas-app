import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA } from '../src/lib/bookStore.js';
import {
  addOrIncrement, cacheProduct, cooldown, findByCode, lineFor, lookupCode, refreshCatalog, rowsFromCatalog, suggest, uncacheProduct,
} from '../src/lib/productCache.js';
import { code128Pattern, labelsHtml, scanCardHtml } from '../src/lib/labels.js';
import { visibilityFields } from '../src/lib/productSettings.js';
import { readFileSync } from 'node:fs';

// The offline products copy behind scan and item-code billing, on a real SQLite database with the book's schema.
const raw = new DatabaseSync(':memory:');
raw.exec(SCHEMA);
let chain = Promise.resolve();
const db = {
  getFirstAsync: async (sql, args = []) => raw.prepare(sql).get(...args),
  getAllAsync: async (sql, args = []) => raw.prepare(sql).all(...args),
  runAsync: async (sql, args = []) => raw.prepare(sql).run(...args),
  withExclusiveTransactionAsync(fn) {
    const task = chain.then(async () => {
      raw.exec('BEGIN');
      try { const v = await fn(db); raw.exec('COMMIT'); return v; } catch (e) { raw.exec('ROLLBACK'); throw e; }
    });
    chain = task.catch(() => undefined);
    return task;
  },
};

const K = 'P1KURTI0000000000000000000';
const T = 'P2TUMBLER00000000000000000';
const feed = [
  { kind: 'product', productId: K, name: 'Cotton Kurti', price: 49900, sku: null, active: true, hasVariants: true, trackInventory: true },
  { kind: 'variant', productId: K, variantId: 'VM', attributes: { Size: 'M' }, price: 49900, sku: 'KUR-M-001', active: true, sortOrder: 0 },
  { kind: 'variant', productId: K, variantId: 'VL', attributes: { Size: 'L' }, price: 52900, sku: 'KUR-L-001', active: true, sortOrder: 1 },
  { kind: 'variant', productId: K, variantId: 'VX', attributes: { Size: 'XL' }, price: 52900, sku: 'KUR-XL-001', active: false, sortOrder: 2 },
  { kind: 'product', productId: T, name: 'Steel Tumbler', price: 9900, sku: '8901234567890', active: true, hasVariants: false, trackInventory: false },
  { kind: 'product', productId: 'P3HIDDEN', name: 'Hidden', price: 100, sku: 'HID-001', active: false, hasVariants: false },
];

/* ───────────── refresh, join, lookup ───────────── */

const rows = rowsFromCatalog(feed);
assert.equal(rows.length, 5, 'every size and product, hidden from the online store or not: the counter can sell them all');
let calls = 0;
const api = {
  catalog: async (_b, params) => { calls += 1; return params?.cursor ? { items: feed.slice(3), nextCursor: null } : { items: feed.slice(0, 3), nextCursor: 'c1' }; },
};
assert.equal(await refreshCatalog(db, api, 'B', { now: 1_000_000 }), true);
assert.equal(calls, 2, 'every page is read');
assert.equal(await refreshCatalog(db, api, 'B', { now: 1_000_000 + 60_000 }), false, 'not again within 10 minutes');
assert.equal(calls, 2);

const m = await findByCode(db, ' kur-m-001 ');
assert.equal(m.variantId, 'VM', 'codes match in any case, with spaces trimmed');
assert.equal((await findByCode(db, '8901234567890')).name, 'Steel Tumbler');
assert.equal(await findByCode(db, 'NOPE'), null);
assert.equal((await findByCode(db, 'HID-001'))?.name, 'Hidden', 'a product hidden online is found by its code');
assert.equal((await findByCode(db, 'KUR-XL-001'))?.label, 'XL', 'and so is a size hidden online');
const plan = raw.prepare('EXPLAIN QUERY PLAN SELECT * FROM catalog WHERE sku = ? LIMIT 1').all('X').map((r) => r.detail).join(' ');
assert.match(plan, /USING INDEX catalog_sku/, 'the code lookup is an indexed query');

assert.deepEqual(lineFor(m), { name: 'Cotton Kurti (M)', qty: 1, unit: 'pcs', price: 49900, productId: K, variantId: 'VM' },
  'a scanned size goes on the bill exactly as My products puts it');
assert.deepEqual(lineFor(await findByCode(db, '8901234567890')), { name: 'Steel Tumbler', qty: 1, unit: 'pcs', price: 9900, productId: T });

/* ───────────── suggestions ───────────── */

assert.deepEqual((await suggest(db, 'kur-')).map((r) => r.sku), ['KUR-L-001', 'KUR-M-001', 'KUR-XL-001'], 'code prefix');
assert.deepEqual((await suggest(db, 'tumb')).map((r) => r.name), ['Steel Tumbler'], 'or the name');
assert.ok((await suggest(db, 'k')).length <= 5);
assert.deepEqual(await suggest(db, ''), []);

/* ───────────── same item again: one more ───────────── */

let items = [];
items = addOrIncrement(items, lineFor(m));
items = addOrIncrement(items, lineFor(m));
items = addOrIncrement(items, lineFor(await findByCode(db, 'KUR-L-001')));
assert.deepEqual(items.map((i) => [i.name, i.qty]), [['Cotton Kurti (M)', 2], ['Cotton Kurti (L)', 1]], 'same size +1, other size a new line');
const typed = [{ name: 'Loose rice', qty: 2, unit: 'kg', price: 5000 }];
assert.equal(addOrIncrement(typed, { name: 'Loose rice', qty: 1, unit: 'kg', price: 5000 }).length, 2, 'a typed line (no product) is never merged');

/* ───────────── cooldown ───────────── */

const accept = cooldown(1200);
assert.equal(accept('A', 0), true);
assert.equal(accept('A', 500), false, 'the same code within 1.2 s is the same scan');
assert.equal(accept('B', 600), true, 'another code is taken at once');
assert.equal(accept('A', 700), true, 'and so is the first one again after another code');
assert.equal(accept('A', 1000), false);
assert.equal(accept('A', 1950), true, 'the same code after 1.2 s is one more');

/* ───────────── offline fallback ───────────── */

const NEW = 'P4NEW000000000000000000000';
let asked = 0;
const online = {
  byCode: async (_b, code) => {
    asked += 1;
    if (code !== 'NEW-001') throw Object.assign(new Error('Not found'), { status: 404 });
    return { product: { productId: NEW, name: 'New Dupatta', price: 39900, sku: 'NEW-001', active: true, hasVariants: false, variants: [] }, variant: null };
  },
};
const found = await lookupCode(db, online, 'B', 'new-001');
assert.equal(found.row?.name, 'New Dupatta', 'not on the phone: asked the server once');
assert.equal(asked, 1);
assert.equal((await lookupCode(db, online, 'B', 'NEW-001')).row?.productId, NEW);
assert.equal(asked, 1, 'and kept, so the next scan does not ask again');
assert.deepEqual(await lookupCode(db, online, 'B', 'NOPE-9'), { row: null }, 'no product has it');
const offline = { byCode: async () => { throw Object.assign(new Error('Network'), { status: 0 }); } };
assert.deepEqual(await lookupCode(db, offline, 'B', 'NOPE-9'), { row: null, offline: true }, 'offline: could not ask');
assert.equal((await lookupCode(db, offline, 'B', 'KUR-M-001')).row?.variantId, 'VM', 'offline: the phone copy still answers');

/* ───────────── a save on this phone ───────────── */

await cacheProduct(db, { productId: T, name: 'Steel Tumbler Big', price: 12900, sku: 'TUM-BIG', active: true, variants: [] });
assert.equal(await findByCode(db, '8901234567890'), null, 'a changed code is gone at once');
assert.equal((await findByCode(db, 'TUM-BIG')).price, 12900);
await uncacheProduct(db, T);
assert.equal(await findByCode(db, 'TUM-BIG'), null, 'a deleted product is gone');

/* ───────────── labels and scan card ───────────── */

const bars = code128Pattern('KUR-M-001');
assert.ok(bars.startsWith('11010010000'), 'Code128 starts with Start B');
assert.ok(bars.endsWith('1100011101011'), 'and ends with the stop pattern');
const label = { name: 'Cotton <Kurti>', size: 'M', price: '₹499', code: 'KUR-M-001', copies: 70 };
const sheet = labelsHtml({ store: 'Asha', labels: [label], layout: 'a4-65' });
assert.equal((sheet.match(/class="page"/g) ?? []).length, 2, '70 stickers fill one 65-sheet and start another');
assert.equal((sheet.match(/class="label"/g) ?? []).length, 70);
assert.ok(sheet.includes('Cotton &lt;Kurti&gt;') && !sheet.includes('<Kurti>'), 'names are escaped');
const thermal = labelsHtml({ store: 'Asha', labels: [{ ...label, copies: 3 }], layout: 'thermal-50x25' });
assert.equal((thermal.match(/class="label"/g) ?? []).length, 3, 'one 50 × 25 mm label per copy');
assert.ok(thermal.includes('size: 50mm 25mm'));
assert.equal((scanCardHtml({ store: 'Asha', title: 'Scan card', rows: [label, label] }).match(/class="cell"/g) ?? []).length, 2);

/* ───────────── counter-only shops ───────────── */

assert.deepEqual(visibilityFields({ books: true, active: false, featured: true }), {},
  'a shop without a website sends no visibility: its products keep what they had');
assert.deepEqual(visibilityFields({ books: false, active: false, featured: true }), { active: false, featured: true });
const bookScreen = readFileSync(new URL('../app/book/index.jsx', import.meta.url), 'utf8');
assert.ok(bookScreen.includes("router.push('/(tabs)/products')") && bookScreen.includes("t('Products & barcodes')"),
  'the bill book links to Products & barcodes');
const search = readFileSync(new URL('../src/lib/useProductSearch.js', import.meta.url), 'utf8');
assert.ok(!/active:\s*'true'/.test(search), 'My products on a bill is not limited to products shown online');

console.log('✓ Products copy: indexed code lookup, suggestions, same item +1, 1.2 s scan cooldown, online once then cached, offline fallback; Code128 labels and scan card.');
