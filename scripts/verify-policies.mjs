#!/usr/bin/env node
/**
 * Checks src/lib/policies.js: how the Policies screens turn the return rule and a document's
 * edits into what the API receives. Every save is also checked against the API's own schema,
 * so a save this script accepts is one the API accepts.
 *
 * The screens themselves are checked by hand; this is the logic under them, where a slip would
 * erase a policy or show customers the wrong return rule.
 */
import assert from 'node:assert/strict';
import { updatePoliciesSchema } from '@storekit/validation';
import {
  POLICY_MAX_CHARS, POLICY_TYPES, documentRows, documentSave, returnsLabel, tradeFromForm, tradePreview, tradeToForm,
} from '../src/lib/policies.js';

const apiAccepts = (patch) => {
  const result = updatePoliciesSchema.safeParse(patch);
  assert.equal(result.success, true, JSON.stringify(result.error?.issues));
};

/* ───────────── The return rule ───────────── */

{
  assert.equal(returnsLabel({ returnsAllowed: true, returnWindowDays: 7 }), '7-day return policy');
  assert.equal(returnsLabel({ returnsAllowed: true, returnWindowDays: 30 }), '30-day return policy', 'never a hard-coded 7');
  assert.equal(returnsLabel({ returnsAllowed: false, returnWindowDays: 30 }), 'No returns allowed');

  assert.deepEqual(tradeToForm({ returnsAllowed: true, returnWindowDays: 14 }), { returnsAllowed: true, returnWindowDays: '14' });

  const on = tradeFromForm({ returnsAllowed: true, returnWindowDays: ' 30 ' });
  assert.deepEqual(on, { ok: true, patch: { trade: { returnsAllowed: true, returnWindowDays: 30 } } });
  apiAccepts(on.patch);

  // Returns off: the window is not applicable, so it is not sent — even a leftover invalid one.
  const off = tradeFromForm({ returnsAllowed: false, returnWindowDays: 'abc' });
  assert.deepEqual(off, { ok: true, patch: { trade: { returnsAllowed: false } } });
  apiAccepts(off.patch);

  for (const bad of ['', '0', '366', '7.5', '-1', 'seven']) {
    const result = tradeFromForm({ returnsAllowed: true, returnWindowDays: bad });
    assert.equal(result.ok, false, `refuses a window of "${bad}"`);
    assert.ok(result.error);
  }
  assert.equal(tradeFromForm({ returnsAllowed: true, returnWindowDays: '1' }).ok, true);
  assert.equal(tradeFromForm({ returnsAllowed: true, returnWindowDays: '365' }).ok, true);

  assert.equal(tradePreview({ returnsAllowed: true, returnWindowDays: '15' }), '15-day return policy');
  assert.equal(tradePreview({ returnsAllowed: false, returnWindowDays: '' }), 'No returns allowed');
  assert.equal(tradePreview({ returnsAllowed: true, returnWindowDays: '0' }), null, 'no preview for a window that cannot be saved');
}

/* ───────────── A document's save ───────────── */

{
  const saved = { enabled: true, content: 'Our privacy policy.' };

  assert.deepEqual(documentSave('privacy', saved, saved), { ok: true, patch: null }, 'nothing changed, nothing sent');

  const edited = documentSave('privacy', saved, { enabled: true, content: 'New text.' });
  assert.deepEqual(edited, { ok: true, patch: { documents: { privacy: { content: 'New text.' } } } }, 'only the changed field, only this document');
  apiAccepts(edited.patch);

  const hidden = documentSave('terms', saved, { enabled: false, content: saved.content });
  assert.deepEqual(hidden, { ok: true, patch: { documents: { terms: { enabled: false } } } }, 'hiding does not resend the text');
  apiAccepts(hidden.patch);

  assert.equal(documentSave('privacy', saved, { enabled: true, content: '   ' }).ok, false, 'a shown policy needs text');
  assert.equal(documentSave('privacy', saved, { enabled: false, content: '' }).ok, true, 'an empty policy can be hidden');
  assert.match(documentSave('privacy', saved, { enabled: true, content: 'Hi <script>alert(1)</script>' }).error, /"<"/, 'no markup');
  assert.equal(documentSave('privacy', saved, { enabled: true, content: 'x'.repeat(POLICY_MAX_CHARS + 1) }).ok, false, 'too long');
  assert.equal(documentSave('privacy', saved, { enabled: true, content: 'x'.repeat(POLICY_MAX_CHARS) }).ok, true, 'right at the limit');
}

/* ───────────── The four documents ───────────── */

{
  assert.deepEqual(POLICY_TYPES, ['privacy', 'terms', 'refund', 'shipping']);
  const rows = documentRows({
    privacy: { title: 'Privacy Policy', enabled: true },
    terms: { title: 'Terms & Conditions', enabled: false },
    refund: { title: 'Refund & Cancellation Policy', enabled: true },
    shipping: { title: 'Shipping & Delivery Policy', enabled: true },
  });
  assert.deepEqual(rows.map((r) => [r.type, r.enabled]), [['privacy', true], ['terms', false], ['refund', true], ['shipping', true]]);
  assert.equal(documentRows({}).length, 4, 'always the four, even before they load');
}

console.log('✓ Policies: return rule, document saves, validation and the four documents all behave.');
