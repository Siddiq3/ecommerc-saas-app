#!/usr/bin/env node
/** Checks src/lib/notifications.js: a tapped notification opens its order or product, and nothing else. */
import assert from 'node:assert/strict';
import { notificationTarget } from '../src/lib/notifications.js';

const ID = '01M3M063GFRX8H2XBQT21RPD88';
assert.equal(notificationTarget({ type: 'order_created', link: `/orders/${ID}` }), `/orders/${ID}`, 'the API\'s link is followed');
assert.equal(notificationTarget({ type: 'upi_submitted', link: `/orders/${ID}` }), `/orders/${ID}`);
assert.equal(notificationTarget({ type: 'low_stock', link: `/products/${ID}` }), `/products/${ID}`);
assert.equal(notificationTarget({ orderId: ID }), `/orders/${ID}`, 'older shape still works');
for (const link of ['/settings/subscription', 'https://evil.example/orders/1', '/orders/../settings', '/orders/', `/orders/${ID}/cancel`]) {
  assert.equal(notificationTarget({ link }), null, `refuses ${link}`);
}
assert.equal(notificationTarget({ type: 'domain_active' }), null, 'nowhere to go');
console.log('✓ Notifications: order and product links open the right screen, and nothing else.');
