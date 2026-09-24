import { api, qs } from './client.js';

/**
 * Every backend call the app makes, in one file.
 *
 * Screens never build URLs. When a route changes, it changes here and nowhere else, and
 * it stays obvious at a glance exactly how much of the API this app touches — which is
 * what lets us assert that none of it is a payment endpoint.
 */

/** A fresh key per user-initiated write, so a double tap cannot duplicate the effect. */
const idempotencyKey = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 8)}`;

const withKey = () => ({ headers: { 'X-Idempotency-Key': idempotencyKey() } });

/* ───────────── Auth ───────────── */

export const auth = {
  signup: (input) => api.post('/auth/signup', input, { auth: false }),
  login: (input) => api.post('/auth/login', input, { auth: false }),
  requestOtp: (email, purpose) => api.post('/auth/otp/request', { email, purpose }, { auth: false }),
  verifyOtp: (input) => api.post('/auth/otp/verify', input, { auth: false }),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }, { auth: false }),
  resetPassword: (input) => api.post('/auth/reset-password', input, { auth: false }),
  me: () => api.get('/auth/me'),
  updateProfile: (input) => api.patch('/auth/me', input),
  changePassword: (input) => api.post('/auth/me/change-password', input),
  sessions: () => api.get('/auth/sessions'),
  revokeSession: (sessionId) => api.del(`/auth/sessions/${sessionId}`),
  revokeAllSessions: () => api.post('/auth/sessions/revoke-all', {}),
  /**
   * Revokes the session the access token belongs to. It takes no body: the server
   * identifies the session from the token, and sending the refresh token here would put a
   * long-lived secret on the wire for no reason.
   */
  logout: () => api.post('/auth/logout', {}),
};

/* ───────────── Store ───────────── */

export const businesses = {
  list: () => api.get('/businesses'),
  create: (input) => api.post('/businesses', input),
  /** Replaces `contact` wholesale — send every contact field, not just the changed one. */
  update: (businessId, input) => api.patch(`/businesses/${businessId}`, input),
  /** Makes the storefront publicly reachable; refused with a list of what is still missing. */
  publish: (businessId) => api.post(`/businesses/${businessId}/publish`, {}),
  slugAvailable: (slug) => api.get(`/businesses/slug-available${qs({ slug })}`),
  /**
   * Deletes the store and everything in it, permanently. The slug is sent back so the
   * server can refuse a request aimed at a store other than the one on screen.
   */
  remove: (businessId, slug) => api.del(`/businesses/${businessId}`, { body: { slug, confirm: true } }),
};

/* ───────────── The account itself ───────────── */

/**
 * Closing the account is a request, not an action: it mints the same kind of one-time
 * code billing uses and the merchant fills the form on the website, where a person reads
 * it. Nothing here deletes anything.
 */
export const account = {
  deletionHandoff: () => api.post('/me/account/deletion-handoff', {}),
};

/** Storefront configuration — theme, sections, policies. Merged one level deep by the API. */
export const storeSettings = {
  get: (businessId) => api.get(`/businesses/${businessId}/settings`),
  update: (businessId, input) => api.patch(`/businesses/${businessId}/settings`, input),
};

const scope = (businessId) => `/businesses/${businessId}`;

/* ───────────── Catalogue ───────────── */

export const products = {
  list: (businessId, params) => api.get(`${scope(businessId)}/products${qs(params)}`),
  get: (businessId, productId) => api.get(`${scope(businessId)}/products/${productId}`),
  create: (businessId, input) => api.post(`${scope(businessId)}/products`, input),
  update: (businessId, productId, input) => api.patch(`${scope(businessId)}/products/${productId}`, input),
  remove: (businessId, productId) => api.del(`${scope(businessId)}/products/${productId}`),
  setStock: (businessId, productId, input) =>
    api.patch(`${scope(businessId)}/products/${productId}/stock`, input, withKey()),
};

export const categories = {
  list: (businessId) => api.get(`${scope(businessId)}/categories`),
  create: (businessId, input) => api.post(`${scope(businessId)}/categories`, input),
  update: (businessId, categoryId, input) => api.patch(`${scope(businessId)}/categories/${categoryId}`, input),
  remove: (businessId, categoryId) => api.del(`${scope(businessId)}/categories/${categoryId}`),
  reorder: (businessId, order) => api.patch(`${scope(businessId)}/categories/reorder`, { order }),
};

export const coupons = {
  list: (businessId) => api.get(`${scope(businessId)}/coupons`),
  create: (businessId, input) => api.post(`${scope(businessId)}/coupons`, input),
  update: (businessId, couponId, input) => api.patch(`${scope(businessId)}/coupons/${couponId}`, input),
  remove: (businessId, couponId) => api.del(`${scope(businessId)}/coupons/${couponId}`),
};

/* ───────────── Orders ───────────── */

export const orders = {
  list: (businessId, params) => api.get(`${scope(businessId)}/orders${qs(params)}`),
  counts: (businessId) => api.get(`${scope(businessId)}/orders/counts`),
  get: (businessId, orderId) => api.get(`${scope(businessId)}/orders/${orderId}`),
  setStatus: (businessId, orderId, input) =>
    api.patch(`${scope(businessId)}/orders/${orderId}/status`, input, withKey()),
  cancel: (businessId, orderId, input) => api.post(`${scope(businessId)}/orders/${orderId}/cancel`, input, withKey()),
};

/**
 * Customer payments — a shopper paying the merchant by UPI, which the merchant verifies
 * by eye. This is not app-store billing and involves no payment SDK: the app only reads
 * a reference number the shopper typed and records the merchant's yes or no.
 */
export const payments = {
  get: (businessId, orderId) => api.get(`${scope(businessId)}/orders/${orderId}/payment`),
  verify: (businessId, orderId, input) =>
    api.post(`${scope(businessId)}/orders/${orderId}/payment/verify`, input, withKey()),
  reject: (businessId, orderId, input) =>
    api.post(`${scope(businessId)}/orders/${orderId}/payment/reject`, input, withKey()),
};

/* ───────────── Customers ───────────── */

export const customers = {
  list: (businessId, params) => api.get(`${scope(businessId)}/customers${qs(params)}`),
  get: (businessId, customerId) => api.get(`${scope(businessId)}/customers/${customerId}`),
  block: (businessId, customerId) => api.post(`${scope(businessId)}/customers/${customerId}/block`, {}),
  unblock: (businessId, customerId) => api.post(`${scope(businessId)}/customers/${customerId}/unblock`, {}),
};

/* ───────────── Insight ───────────── */

export const analytics = {
  dashboard: (businessId) => api.get(`${scope(businessId)}/analytics/dashboard`),
  overview: (businessId, params) => api.get(`${scope(businessId)}/analytics${qs(params)}`),
};

export const notifications = {
  list: (businessId, params) => api.get(`${scope(businessId)}/notifications${qs(params)}`),
  unreadCount: (businessId) => api.get(`${scope(businessId)}/notifications/unread-count`),
  /**
   * The id is encoded because notification ids contain a '#', which starts a fragment in
   * a URL and would otherwise truncate the path — the server would receive only the
   * leading digits and answer 404.
   */
  markRead: (businessId, notificationId) =>
    api.post(`${scope(businessId)}/notifications/${encodeURIComponent(notificationId)}/read`, {}),
  markAllRead: (businessId) => api.post(`${scope(businessId)}/notifications/read-all`, {}),
};

/* ───────────── Uploads ───────────── */

export const uploads = {
  authorize: (businessId, input) => api.post(`${scope(businessId)}/uploads/authorize`, input),
  confirm: (businessId, input) => api.post(`${scope(businessId)}/uploads/confirm`, input),
};

/* ───────────── Subscription ───────────── */

/**
 * Read-only, and deliberately so.
 *
 * `status` tells the app what the merchant is entitled to, and `handoff` mints the
 * one-time token the app hands to the system browser. Everything after that — plan
 * selection, checkout, the payment itself — happens on the website. There is no method
 * here that takes money, and there must never be one: see docs/PLAY_BILLING_POLICY.md.
 */
export const subscription = {
  status: () => api.get('/me/status'),
  handoff: () => api.post('/me/billing/handoff', {}),
  /** The store's own plan usage (product counts, storage), not the billing state. */
  usage: (businessId) => api.get(`${scope(businessId)}/subscription`),
};
