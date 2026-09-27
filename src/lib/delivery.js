import { formatMoney, toMajor } from '@storekit/shared';
import { MAX_DELIVERY_METHODS, deliveryMethodSchema, rupeesText, wholeNumberText } from '@storekit/validation';
import { fieldErrors } from './validation.js';

/**
 * Delivery settings in the app: summaries for the overview, and the conversion between a saved
 * method and the text a form edits. Every rule comes from the server's own schema — the app
 * has no delivery rules of its own.
 */

export { MAX_DELIVERY_METHODS };

/** A method for the owner to fill in: delivery, free, 2–7 days. Not saved until they save. */
export const blankMethod = ({ primary = false } = {}) => ({
  name: '',
  description: '',
  kind: 'delivery',
  active: true,
  primary,
  pricing: { type: 'free', flatFee: 0, tiers: { district: 0, state: 0, national: 0 }, freeAbove: 0 },
  pincodeRules: [],
  estimate: { type: 'days', minDays: 2, maxDays: 7, show: true },
});

/** "Free", "₹49", "₹20 / ₹40 / ₹90 by area" — plus the free-delivery threshold when there is one. */
export const priceSummary = (method) => {
  if (method.kind === 'pickup') return 'Free pickup';
  const { type, flatFee, tiers, freeAbove } = method.pricing;
  let text = 'Free delivery';
  if (type === 'flat') text = formatMoney(flatFee);
  if (type === 'tiered') text = `${formatMoney(tiers.district)} / ${formatMoney(tiers.state)} / ${formatMoney(tiers.national)} by area`;
  if (type !== 'free' && freeAbove > 0) text += ` · free above ${formatMoney(freeAbove)}`;
  const overrides = method.pincodeRules.length;
  if (overrides) text += ` · ${overrides} pincode price${overrides === 1 ? '' : 's'}`;
  return text;
};

/** "Same day", "Next day", "2–7 days", or that it is hidden from customers. */
export const estimateSummary = ({ estimate, kind }) => {
  if (!estimate.show) return 'Estimate not shown to customers';
  const ready = kind === 'pickup' ? 'Ready' : 'Arrives';
  if (estimate.type === 'same_day') return `${ready} same day`;
  if (estimate.type === 'next_day') return `${ready} next day`;
  return estimate.minDays === estimate.maxDays ? `${ready} in ${estimate.minDays} days` : `${ready} in ${estimate.minDays}–${estimate.maxDays} days`;
};

const rupees = (paise) => (paise ? String(toMajor(paise)) : '');

/** A saved method as editable text. */
export const toForm = (method) => ({
  id: method.id,
  name: method.name,
  description: method.description,
  kind: method.kind,
  active: method.active,
  primary: method.primary,
  pricingType: method.pricing.type,
  flatFee: rupees(method.pricing.flatFee),
  district: rupees(method.pricing.tiers.district),
  state: rupees(method.pricing.tiers.state),
  national: rupees(method.pricing.tiers.national),
  freeAboveOn: method.pricing.freeAbove > 0,
  freeAbove: rupees(method.pricing.freeAbove),
  pincodeRules: method.pincodeRules.map((rule) => ({ pincodePrefix: rule.pincodePrefix, fee: rupees(rule.fee) })),
  estimateType: method.estimate.type,
  minDays: String(method.estimate.minDays),
  maxDays: String(method.estimate.maxDays),
  showEstimate: method.estimate.show,
});

const FIELD_FOR_PATH = {
  'pricing.flatFee': 'flatFee',
  'pricing.freeAbove': 'freeAbove',
  'pricing.tiers.district': 'district',
  'pricing.tiers.state': 'state',
  'pricing.tiers.national': 'national',
  'pricing.type': 'pricingType',
  'estimate.minDays': 'minDays',
  'estimate.maxDays': 'maxDays',
};

/**
 * Editable text back to a method, checked with the API's schema. Fields a choice does not use
 * (a flat fee when the method is free) are saved as 0, so switching back starts clean.
 * Returns { ok, method } or { ok: false, errors } keyed by form field.
 */
export const fromForm = (form) => {
  const errors = {};
  const money = (key, text, label, required) => {
    if (!required) return 0;
    const result = rupeesText(label).safeParse(text);
    if (result.success) return result.data;
    errors[key] = result.error.issues[0].message;
    return 0;
  };
  const days = (key, text, label) => {
    const result = wholeNumberText({ label, max: 60 }).safeParse(text);
    if (result.success) return result.data;
    errors[key] = result.error.issues[0].message;
    return 0;
  };

  const delivery = form.kind === 'delivery';
  const type = delivery ? form.pricingType : 'free';
  const estimateType = form.estimateType;

  const method = {
    ...(form.id ? { id: form.id } : {}),
    name: form.name.trim(),
    description: form.description.trim(),
    kind: form.kind,
    active: form.active,
    primary: form.primary,
    pricing: {
      type,
      flatFee: money('flatFee', form.flatFee, 'Delivery charge', type === 'flat'),
      tiers: {
        district: money('district', form.district, 'Same district price', type === 'tiered'),
        state: money('state', form.state, 'Same state price', type === 'tiered'),
        national: money('national', form.national, 'Rest of India price', type === 'tiered'),
      },
      freeAbove: money('freeAbove', form.freeAbove, 'Order value', type !== 'free' && form.freeAboveOn),
    },
    pincodeRules: delivery
      ? form.pincodeRules.map((rule, index) => ({
          pincodePrefix: rule.pincodePrefix.trim(),
          fee: money(`rule.${index}`, rule.fee, 'Price', true),
        }))
      : [],
    estimate: {
      type: estimateType,
      minDays: estimateType === 'days' ? days('minDays', form.minDays, 'From') : estimateType === 'next_day' ? 1 : 0,
      maxDays: estimateType === 'days' ? days('maxDays', form.maxDays, 'To') : estimateType === 'next_day' ? 1 : 0,
      show: form.showEstimate,
    },
  };

  const checked = deliveryMethodSchema.safeParse(method);
  if (!checked.success) {
    for (const [path, message] of Object.entries(fieldErrors(checked.error.issues))) {
      const rule = path.match(/^pincodeRules\.(\d+)/);
      const key = rule ? `rule.${rule[1]}` : FIELD_FOR_PATH[path] ?? (path.split('.')[0] || '_');
      errors[key] ??= message;
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, method };
};

/* ───────────── Editing the settings ───────────── */

/**
 * The settings with one method added (index -1) or replaced. Making a method the main one makes
 * every other method not the main one: there is always exactly one.
 */
export const withMethod = (settings, index, method) => {
  const methods = index === -1 ? [...settings.methods, method] : settings.methods.map((m, i) => (i === index ? method : m));
  const at = index === -1 ? methods.length - 1 : index;
  return { ...settings, methods: method.primary ? methods.map((m, i) => ({ ...m, primary: i === at })) : methods };
};

/** The settings without one method. The main method cannot be removed, nor the last one. */
export const withoutMethod = (settings, index) => {
  const method = settings.methods[index];
  if (!method || method.primary || settings.methods.length <= 1) return settings;
  return { ...settings, methods: settings.methods.filter((_, i) => i !== index) };
};

/** Adds a delivery-area pincode (or its first digits). Returns { settings } or { error }. */
export const withArea = (settings, text) => {
  const prefix = String(text ?? '').trim();
  if (!/^[1-9]\d{0,5}$/.test(prefix)) return { error: 'Enter a pincode, or its first digits (like 5000)' };
  if (settings.serviceablePincodePrefixes.includes(prefix)) return { error: 'That pincode is already listed' };
  return { settings: { ...settings, serviceablePincodePrefixes: [...settings.serviceablePincodePrefixes, prefix] } };
};
