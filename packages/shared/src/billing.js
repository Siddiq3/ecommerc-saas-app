/**
 * Billing catalogue and subscription lifecycle.
 *
 * This file is the single source of pricing truth for the marketing site, the billing
 * flow and the app's paywall copy. Changing a price here changes it everywhere.
 *
 * PRICES ARE PLACEHOLDERS pending the real numbers. Amounts are integer paise, matching
 * the rest of the system: 29900 is 299 rupees.
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
 * Plans as the marketing site presents them. `planId` maps onto the entitlement tiers
 * the API already enforces, so the billing layer never invents a tier of its own.
 */
export const BILLING_PLANS = Object.freeze([
  {
    planId: 'starter',
    name: 'Starter',
    tagline: 'For a first online store',
    monthlyPaise: 29900,
    popular: false,
    highlights: [
      '200 products',
      '1,000 orders a month',
      'Cash on delivery and UPI',
      'Coupons and delivery rules',
      '90 days of analytics',
    ],
  },
  {
    planId: 'growth',
    name: 'Growth',
    tagline: 'For a store that is selling',
    monthlyPaise: 79900,
    popular: true,
    highlights: [
      '2,000 products',
      '10,000 orders a month',
      'Your own domain',
      'Up to 5 team members',
      'A full year of analytics',
      'Store branding removed',
    ],
  },
  {
    planId: 'pro',
    name: 'Pro',
    tagline: 'For multiple catalogues at scale',
    monthlyPaise: 199900,
    popular: false,
    highlights: [
      '20,000 products',
      '100,000 orders a month',
      'Up to 20 team members',
      'Two years of analytics',
      'Priority support',
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
 */
export const COMPARISON_ROWS = Object.freeze([
  { label: 'Products', key: 'maxProducts', format: 'number' },
  { label: 'Orders per month', key: 'monthlyOrderLimit', format: 'number' },
  { label: 'Image storage', key: 'maxStorageBytes', format: 'bytes' },
  { label: 'Images per product', key: 'maxImagesPerProduct', format: 'number' },
  { label: 'Team members', key: 'maxStaffAccounts', format: 'number' },
  { label: 'Analytics history', key: 'analyticsRetentionDays', format: 'days' },
  { label: 'Custom domain', key: 'customDomain', format: 'boolean' },
  { label: 'Branding removed', key: 'removeBranding', format: 'boolean' },
]);
