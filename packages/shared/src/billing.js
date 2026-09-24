import { PLANS, FEATURE_AVAILABILITY, customDomainQuota, entitlementsFor, isUnlimited } from './plans.js';

/**
 * Billing catalogue and subscription lifecycle.
 *
 * Prices are not stated here. They live once, in the plan table (plans.js), and this file
 * derives from them — so the marketing site, the billing flow and the app's paywall cannot
 * drift from what the API charges. What this file adds is presentation: the tagline, the
 * short list of highlights and the call to action, which are copy rather than entitlements.
 *
 * Amounts are integer paise, matching the rest of the system: a hundred paise to the rupee.
 */

export const TRIAL_DAYS = 3;

/** Every state a merchant's billing can be in. The app's paywall switches on this. */
export const PLAN_STATUSES = Object.freeze([
  'trial_active',
  'trial_expired',
  'subscribed',
  'cancelled',
  'past_due',
]);

/** Statuses that grant access to the product. Everything else hits the paywall. */
export const ENTITLED_STATUSES = Object.freeze(['trial_active', 'subscribed', 'cancelled']);

export const isEntitled = (planStatus) => ENTITLED_STATUSES.includes(planStatus);

export const PLAN_STATUS_LABELS = Object.freeze({
  trial_active: 'Free trial',
  trial_expired: 'Trial ended',
  subscribed: 'Active',
  cancelled: 'Cancelling',
  past_due: 'Payment failed',
});

export const BILLING_CYCLES = Object.freeze(['monthly', 'yearly']);

/**
 * Yearly billing charges for ten months instead of twelve. Expressed as a multiplier so
 * the discount is derived rather than duplicated as a second hard-coded price.
 */
export const YEARLY_MONTHS_CHARGED = 10;

export const yearlyPrice = (monthlyPaise) => monthlyPaise * YEARLY_MONTHS_CHARGED;

export const yearlySavingPercent = () => Math.round((1 - YEARLY_MONTHS_CHARGED / 12) * 100);

/**
 * What a plan card lists, in order, each either included (a tick) or not (a cross). One list for every
 * plan, so a card shows what you get *and* what you would need a bigger plan for.
 *
 * Deliberately says "Custom domain", never how many: the number is an enforcement detail (the plan table
 * and the domains API hold it) and how many a plan allows is not something the pricing copy promises.
 *
 * Whether each is included comes from the plan's entitlements, not from the plan's name.
 */
const FEATURE_LIST = Object.freeze([
  { label: 'Unlimited products', has: (e) => isUnlimited(e.maxProducts) },
  { label: 'Unlimited orders', has: (e) => isUnlimited(e.monthlyOrderLimit) },
  { label: 'StoreKit storefront', has: () => true },
  { label: 'Standard templates', has: () => true },
  { label: 'Standard support', has: () => true },
  { label: 'Custom domain', has: (e) => e.maxCustomDomains > 0 },
  { label: 'Priority support', has: (e) => e.prioritySupport },
  { label: 'Custom storefront design', has: (e) => e.customDesign, feature: 'customDesign' },
]);

/** `[{ label, included, note }]` — `note` is "Coming soon" for an included feature that is not built yet. */
export const planFeatureList = (planId) => {
  const entitlements = entitlementsFor(planId);
  return FEATURE_LIST.map(({ label, has, feature }) => {
    const included = Boolean(has(entitlements));
    const notBuilt = included && feature && FEATURE_AVAILABILITY[feature] !== 'available';
    return { label, included, note: notBuilt ? 'Coming soon' : null };
  });
};

/** A feature that is part of the plan but not built yet says so, everywhere it is mentioned. */
const featureLabel = (label, feature) =>
  FEATURE_AVAILABILITY[feature] === 'available' ? label : `${label} (coming soon)`;

/**
 * Plans as the marketing site presents them. `planId` is the same stable id the entitlement
 * table uses, so the billing layer never invents a tier of its own; the price and name come
 * from that table, not from here.
 *
 * `featured` picks the plan a page draws the eye to. `badge` is a short factual label, not a
 * claim about popularity.
 */
export const BILLING_PLANS = Object.freeze([
  {
    planId: 'starter',
    name: PLANS.starter.name,
    monthlyPaise: PLANS.starter.priceMonthly,
    tagline: 'Everything you need to start selling online.',
    cta: 'Start Selling',
    featured: false,
    badge: null,
    featureList: planFeatureList('starter'),
    highlights: [
      'Unlimited products',
      'Unlimited orders',
      'StoreKit storefront',
      'Standard templates',
      'Standard support',
    ],
  },
  {
    planId: 'growth',
    name: PLANS.growth.name,
    monthlyPaise: PLANS.growth.priceMonthly,
    tagline: 'Connect your own domain and grow your store.',
    cta: 'Choose Business',
    featured: true,
    badge: 'Your own domain',
    featureList: planFeatureList('growth'),
    highlights: [
      'Everything in Starter',
      'Custom domain',
      'Unlimited products',
      'Unlimited orders',
      'Standard templates',
    ],
  },
  {
    planId: 'pro',
    name: PLANS.pro.name,
    monthlyPaise: PLANS.pro.priceMonthly,
    tagline: 'Build a more branded storefront with priority support.',
    cta: 'Go Pro',
    featured: false,
    badge: null,
    featureList: planFeatureList('pro'),
    highlights: [
      'Everything in Business',
      'Priority support',
      featureLabel('Custom storefront design', 'customDesign'),
      'Custom domain',
      'Unlimited products',
      'Unlimited orders',
    ],
  },
]);

export const getBillingPlan = (planId) => BILLING_PLANS.find((p) => p.planId === planId) ?? null;

export const priceFor = (planId, cycle) => {
  const plan = getBillingPlan(planId);
  if (!plan) return 0;
  return cycle === 'yearly' ? yearlyPrice(plan.monthlyPaise) : plan.monthlyPaise;
};

/** What the customer effectively pays per month on a yearly plan, for the "from" line. */
export const effectiveMonthlyPrice = (planId, cycle) => {
  const plan = getBillingPlan(planId);
  if (!plan) return 0;
  return cycle === 'yearly' ? Math.round(yearlyPrice(plan.monthlyPaise) / 12) : plan.monthlyPaise;
};

/**
 * Feature comparison for the pricing table. Kept beside the plans so a new plan cannot
 * be added without deciding what it includes.
 *
 * Not listed, on purpose: team members. Staff accounts exist in the API (`maxStaffAccounts`, still in each
 * plan's entitlements) but are switched off (`FEATURE_STAFF_ACCOUNTS`), and pricing must not promise what a
 * customer cannot use. Add the row back in the same change that turns the feature on.
 *
 * Formats: `number` (a count, `null` = Unlimited), `boolean` (any non-zero value reads as included —
 * so the custom-domain row is a tick, never a count), `bytes`, `days`, and `feature` (a boolean that
 * also reports whether the feature is built yet).
 */
export const COMPARISON_ROWS = Object.freeze([
  { label: 'Products', key: 'maxProducts', format: 'number' },
  { label: 'Orders', key: 'monthlyOrderLimit', format: 'number' },
  { label: 'Custom domain', key: 'maxCustomDomains', format: 'boolean' },
  { label: 'Priority support', key: 'prioritySupport', format: 'feature' },
  { label: 'Custom storefront design', key: 'customDesign', format: 'feature' },
  { label: 'Image storage', key: 'maxStorageBytes', format: 'bytes' },
  { label: 'Analytics history', key: 'analyticsRetentionDays', format: 'days' },
  { label: 'Branding removed', key: 'removeBranding', format: 'boolean' },
]);

/**
 * One entitlement as a person reads it, so the website and the app print the same words.
 * Returns `{ text, included, note }`: `included` is false for "not included", and `note` carries
 * "Coming soon" for an entitlement whose feature is not built yet.
 *
 * Takes the entitlements themselves (and which features are built) rather than a plan id, so a
 * client can describe exactly what the API told it — the app never has to trust its own bundled
 * copy of the table over the server's answer.
 */
export const describeEntitlement = (entitlements, row, availability = FEATURE_AVAILABILITY) => {
  const value = entitlements?.[row.key];

  switch (row.format) {
    case 'number':
      return isUnlimited(value)
        ? { text: 'Unlimited', included: true }
        : { text: new Intl.NumberFormat('en-IN').format(value), included: value > 0 };
    case 'boolean':
      return { text: value ? 'Included' : 'Not included', included: Boolean(value) };
    case 'feature': {
      const soon = value && availability?.[row.key] !== 'available';
      return { text: value ? 'Included' : 'Not included', included: Boolean(value), note: soon ? 'Coming soon' : null };
    }
    case 'bytes': {
      const gb = value / (1024 * 1024 * 1024);
      return { text: gb >= 1 ? `${Math.round(gb)} GB` : `${Math.round(value / (1024 * 1024))} MB`, included: true };
    }
    case 'days':
      return { text: value >= 365 ? `${Math.round(value / 365)} year${value >= 730 ? 's' : ''}` : `${value} days`, included: true };
    default:
      return { text: String(value), included: Boolean(value) };
  }
};

/** The same, for a plan in the bundled table. */
export const describePlanValue = (planId, row) => describeEntitlement(entitlementsFor(planId), row);
