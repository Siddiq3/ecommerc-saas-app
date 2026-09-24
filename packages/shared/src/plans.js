const MB = 1024 * 1024;

/**
 * Plan limits are enforced server-side. Clients read this table only to render upgrade
 * prompts, never to decide whether an action is permitted.
 */
export const PLANS = Object.freeze({
  free: {
    planId: 'free', name: 'Free', priceMonthly: 0,
    maxProducts: 25, maxCategories: 10, maxStorageBytes: 250 * MB,
    maxImagesPerProduct: 4, maxStaffAccounts: 0, analyticsRetentionDays: 30,
    customDomain: false, removeBranding: false, monthlyOrderLimit: 100,
  },
  starter: {
    planId: 'starter', name: 'Starter', priceMonthly: 29900,
    maxProducts: 200, maxCategories: 40, maxStorageBytes: 2048 * MB,
    maxImagesPerProduct: 6, maxStaffAccounts: 1, analyticsRetentionDays: 90,
    customDomain: false, removeBranding: false, monthlyOrderLimit: 1000,
  },
  growth: {
    planId: 'growth', name: 'Growth', priceMonthly: 79900,
    maxProducts: 2000, maxCategories: 150, maxStorageBytes: 10240 * MB,
    maxImagesPerProduct: 10, maxStaffAccounts: 5, analyticsRetentionDays: 365,
    customDomain: true, removeBranding: true, monthlyOrderLimit: 10000,
  },
  pro: {
    planId: 'pro', name: 'Pro', priceMonthly: 199900,
    maxProducts: 20000, maxCategories: 500, maxStorageBytes: 51200 * MB,
    maxImagesPerProduct: 12, maxStaffAccounts: 20, analyticsRetentionDays: 730,
    customDomain: true, removeBranding: true, monthlyOrderLimit: 100000,
  },
});

export const DEFAULT_PLAN_ID = 'free';
export const getPlan = (planId) => PLANS[planId] ?? PLANS[DEFAULT_PLAN_ID];
export const PLAN_ORDER = Object.freeze(['free', 'starter', 'growth', 'pro']);
