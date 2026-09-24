const MB = 1024 * 1024;

/**
 * "No limit", for a quota. `null` rather than a huge number: a sentinel like 999999999 shows
 * up in the app as a real figure, survives into a percentage, and is the first thing a future
 * caller does arithmetic on. `null` cannot be mistaken for a count, so every consumer has to
 * ask `isUnlimited` — and none can quietly compare against it.
 */
export const UNLIMITED = null;
export const isUnlimited = (value) => value === null;

/**
 * Whether one more of something fits: `current + increment` against a quota that may be
 * unlimited. The one place the comparison is written, so no caller invents its own.
 */
export const fitsWithin = (current, increment, max) => isUnlimited(max) || current + increment <= max;

/**
 * The plan table. This is the single source of truth for what a plan costs and what it
 * includes: the API enforces it, and the website, the app's paywall and its subscription
 * screen all render from it. Nothing else states a price or a quota.
 *
 * Plan ids are stable identifiers, stored on businesses and in billing history, and never
 * change when a plan is renamed or repriced. `growth` is presented as "Business".
 *
 * Prices are integer paise per month. Yearly billing is derived from them (billing.js), so
 * there is no second price to keep in step.
 *
 * `free` is the trial tier, not a purchasable plan: every store starts on it for the trial.
 *
 * Quotas that are not in a plan's public description (categories, storage, images per
 * product, team members, analytics history) are operational limits and are unchanged.
 * Plan limits are enforced server-side; clients read this table only to render upgrade
 * prompts, never to decide whether an action is permitted.
 */
export const PLANS = Object.freeze({
  free: {
    planId: 'free', name: 'Free', priceMonthly: 0,
    maxProducts: 25, maxCategories: 10, maxStorageBytes: 250 * MB,
    maxImagesPerProduct: 4, maxStaffAccounts: 0, analyticsRetentionDays: 30,
    customDomain: false, maxCustomDomains: 0, removeBranding: false, monthlyOrderLimit: 100,
    prioritySupport: false, customDesign: false,
  },
  starter: {
    planId: 'starter', name: 'Starter', priceMonthly: 19900,
    maxProducts: UNLIMITED, maxCategories: 40, maxStorageBytes: 2048 * MB,
    maxImagesPerProduct: 6, maxStaffAccounts: 1, analyticsRetentionDays: 90,
    customDomain: false, maxCustomDomains: 0, removeBranding: false, monthlyOrderLimit: UNLIMITED,
    prioritySupport: false, customDesign: false,
  },
  growth: {
    planId: 'growth', name: 'Business', priceMonthly: 39000,
    maxProducts: UNLIMITED, maxCategories: 150, maxStorageBytes: 10240 * MB,
    maxImagesPerProduct: 10, maxStaffAccounts: 5, analyticsRetentionDays: 365,
    customDomain: true, maxCustomDomains: 1, removeBranding: true, monthlyOrderLimit: UNLIMITED,
    prioritySupport: false, customDesign: false,
  },
  pro: {
    planId: 'pro', name: 'Pro', priceMonthly: 99900,
    maxProducts: UNLIMITED, maxCategories: 500, maxStorageBytes: 51200 * MB,
    maxImagesPerProduct: 12, maxStaffAccounts: 20, analyticsRetentionDays: 730,
    customDomain: true, maxCustomDomains: 1, removeBranding: true, monthlyOrderLimit: UNLIMITED,
    prioritySupport: true, customDesign: true,
  },
});

export const DEFAULT_PLAN_ID = 'free';

/** An unknown or retired plan id resolves to the trial tier rather than to nothing. */
export const getPlan = (planId) => PLANS[planId] ?? PLANS[DEFAULT_PLAN_ID];

export const PLAN_ORDER = Object.freeze(['free', 'starter', 'growth', 'pro']);

/**
 * Whether a plan may serve a store on a domain of its own. `customDomain` is the capability
 * and `maxCustomDomains` the quota; both must allow it, so a plan cannot be left with a
 * quota it is not entitled to use.
 *
 * A store has at most ONE custom domain: Starter 0, Business 1, Pro 1. Nothing else in the system
 * assumes more than one, so raising a quota later is a decision to make everywhere on purpose,
 * not a table edit (a test fails if any plan is set above one).
 */
export const customDomainQuota = (planId) => {
  const plan = getPlan(planId);
  return plan.customDomain ? Math.max(0, plan.maxCustomDomains ?? 0) : 0;
};

/**
 * Being *entitled* to a feature is not the same as the feature *existing*. A plan can promise
 * something that is still being built, and every surface that mentions it must say which it is.
 *
 *   available    built and usable now
 *   coming_soon  part of the plan, not yet built. There is nothing behind it to enforce
 *
 * Flip a value here when a feature ships and every label follows. (Custom domains are
 * `available` here because the code exists; whether they are switched on in a given
 * environment is the runtime feature flag, which the API reports separately.)
 */
export const FEATURE_AVAILABILITY = Object.freeze({
  customDomain: 'available',
  prioritySupport: 'available',
  customDesign: 'coming_soon',
});

export const isFeatureAvailable = (feature) => FEATURE_AVAILABILITY[feature] === 'available';

/** Whether a plan grants a feature or a non-zero quota. Unlimited counts as granted. */
export const hasEntitlement = (planId, key) => {
  const plan = getPlan(planId);
  if (key === 'customDomain') return customDomainQuota(planId) > 0;
  const value = plan[key];
  if (typeof value === 'boolean') return value;
  if (isUnlimited(value)) return true;
  return typeof value === 'number' && value > 0;
};

/**
 * What a plan includes, in one stable shape for the API to return — so a client never has to
 * know which fields of the plan table are limits and which are prices.
 * `null` is unlimited.
 */
export const entitlementsFor = (planId) => {
  const plan = getPlan(planId);
  return {
    maxProducts: plan.maxProducts,
    monthlyOrderLimit: plan.monthlyOrderLimit,
    maxCustomDomains: customDomainQuota(planId),
    prioritySupport: Boolean(plan.prioritySupport),
    customDesign: Boolean(plan.customDesign),
    maxCategories: plan.maxCategories,
    maxStorageBytes: plan.maxStorageBytes,
    maxImagesPerProduct: plan.maxImagesPerProduct,
    maxStaffAccounts: plan.maxStaffAccounts,
    analyticsRetentionDays: plan.analyticsRetentionDays,
    removeBranding: Boolean(plan.removeBranding),
  };
};

/** The names of the plans that include custom domains, for copy that must not go stale. */
export const customDomainPlanNames = () =>
  PLAN_ORDER.filter((id) => customDomainQuota(id) > 0).map((id) => PLANS[id].name);
