/** Values shared by the API, both web apps and the Expo app. Secrets never live here. */

export const API_VERSION = 'v1';
export const CURRENCY = 'INR';
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';
export const DEFAULT_LOCALE = 'en-IN';

/** Access tokens stay short so a leaked token has a small blast radius. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const OTP_TTL_SECONDS = 10 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const MAX_FAILED_LOGINS = 8;
export const ACCOUNT_LOCK_MINUTES = 15;

export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
export const ORDER_TRACKING_TOKEN_BYTES = 32;

export const MAX_CART_LINES = 50;
export const MAX_QUANTITY_PER_LINE = 99;
export const LOW_STOCK_DEFAULT_THRESHOLD = 5;

/** Derivatives generated for every uploaded image. */
export const IMAGE_SIZES = Object.freeze([
  { label: 'thumb', width: 200 },
  { label: 'small', width: 400 },
  { label: 'medium', width: 800 },
  { label: 'large', width: 1600 },
]);
export const WEBP_QUALITY = 82;
export const ALLOWED_IMAGE_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** [requests, windowSeconds] per bucket. Applied per IP, and per account where known. */
export const RATE_LIMITS = Object.freeze({
  'auth:login': [10, 300],
  'auth:signup': [5, 3600],
  'auth:otp-request': [5, 900],
  'auth:otp-verify': [10, 900],
  'auth:password-reset': [5, 3600],
  'auth:refresh': [60, 3600],
  'public:read': [300, 60],
  'public:search': [60, 60],
  'public:quote': [60, 300],
  'public:order-create': [10, 3600],
  'public:order-lookup': [20, 900],
  'public:upi-submit': [10, 3600],
  'public:track-event': [600, 300],
  'owner:read': [600, 60],
  'owner:write': [120, 60],
  'owner:upload': [60, 300],
  'owner:slug-change': [3, 86400],
  'owner:domain-add': [10, 3600],
  'owner:domain-verify': [30, 3600],
  // The edge asks once per host and caches the answer, but every such request reaches us from
  // a handful of edge addresses, so this is a per-address ceiling for the whole platform.
  'public:host-resolve': [1200, 60],
});

/** Scrubbed from logs, audit diffs and error payloads. */
export const REDACTED_FIELDS = Object.freeze([
  'password', 'newPassword', 'currentPassword', 'passwordHash', 'otp', 'code',
  'accessToken', 'refreshToken', 'token', 'trackingToken', 'authorization',
  'cookie', 'secret', 'apiKey', 'signature', 'utr',
]);

export const BUSINESS_CATEGORIES = Object.freeze([
  'fashion', 'grocery', 'electronics', 'beauty', 'home', 'food',
  'jewellery', 'sports', 'books', 'handmade', 'other',
]);
