import assert from 'node:assert/strict';
import {
  parseCsv, detectFormat, readProductFile, groupsOf, plainText, paise, cleanName, cleanSku, TEMPLATE_CSV, MAX_PHOTOS,
} from '../src/lib/productImport.js';

// CSV: quotes, "" inside quotes, a line break inside a quoted field, CRLF, a byte-order mark.
assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","say ""hi""\nthere"\r\n\r\n'), [['a', 'b'], ['x, y', 'say "hi"\nthere']]);
assert.deepEqual(parseCsv('a,b\n1,'), [['a', 'b'], ['1', '']]);

assert.equal(detectFormat(['Handle', 'Title', 'Variant Price']), 'shopify');
assert.equal(detectFormat(['ID', 'Type', 'Name', 'Regular price']), 'woocommerce');
assert.equal(detectFormat(['Name', 'Price']), 'template');
assert.equal(detectFormat(['foo']), null);

assert.equal(paise('₹1,299.50'), 129950);
assert.equal(paise(''), undefined);
assert.equal(paise('free'), undefined);
assert.equal(cleanName('  ★ Silk Saree | Red — 6m™ '), 'Silk Saree Red - 6m');
assert.equal(cleanSku('ab 12#x'), 'AB-12-X');
assert.equal(plainText('<p>Soft &amp; light</p><ul><li>Cotton</li></ul><script>x</script>a < b'), 'Soft & light\n• Cotton\nxa b');

// Shopify: one product per handle; rows after the first carry variants and more photos.
const shopify = [
  'Handle,Title,Body (HTML),Type,Status,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Variant SKU,Variant Inventory Qty,Variant Price,Variant Compare At Price,Image Src,Image Position',
  'kurti,Cotton Kurti,<p>Soft cotton</p>,Kurtis,active,Size,M,Colour,Red,K-M-R,4,499.00,799.00,https://cdn.shop/k1.jpg,1',
  'kurti,,,,,,L,,Red,K-L-R,6,549.00,799.00,https://cdn.shop/k2.jpg,2',
  'kurti,,,,,,,,,,,,,https://cdn.shop/k3.jpg,3',
  'kurti,,,,,,,,,,,,,https://cdn.shop/k4.jpg,4',
  'mug,Steel Mug,,Kitchen,draft,Title,Default Title,,,MUG-1,10,189,,https://cdn.shop/m.jpg,1',
  'bad,No Price Thing,,,active,Title,Default Title,,,,1,,,,',
].join('\n');
const s = readProductFile(shopify, new Set());
assert.equal(s.format, 'shopify');
assert.equal(s.ready.length, 2);
const kurti = s.ready.find((p) => p.input.name === 'Cotton Kurti');
assert.equal(kurti.input.price, 49900, 'the lowest variant price');
assert.equal(kurti.input.stock, 10, 'stock is the variants added up');
assert.deepEqual(kurti.input.variantOptions, [{ name: 'Size', values: ['M', 'L'] }, { name: 'Colour', values: ['Red'] }]);
assert.deepEqual(kurti.input.variants.map((v) => [v.attributes, v.price, v.mrp, v.stock, v.sku]), [
  [{ Size: 'M', Colour: 'Red' }, 49900, 79900, 4, 'K-M-R'],
  [{ Size: 'L', Colour: 'Red' }, 54900, 79900, 6, 'K-L-R'],
]);
assert.equal(kurti.images.length, MAX_PHOTOS, 'only the first photos');
assert.equal(kurti.images[0], 'https://cdn.shop/k1.jpg');
assert.equal(kurti.category, 'Kurtis');
assert.equal(kurti.input.description, 'Soft cotton');
const mug = s.ready.find((p) => p.input.name === 'Steel Mug');
assert.deepEqual([mug.input.price, mug.input.stock, mug.input.sku, mug.input.active, mug.input.variants], [18900, 10, 'MUG-1', false, undefined]);
assert.deepEqual(s.problems, [{ row: 7, name: 'No Price Thing', message: 'Price missing or not a number' }]);

// Already in the store (by name, any case): skipped, not doubled.
assert.equal(readProductFile(shopify, new Set(['steel mug'])).already, 1);

// WooCommerce: a variable product and its variations, a simple product on sale.
const woo = [
  'ID,Type,SKU,Name,Published,Description,Sale price,Regular price,Stock,Categories,Images,Parent,Attribute 1 name,Attribute 1 value(s)',
  '10,variable,TEE,Plain Tee,1,Basic tee,,,,"Clothing > T-shirts","https://w.shop/t1.jpg, https://w.shop/t2.jpg",,Size,"S, M"',
  '11,variation,TEE-S,Plain Tee - S,1,,,299,3,,,id:10,Size,S',
  '12,variation,TEE-M,Plain Tee - M,1,,249,299,5,,,id:10,Size,M',
  '13,simple,RICE5,Basmati Rice 5kg,1,,450,520,20,Grocery,https://w.shop/r.jpg,,,',
].join('\n');
const w = readProductFile(woo);
assert.equal(w.format, 'woocommerce');
assert.equal(w.ready.length, 2);
const tee = w.ready.find((p) => p.input.name === 'Plain Tee');
assert.equal(tee.category, 'T-shirts');
assert.deepEqual(tee.images, ['https://w.shop/t1.jpg', 'https://w.shop/t2.jpg']);
assert.deepEqual(tee.input.variants.map((v) => [v.attributes.Size, v.price, v.mrp, v.stock]), [['S', 29900, undefined, 3], ['M', 24900, 29900, 5]]);
const rice = w.ready.find((p) => p.input.name === 'Basmati Rice 5kg');
assert.deepEqual([rice.input.price, rice.input.mrp, rice.input.stock, rice.category], [45000, 52000, 20, 'Grocery']);

// The template the app shares reads back as one product.
const t = readProductFile(TEMPLATE_CSV);
assert.equal(t.format, 'template');
assert.deepEqual(t.ready.map((p) => [p.input.name, p.input.price, p.input.mrp, p.input.stock, p.category, p.images]), [
  ['Cotton Kurti', 49900, 79900, 10, 'Kurtis', ['https://example.com/kurti.jpg']],
]);

assert.deepEqual(readProductFile('foo,bar\n1,2'), { error: 'unknown' });
assert.deepEqual(readProductFile(''), { error: 'empty' });

// Groups for one server call each: at most 25 products, and under the size limit however long the descriptions.
const small = Array.from({ length: 60 }, (_, i) => ({ input: { name: `Item ${i}`, price: 100 }, images: [] }));
assert.deepEqual(groupsOf(small).map((g) => g.length), [25, 25, 10]);
const big = Array.from({ length: 30 }, (_, i) => ({ input: { name: `Long ${i}`, price: 100, description: 'x'.repeat(8000) }, images: ['a', 'b', 'c'] }));
const bigGroups = groupsOf(big);
assert.ok(bigGroups.every((g) => JSON.stringify({ products: g.map((x) => x.input) }).length < 200_000), 'each call stays well under 256 KB');
assert.equal(bigGroups.flat().length, 30, 'nothing lost between groups');

console.log('✓ Product import reads Shopify, WooCommerce and the template: variants, photos, prices, problems and duplicates.');
