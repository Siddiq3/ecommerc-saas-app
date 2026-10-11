import { strict as assert } from 'node:assert';
import { canManageInstagramPath } from '../src/lib/instagram-access.js';
for (const path of ['/social', '/(tabs)/social', '/instagram/ALL~LINK', '/instagram/1800000000001~PRICE'])
  assert.equal(canManageInstagramPath(path), true, path);
for (const path of ['/instagram/new', '/instagram/new/extra', '/products', '/orders/1', '/settings/store', '/instagram', '/', null])
  assert.equal(canManageInstagramPath(path), false, String(path));
console.log('✓ Expired Instagram management routes are accessible; creation and unrelated app screens remain locked.');
