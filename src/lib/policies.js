import {
  POLICY_DOCUMENTS, POLICY_MAX_CHARS, POLICY_TYPES, RETURN_WINDOW_MAX_DAYS, policyDocumentPatchSchema, wholeNumberText,
} from '@storekit/validation';

/**
 * Store policies in the app: the return rule and the four documents. Every rule is the API's
 * own schema — the app decides nothing the server would not.
 */

export { POLICY_DOCUMENTS, POLICY_MAX_CHARS, POLICY_TYPES, RETURN_WINDOW_MAX_DAYS };

/** What customers see for the return rule. */
export const returnsLabel = ({ returnsAllowed, returnWindowDays }) =>
  (returnsAllowed ? `${returnWindowDays}-day return policy` : 'No returns allowed');

/** The saved return rule as form text. */
export const tradeToForm = (trade) => ({
  returnsAllowed: Boolean(trade?.returnsAllowed),
  returnWindowDays: trade?.returnWindowDays ? String(trade.returnWindowDays) : '',
});

/**
 * The return form as a save. With returns off, only that is sent: the window is not applicable,
 * and the server keeps the saved one for when returns are turned back on.
 * Returns { ok, patch } or { ok: false, error }.
 */
export const tradeFromForm = (form) => {
  if (!form.returnsAllowed) return { ok: true, patch: { trade: { returnsAllowed: false } } };
  const days = wholeNumberText({ min: 1, max: RETURN_WINDOW_MAX_DAYS, label: 'Return window' }).safeParse(form.returnWindowDays);
  if (!days.success) return { ok: false, error: days.error.issues[0].message };
  return { ok: true, patch: { trade: { returnsAllowed: true, returnWindowDays: days.data } } };
};

/** The customer-facing preview under the return form, even while the days are being typed. */
export const tradePreview = (form) => {
  if (!form.returnsAllowed) return 'No returns allowed';
  const result = tradeFromForm(form);
  return result.ok ? returnsLabel(result.patch.trade) : null;
};

/**
 * One document's editor state as a save: only what changed is sent, so a save never touches
 * the other documents. Returns { ok, patch } (patch null when nothing changed) or { ok: false, error }.
 */
export const documentSave = (type, saved, draft) => {
  const changes = {};
  if (draft.enabled !== saved.enabled) changes.enabled = draft.enabled;
  if (draft.content !== saved.content) changes.content = draft.content;
  if (Object.keys(changes).length === 0) return { ok: true, patch: null };

  const checked = policyDocumentPatchSchema.safeParse(changes);
  if (!checked.success) return { ok: false, error: checked.error.issues[0].message };
  if (draft.enabled && !checked.data.content && !String(draft.content).trim()) {
    return { ok: false, error: 'A policy shown to customers needs some text. Write it, reset it to the template, or hide it.' };
  }
  return { ok: true, patch: { documents: { [type]: checked.data } } };
};

/** The rows of the Policies screen, in their fixed order. */
export const documentRows = (documents) =>
  POLICY_TYPES.map((type) => ({ type, title: documents?.[type]?.title ?? POLICY_DOCUMENTS[type].title, enabled: Boolean(documents?.[type]?.enabled) }));
