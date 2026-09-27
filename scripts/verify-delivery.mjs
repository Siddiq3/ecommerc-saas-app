#!/usr/bin/env node
/**
 * Checks src/lib/delivery.js: how the Delivery screen turns saved settings into form text and
 * back into what the API receives, and how it adds, replaces and removes methods and areas.
 *
 * The screens themselves are checked by hand; this is the logic under them, where a slip would
 * save the wrong price. Every rule here is the API's own schema, so a form the script accepts
 * is one the API accepts.
 */
import assert from 'node:assert/strict';
import { deliverySettingsSchema } from '@storekit/validation';
import {
  blankMethod, estimateSummary, fromForm, priceSummary, toForm, withArea, withMethod, withoutMethod,
} from '../src/lib/delivery.js';

const method = (overrides = {}) => ({
  ...blankMethod({ primary: true }),
  id: 'standard01',
  name: 'Standard',
  ...overrides,
  pricing: { ...blankMethod().pricing, ...(overrides.pricing ?? {}) },
  estimate: { ...blankMethod().estimate, ...(overrides.estimate ?? {}) },
});
const roundTrip = (m) => {
  const result = fromForm(toForm(m));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  return result.method;
};
const errorsOf = (m, formChanges) => {
  const result = fromForm({ ...toForm(m), ...formChanges });
  assert.equal(result.ok, false, 'expected the form to be refused');
  return result.errors;
};

/* ───────────── Settings → form ───────────── */

{
  const form = toForm(method({
    pricing: { type: 'tiered', tiers: { district: 2000, state: 4050, national: 9000 }, freeAbove: 75_000 },
    pincodeRules: [{ pincodePrefix: '5000', fee: 1500 }],
    estimate: { type: 'days', minDays: 2, maxDays: 5, show: false },
  }));
  assert.deepEqual(
    [form.district, form.state, form.national, form.freeAboveOn, form.freeAbove, form.minDays, form.maxDays, form.showEstimate],
    ['20', '40.5', '90', true, '750', '2', '5', false],
    'amounts are shown in rupees, days as text',
  );
  assert.deepEqual(form.pincodeRules, [{ pincodePrefix: '5000', fee: '15' }]);
  assert.equal(toForm(method()).freeAboveOn, false, 'no threshold: the switch starts off');
  assert.equal(toForm(method()).flatFee, '', 'a zero amount starts as an empty field, not "0"');
}

/* ───────────── Form → API payload (round trips) ───────────── */

{
  const free = method();
  assert.deepEqual(roundTrip(free), free, 'free delivery');

  const flat = method({ pricing: { type: 'flat', flatFee: 4900, freeAbove: 75_000 } });
  assert.deepEqual(roundTrip(flat), flat, 'flat fee with free-above');

  const tiered = method({
    pricing: { type: 'tiered', tiers: { district: 2000, state: 4000, national: 9000 } },
    pincodeRules: [{ pincodePrefix: '500081', fee: 500 }, { pincodePrefix: '56', fee: 12_000 }],
  });
  assert.deepEqual(roundTrip(tiered), tiered, 'by area, with pincode prices');

  const pickup = method({ kind: 'pickup', name: 'Pickup', estimate: { type: 'same_day', minDays: 0, maxDays: 0 } });
  assert.deepEqual(roundTrip(pickup), pickup, 'pickup');

  const secondary = method({ id: 'express001', name: 'Express', primary: false, active: false });
  assert.deepEqual(roundTrip(secondary), secondary, 'a switched-off, non-main method keeps its flags');

  const unsaved = { ...method(), id: undefined };
  delete unsaved.id;
  assert.equal('id' in roundTrip(unsaved), false, 'a new method is sent without an id; the server assigns one');
}

/* ───────────── What the payload never carries ───────────── */

{
  // Switching a flat method to free: the old fee and threshold are not sent along.
  const switched = fromForm({ ...toForm(method({ pricing: { type: 'flat', flatFee: 4900, freeAbove: 75_000 } })), pricingType: 'free' });
  assert.equal(switched.ok, true);
  assert.deepEqual(switched.method.pricing, { type: 'free', flatFee: 0, tiers: { district: 0, state: 0, national: 0 }, freeAbove: 0 });

  // Free-above switched off: no threshold, whatever is left in the field.
  const off = fromForm({ ...toForm(method({ pricing: { type: 'flat', flatFee: 4900, freeAbove: 75_000 } })), freeAboveOn: false });
  assert.equal(off.method.pricing.freeAbove, 0);

  // Pickup drops any delivery pricing and pincode prices, and is always free.
  const toPickup = fromForm({ ...toForm(method({ pricing: { type: 'flat', flatFee: 4900 }, pincodeRules: [{ pincodePrefix: '5', fee: 100 }] })), kind: 'pickup' });
  assert.equal(toPickup.ok, true, JSON.stringify(toPickup.errors));
  assert.equal(toPickup.method.pricing.type, 'free');
  assert.deepEqual(toPickup.method.pincodeRules, []);
}

/* ───────────── Estimates ───────────── */

{
  const sameDay = fromForm({ ...toForm(method()), estimateType: 'same_day', minDays: 'x', maxDays: '' });
  assert.deepEqual(sameDay.method.estimate, { type: 'same_day', minDays: 0, maxDays: 0, show: true }, 'same day ignores the day fields');
  const nextDay = fromForm({ ...toForm(method()), estimateType: 'next_day' });
  assert.deepEqual([nextDay.method.estimate.minDays, nextDay.method.estimate.maxDays], [1, 1]);
  assert.equal(fromForm({ ...toForm(method()), showEstimate: false }).method.estimate.show, false);

  assert.equal(estimateSummary(method({ estimate: { type: 'same_day', minDays: 0, maxDays: 0 } })), 'Arrives same day');
  assert.equal(estimateSummary(method({ estimate: { type: 'next_day', minDays: 1, maxDays: 1 } })), 'Arrives next day');
  assert.equal(estimateSummary(method({ estimate: { minDays: 2, maxDays: 7 } })), 'Arrives in 2–7 days');
  assert.equal(estimateSummary(method({ estimate: { minDays: 3, maxDays: 3 } })), 'Arrives in 3 days');
  assert.equal(estimateSummary(method({ kind: 'pickup', estimate: { type: 'same_day', minDays: 0, maxDays: 0 } })), 'Ready same day');
  assert.equal(estimateSummary(method({ estimate: { show: false } })), 'Estimate not shown to customers');
}

/* ───────────── Invalid and missing values ───────────── */

{
  assert.ok(errorsOf(method(), { name: '  ' }).name, 'a name is required');
  assert.match(errorsOf(method(), { pricingType: 'flat', flatFee: '' }).flatFee, /rupees/, 'a flat fee is required');
  assert.match(errorsOf(method(), { pricingType: 'flat', flatFee: '0' }).flatFee, /above zero/, 'a flat fee of zero is refused');
  assert.ok(errorsOf(method(), { pricingType: 'flat', flatFee: '12.345' }).flatFee, 'more than two decimals is refused');
  const tierErrors = errorsOf(method(), { pricingType: 'tiered', district: '20', state: '', national: 'abc' });
  assert.ok(tierErrors.state && tierErrors.national && !tierErrors.district, 'each missing area price is flagged on its own field');
  assert.ok(errorsOf(method(), { pricingType: 'flat', flatFee: '49', freeAboveOn: true, freeAbove: '' }).freeAbove, 'an empty threshold is refused');
  assert.ok(errorsOf(method(), { pincodeRules: [{ pincodePrefix: '0123', fee: '10' }] })['rule.0'], 'a pincode cannot start with 0');
  assert.ok(errorsOf(method(), { pincodeRules: [{ pincodePrefix: '500', fee: '' }] })['rule.0'], 'a pincode price needs an amount');
  assert.ok(errorsOf(method(), { pincodeRules: [{ pincodePrefix: '500', fee: '10' }, { pincodePrefix: '500', fee: '20' }] }).pincodeRules, 'a pincode listed twice is refused');
  assert.ok(errorsOf(method(), { estimateType: 'days', minDays: '5', maxDays: '2' }).maxDays, 'the range cannot end before it starts');
  assert.ok(errorsOf(method(), { estimateType: 'days', minDays: '0', maxDays: '2' }).minDays, 'a day range starts at 1; same day is its own choice');
  assert.ok(errorsOf(method(), { estimateType: 'days', minDays: 'two', maxDays: '5' }).minDays, 'days must be whole numbers');
}

/* ───────────── Price summaries ───────────── */

{
  assert.equal(priceSummary(method()), 'Free delivery');
  assert.equal(priceSummary(method({ pricing: { type: 'flat', flatFee: 4900 } })), '₹49');
  assert.equal(priceSummary(method({ pricing: { type: 'flat', flatFee: 4900, freeAbove: 75_000 } })), '₹49 · free above ₹750');
  assert.equal(priceSummary(method({ pricing: { type: 'tiered', tiers: { district: 2000, state: 4000, national: 9000 } } })), '₹20 / ₹40 / ₹90 by area');
  assert.equal(priceSummary(method({ pincodeRules: [{ pincodePrefix: '5', fee: 1 }, { pincodePrefix: '6', fee: 2 }] })), 'Free delivery · 2 pincode prices');
  assert.equal(priceSummary(method({ kind: 'pickup' })), 'Free pickup');
}

/* ───────────── Several methods: add, replace, main, remove ───────────── */

{
  const standard = method();
  const express = method({ id: 'express001', name: 'Express', primary: false, pricing: { type: 'flat', flatFee: 14_900 } });
  let settings = { serviceablePincodePrefixes: [], methods: [standard] };

  settings = withMethod(settings, -1, express);
  assert.deepEqual(settings.methods.map((m) => m.name), ['Standard', 'Express'], 'added at the end');
  assert.equal(deliverySettingsSchema.safeParse(settings).success, true, 'two methods, one main: valid for the API');

  settings = withMethod(settings, 1, { ...express, primary: true });
  assert.deepEqual(settings.methods.map((m) => m.primary), [false, true], 'making one main un-makes the other');
  assert.equal(deliverySettingsSchema.safeParse(settings).success, true);

  settings = withMethod(settings, 0, { ...standard, primary: false, active: false });
  assert.deepEqual(settings.methods.map((m) => [m.active, m.primary]), [[false, false], [true, true]], 'a non-main method can be switched off');

  assert.equal(withoutMethod(settings, 1), settings, 'the main method cannot be removed');
  settings = withoutMethod(settings, 0);
  assert.deepEqual(settings.methods.map((m) => m.name), ['Express']);
  assert.equal(withoutMethod(settings, 0), settings, 'the last method cannot be removed');
}

/* ───────────── Delivery areas ───────────── */

{
  const empty = { serviceablePincodePrefixes: [], methods: [method()] };
  const added = withArea(empty, ' 5000 ');
  assert.deepEqual(added.settings.serviceablePincodePrefixes, ['5000'], 'trimmed and added');
  assert.match(withArea(added.settings, '5000').error, /already listed/);
  assert.match(withArea(empty, '0500').error, /pincode/);
  assert.match(withArea(empty, '5000001').error, /pincode/, 'more than six digits');
  assert.match(withArea(empty, '').error, /pincode/);
  assert.equal(deliverySettingsSchema.safeParse(added.settings).success, true);
}

console.log('✓ Delivery settings: form conversion, payload, methods, areas and validation all behave.');
