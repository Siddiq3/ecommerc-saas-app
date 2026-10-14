import assert from 'node:assert/strict';
import { updateStoreSettingsSchema } from '@storekit/validation';
import { moveItem, storefrontDraft, storefrontPatch } from '../src/lib/merchandising.js';
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
