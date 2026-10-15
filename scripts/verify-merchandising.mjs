import assert from 'node:assert/strict';
import { updateStoreSettingsSchema } from '@storekit/validation';
import { announcementIdeas, categoryLink, linkLabel, moveItem, productLink, storefrontDraft, storefrontPatch } from '../src/lib/merchandising.js';
import { STORE_STYLES } from '../src/lib/storeStyles.js';
const key = 'businesses/01ARZ3NDEKTSV4RRFFQ69G5FAV/banners/01ARZ3NDEKTSV4RRFFQ69G5FAW.webp';
const draft = storefrontDraft({ theme: STORE_STYLES[0].theme, banners: [{ imageKey: key, imageUrl: 'https://cdn.example/a.webp', link: '/products', alt: 'Sale', sortOrder: 9 }], sections: [{ type: 'sale', enabled: true, title: 'On sale', sortOrder: 8 }] });
const patch = storefrontPatch(draft);
assert.equal(patch.banners[0].imageUrl, undefined);
assert.equal(patch.banners[0].sortOrder, 0);
assert.equal(patch.sections[0].sortOrder, 0);
assert(updateStoreSettingsSchema.safeParse(patch).success);
const original = ['a', 'b', 'c'];
assert.deepEqual(moveItem(original, 1, -1), ['b', 'a', 'c']);
assert.deepEqual(moveItem(original, 1, 1), ['a', 'c', 'b']);
assert.deepEqual(moveItem(original, 0, -1), original);
assert.deepEqual(original, ['a', 'b', 'c']);
for (const link of ['/products/../admin', '/products/%2e%2e/admin', '/products/%2fadmin', '//evil.com', 'javascript:alert(1)']) {
 assert.equal(updateStoreSettingsSchema.safeParse({ banners: [{ imageKey: key, link }] }).success, false, link);
}
console.log('✓ Storefront drafts keep preview URLs out of saves, order correctly, and reject invalid banner links.');

// Plain-language helpers on the Storefront screen.
{
  const cats = [{ slug: 'sarees', name: 'Sarees' }];
  assert.equal(linkLabel('', cats), 'Nothing, just show the picture');
  assert.equal(linkLabel('/products'), 'All products');
  assert.equal(linkLabel('/category/sarees', cats), 'Sarees');
  assert.equal(linkLabel('/category/bridal-wear'), 'Bridal Wear');
  assert.equal(linkLabel('/products/silk-saree--01ARZ3NDEKTSV4RRFFQ69G5FAV'), 'Silk Saree');
  assert.equal(linkLabel('https://instagram.com/meera'), 'instagram.com');
  assert.equal(categoryLink(cats[0]), '/category/sarees');
  const product = productLink({ slug: 'silk-saree', productId: '01ARZ3NDEKTSV4RRFFQ69G5FAV' });
  for (const link of [categoryLink(cats[0]), product, '/products']) {
    assert(updateStoreSettingsSchema.safeParse({ banners: [{ imageKey: key, link }] }).success, link);
  }
  const free = { delivery: { methods: [{ active: true, primary: true, pricing: { type: 'flat', freeAbove: 99900 } }] }, payments: { codEnabled: true } };
  const ideas = announcementIdeas(free, [{ code: 'FESTIVE10', type: 'percentage', value: 10, showOnStorefront: true }]);
  assert.deepEqual(ideas.slice(0, 3), ['Free delivery on orders above ₹999', 'Cash on delivery available', 'Use code FESTIVE10 for 10% off']);
  assert(!announcementIdeas({ payments: { codEnabled: false } }).some((i) => /Cash on delivery|Free delivery|code/.test(i)));
  for (const idea of ideas) assert(updateStoreSettingsSchema.safeParse({ announcement: { text: idea, enabled: true } }).success, idea);
  console.log('✓ Storefront helpers suggest only true announcements and turn picked links into valid banner paths.');
}
