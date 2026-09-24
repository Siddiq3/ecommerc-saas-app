import { z } from 'zod';

/**
 * Field formats.
 *
 * The rule for this whole package: every input declares a type, a length and a format,
 * and anything that does not match is rejected — never cleaned up and let through. There
 * is no "any string" field anywhere in the API. Stripping a character we did not expect
 * would mean accepting input whose meaning we cannot know, and escaping it at render time
 * would mean trusting every renderer to remember.
 *
 * The only transforms applied are canonicalisations of input that already matches its
 * format: trimming surrounding whitespace, fixing letter case, and reducing an accepted
 * phone format (`+91 98765 43210`) to its ten digits. None of them removes a character
 * the format would otherwise reject.
 *
 * Name rules use Unicode letter classes rather than [A-Za-z], so a merchant called
 * आशा or அருண் is a valid person and not a validation error. Hermes compiles these
 * patterns; that is checked in the test suite rather than assumed.
 */

/* ───────────── Building blocks ───────────── */

/** Control characters, bidi overrides and zero-width joiners: never valid in any field. */
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/;

/**
 * A trimmed string of bounded length, matched against an allowlist pattern.
 *
 * Length is checked before the pattern, so a two-megabyte string is refused on its size
 * without the regex engine ever walking it.
 */
const formatted = ({ min, max, pattern, message, label = 'This field' }) =>
  z
    .string({ invalid_type_error: `${label} must be text` })
    .trim()
    .min(min, min <= 1 ? `${label} is required` : `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`)
    .refine((v) => !INVISIBLE.test(v), `${label} contains hidden characters`)
    .refine((v) => pattern.test(v), message);

/** An optional field that also accepts the empty string a cleared form input sends. */
export const emptyable = (schema) => schema.optional().or(z.literal(''));

/* ───────────── People and places ───────────── */

/** Letters (any script), spaces, and the punctuation real names contain: . ' - */
export const personName = formatted({
  min: 2,
  max: 80,
  label: 'Name',
  pattern: /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u,
  message: 'Use letters only — spaces, full stops, apostrophes and hyphens are fine',
});

/** Store and brand names: letters, digits, spaces and & . , ' ( ) - */
export const businessName = formatted({
  min: 2,
  max: 80,
  label: 'Name',
  pattern: /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} &.,'()-]*$/u,
  message: 'Use letters, numbers, spaces and & . , \' ( ) - only',
});

/** City, district and state names. */
export const placeName = formatted({
  min: 2,
  max: 60,
  label: 'Place name',
  pattern: /^[\p{L}\p{M}][\p{L}\p{M} .-]*$/u,
  message: 'Use letters, spaces, full stops and hyphens only',
});

/** A line of a postal address: house numbers need digits, slashes and hashes. */
export const addressLine = (min, max, label = 'Address') =>
  formatted({
    min,
    max,
    label,
    pattern: /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} ,./#()'-]*$/u,
    message: 'Use letters, numbers, spaces and , . / # ( ) \' - only',
  });

/* ───────────── Catalogue ───────────── */

/** Product names carry sizes and specs — "Men's T-Shirt (XL) 100% Cotton 2/pack". */
export const productName = formatted({
  min: 2,
  max: 140,
  label: 'Product name',
  pattern: /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} &.,'()/%+:"-]*$/u,
  message: 'Use letters, numbers, spaces and & . , \' ( ) / % + : " - only',
});

export const categoryName = formatted({
  min: 1,
  max: 60,
  label: 'Category name',
  pattern: /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} &.,'()-]*$/u,
  message: 'Use letters, numbers, spaces and & . , \' ( ) - only',
});

export const tag = formatted({
  min: 1,
  max: 30,
  label: 'Tag',
  pattern: /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} -]*$/u,
  message: 'Tags use letters, numbers, spaces and hyphens only',
});

/** Stock-keeping unit: upper-case letters, digits and - _ / */
export const sku = z
  .string({ invalid_type_error: 'SKU must be text' })
  .trim()
  .toUpperCase()
  .min(1, 'SKU is required')
  .max(64, 'SKU must be at most 64 characters')
  .regex(/^[A-Z0-9][A-Z0-9_/-]*$/, 'SKUs use letters, numbers and - _ / only');

/** A variant option name ("Size") or value ("XL", "Navy Blue"). */
export const optionLabel = (max) =>
  formatted({
    min: 1,
    max,
    label: 'Option',
    pattern: /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} ./&+'-]*$/u,
    message: 'Options use letters, numbers, spaces and . / & + \' - only',
  });

/* ───────────── Free text ───────────── */

/**
 * Prose: descriptions, notes, page bodies.
 *
 * Prose cannot be pinned to a character set the way a name can, so its format is defined
 * by what it may not contain: invisible characters, and "<", which is the one character
 * every HTML tag needs. Refusing it outright means no stored text can ever carry markup,
 * rather than relying on every renderer to escape it. ">" stays allowed — on its own it
 * cannot open a tag, and Markdown uses it for quotations.
 */
export const prose = (max, { multiline = true, label = 'Text' } = {}) =>
  z
    .string({ invalid_type_error: `${label} must be text` })
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .refine((v) => !INVISIBLE.test(v), `${label} contains hidden characters`)
    .refine((v) => !v.includes('<'), `${label} cannot contain "<"`)
    .refine((v) => multiline || !/[\r\n]/.test(v), `${label} must be a single line`);

export const optionalProse = (max, options) => prose(max, options).optional();

/** A short single-line label: announcement text, image alt text, section titles. */
export const shortText = (min, max, label = 'Text') =>
  prose(max, { multiline: false, label }).refine((v) => v.length >= min, `${label} is required`);

/* ───────────── Contact ───────────── */

export const email = z
  .string({ invalid_type_error: 'Email must be text' })
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long')
  // Zod's email check first, then a stricter allowlist: no quoted local parts, no IP
  // literals, no comments. Legal per the RFC, and never what a shop owner meant to type.
  .email('Enter a valid email address')
  .regex(/^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}$/, 'Enter a valid email address');

/**
 * Indian mobile number.
 *
 * Accepted shapes: `9876543210`, `+919876543210`, `+91 98765 43210`, `098765 43210`.
 * The shape is checked first against an allowlist that permits only digits, one leading
 * "+", and single spaces or hyphens as separators — letters or any other character reject
 * the whole value. Only then are the separators and the country prefix removed, and the
 * remaining ten digits must start with 6–9.
 */
export const mobile = z
  .string({ invalid_type_error: 'Mobile number must be text' })
  .trim()
  .max(17, 'Enter a valid 10-digit mobile number')
  .regex(/^\+?[0-9]+(?:[ -][0-9]+)*$/, 'Mobile numbers contain digits only')
  .transform((v) => v.replace(/[ -]/g, '').replace(/^(?:\+91|91|0)(?=\d{10}$)/, ''))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'));

export const pincode = z
  .string({ invalid_type_error: 'Pincode must be text' })
  .trim()
  .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit pincode');

/* ───────────── Money and numbers ───────────── */

/** Integer paise. Floats are rejected at the boundary, never rounded. */
export const money = z
  .number({ invalid_type_error: 'Amount must be a number' })
  .int('Amount must be a whole number of paise')
  .min(0, 'Amount cannot be negative')
  .max(100_000_000, 'Amount is too large');

/**
 * A price as a person types it into a form: rupees, optionally with paise.
 *
 * `1299`, `1299.5` and `1299.50` are accepted; `1,299`, `₹1299`, `12.3.4` and `1299.999`
 * are rejected — the form tells the merchant which characters it wants rather than
 * deleting the comma and guessing. Converted to integer paise by string arithmetic, never
 * `Math.round(x * 100)`, which turns 1.005 into 100 and 4.35 into 434.
 */
export const rupeesText = (label = 'Price') =>
  z
    .string({ invalid_type_error: `${label} must be text` })
    .trim()
    .regex(/^\d{1,7}(?:\.\d{1,2})?$/, `Enter ${label.toLowerCase()} in rupees, like 1299 or 1299.50`)
    .transform((v) => {
      const [rupees, paise = ''] = v.split('.');
      return Number(rupees) * 100 + Number(paise.padEnd(2, '0'));
    })
    .pipe(money);

/** A whole number typed into a form: stock counts, thresholds. */
export const wholeNumberText = ({ min = 0, max = 1_000_000, label = 'Number', signed = false } = {}) =>
  z
    .string({ invalid_type_error: `${label} must be text` })
    .trim()
    .regex(signed ? /^-?\d{1,7}$/ : /^\d{1,7}$/, signed ? `${label} must be a whole number, like 12 or -3` : `${label} must be a whole number`)
    .transform(Number)
    .pipe(z.number().int().min(min, `${label} must be at least ${min}`).max(max, `${label} must be at most ${max}`));

/**
 * A number arriving as a query-string value.
 *
 * `z.coerce.number()` would accept " 12 ", "1e2", "0x10" and "12abc"→NaN-then-default —
 * all shapes no client should send. The string must be plain decimal digits first.
 */
export const queryInt = ({ min, max, fallback }) => {
  const parsed = z
    .string()
    .regex(/^\d{1,9}$/, 'Must be a whole number')
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));
  return fallback === undefined ? parsed.optional() : parsed.optional().transform((v) => v ?? fallback);
};

/* ───────────── Identifiers ───────────── */

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Every entity id in the system is a ULID. Upper-case only, as generated. */
export const objectId = z
  .string({ invalid_type_error: 'Invalid identifier' })
  .regex(ULID, 'Invalid identifier');

/** Order numbers are generated as ORD- plus a zero-padded sequence. */
export const orderNumber = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^ORD-\d{6,10}$/, 'Enter the order number exactly as it appears, for example ORD-000123');

/** `<orderId>.<32 random bytes, base64url>` — the only shape a tracking link carries. */
export const trackingToken = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}\.[A-Za-z0-9_-]{43}$/, 'This tracking link is not valid');

/** Signed pagination cursor: base64url payload, a dot, and a 27-character signature. */
export const cursor = z
  .string()
  .max(1024, 'Invalid page cursor')
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{27}$/, 'Invalid page cursor')
  .optional();

/** `<sessionId>.<tokenId>.<32 random bytes, base64url>`, exactly as issued. */
export const refreshToken = z
  .string()
  .regex(
    /^[0-9A-HJKMNP-TV-Z]{26}\.[0-9A-HJKMNP-TV-Z]{26}\.[A-Za-z0-9_-]{43}$/,
    'Your session has expired. Please sign in again.',
  );

/** A JWT in compact form: three base64url segments. */
export const compactJwt = z
  .string()
  .max(4096, 'Invalid token')
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'Invalid token');

/** Opaque client identifiers: an idempotency key, a device id, an analytics session. */
export const opaqueId = (min, max, label = 'Identifier') =>
  z
    .string()
    .min(min, `${label} is too short`)
    .max(max, `${label} is too long`)
    .regex(/^[A-Za-z0-9_-]+$/, `${label} may contain letters, digits, - and _ only`);

/**
 * A storage key we generated: `businesses/<id>/<scope>/<id>.<ext>`.
 *
 * Clients echo keys back (a product's image list, a logo). Matching the exact generated
 * shape — rather than "any string under 512 characters" — means a client cannot point a
 * record at another tenant's object, at a path with "..", or at something that is not an
 * image. The tenant prefix is still checked again server-side against the caller.
 */
export const objectKey = z
  .string()
  .max(256, 'Invalid file reference')
  .regex(
    /^businesses\/[0-9A-HJKMNP-TV-Z]{26}\/(?:products\/[0-9A-HJKMNP-TV-Z]{26}|[a-z_]{2,20}s)\/[0-9A-HJKMNP-TV-Z]{26}\.(?:jpg|png|webp)$/,
    'Invalid file reference',
  );

/* ───────────── Payments ───────────── */

/** UPI VPA grammar: handle@psp. Strict, so nothing can be injected into a deep link. */
export const upiId = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9.\-_]{2,64}@[a-z][a-z0-9.\-_]{1,63}$/, 'Enter a valid UPI ID, for example name@bank');

/** UPI transaction reference (UTR): 12 digits, or the alphanumeric form some banks use. */
export const utr = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{6,32}$/, 'Enter the reference exactly as shown in your UPI app');

/** Courier AWB / consignment numbers. */
export const trackingReference = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{3,39}$/, 'Tracking numbers use letters, digits and hyphens only');

/* ───────────── Web ───────────── */

export const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use a hex colour like #2563EB');

/**
 * An external link.
 *
 * `z.string().url()` accepts `javascript:alert(1)` and `data:text/html,…` — both valid
 * URLs, both script execution when rendered as a link on the storefront. Only https is
 * allowed, with no embedded credentials.
 */
export const httpsUrl = z
  .string()
  .trim()
  .max(300, 'Link is too long')
  .refine((v) => !INVISIBLE.test(v), 'Link contains hidden characters')
  .refine((v) => {
    try {
      const url = new URL(v);
      return url.protocol === 'https:' && !url.username && !url.password && url.hostname.includes('.');
    } catch {
      return false;
    }
  }, 'Use a full https:// link');

/** A link that must point at one specific site — a store's Instagram, for example. */
export const siteUrl = (hosts, label) =>
  httpsUrl.refine((v) => {
    const { hostname } = new URL(v);
    return hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  }, `Use a link to ${label}`);

/** A site-relative path, as sent by analytics beacons. */
export const relativePath = z
  .string()
  .max(300)
  .regex(/^\/[A-Za-z0-9/_.~%-]*$/, 'Invalid path');

/* ───────────── Dates ───────────── */

export const isoDateTime = z.string().datetime({ offset: true, message: 'Use an ISO date and time' });

/** YYYY-MM-DD that is also a real calendar date — the regex alone lets 2026-13-45 through. */
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((v) => {
    const date = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === v;
  }, 'That date does not exist');

/* ───────────── Store identity ───────────── */

/** Reserved so a store slug can never shadow a platform route. */
export const RESERVED_SLUGS = new Set([
  'api', 'app', 'admin', 'dashboard', 'owner', 'auth', 'login', 'signup', 'register',
  'logout', 'account', 'settings', 'billing', 'checkout', 'cart', 'order', 'orders',
  'track', 'support', 'help', 'docs', 'blog', 'about', 'contact', 'privacy', 'terms',
  'refund', 'shipping', 'static', 'assets', 'cdn', 'img', 'images', 'public', 'health',
  'status', 'www', 'mail', 'ftp', 'test', 'staging', 'dev', 'v1', 'v2', 'graphql',
  'webhook', 'webhooks', 'oauth', 'sitemap', 'robots', 'favicon', 'manifest', 'sw',
  'new', 'edit', 'delete', 'me', 'user', 'users', 'store', 'stores', 'shop', 'null',
  'undefined', 'root', 'system', 'internal', 'security', 'pricing', 'plans', 'c', 'p',
  // The name customers point their custom-domain CNAME at (docs/CUSTOM_DOMAINS.md). A hostname
  // the platform really uses, so a store must never be able to register it.
  'domains',
]);

export const storeSlug = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Store link must be at least 3 characters')
  .max(40, 'Store link must be at most 40 characters')
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Use lowercase letters, numbers and hyphens only')
  .refine((v) => !v.includes('--'), 'Cannot contain two hyphens in a row')
  .refine((v) => !RESERVED_SLUGS.has(v), 'This store link is reserved')
  .refine((v) => !/^\d+$/.test(v), 'Store link cannot be only numbers');

/** A content page slug under a store: /about, /shipping-policy. */
export const pageSlug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, 'Use lowercase letters, numbers and hyphens only');

/** A product URL segment: `cotton-kurti--<ULID>`, or the bare ULID. */
export const productParam = z
  .string()
  .max(200)
  .regex(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*--)?[0-9A-HJKMNP-TV-Z]{26}$/i, 'Product not found');

export const couponCode = z
  .string()
  .trim()
  .toUpperCase()
  .min(3, 'Coupon codes are at least 3 characters')
  .max(24, 'Coupon codes are at most 24 characters')
  .regex(/^[A-Z0-9]+$/, 'Coupon codes use letters and numbers only');

/* ───────────── Secrets ───────────── */

/**
 * Length beats composition rules, so 8+ characters are required and the obvious
 * offenders are blocked instead of forcing symbol soup. Any printable character is
 * allowed — a password is a secret, not a name — but invisible characters are not: a
 * zero-width space typed once cannot be typed again, and the account is lost.
 */
const WEAK_PASSWORDS = new Set([
  'password123', '123456789012', 'qwertyuiop12', 'iloveyou1234', 'administrator',
  'letmein12345', 'welcome12345', 'passw0rd1234', 'abcd12345678',
  // Eight-character staples, now that eight is allowed.
  'password1', 'qwerty123', 'abc12345', 'letmein1', 'welcome1', 'admin123', 'iloveyou1', 'passw0rd',
]);

export const password = z
  .string({ invalid_type_error: 'Password must be text' })
  .min(8, 'Use at least 8 characters')
  .max(128, 'Password is too long')
  .refine((v) => !INVISIBLE.test(v), 'Password contains hidden characters')
  .refine((v) => !WEAK_PASSWORDS.has(v.toLowerCase()), 'This password is too common')
  .refine((v) => !/^(.)\1+$/.test(v), 'Password cannot be one repeated character')
  .refine((v) => /\p{L}/u.test(v) && /\d/.test(v), 'Include at least one letter and one number');

export const otpCode = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code');

/* ───────────── Uploads ───────────── */

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const imageContentType = z.enum(ALLOWED_IMAGE_TYPES);
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** An original file name, used only as an extension hint. */
export const imageFileName = z
  .string()
  .trim()
  .max(200)
  .regex(/^[\p{L}\p{N} ._()-]{1,190}\.(?:jpe?g|png|webp)$/iu, 'Upload a .jpg, .png or .webp image');

/* ───────────── Query helpers ───────────── */

/** Search box input: letters, digits and a little punctuation. Never an operator. */
export const searchQuery = z
  .string()
  .trim()
  .max(120, 'Search is too long')
  .refine((v) => !INVISIBLE.test(v), 'Search contains hidden characters')
  .refine((v) => /^[\p{L}\p{M}\p{N} @.&'+#/-]*$/u.test(v), 'Search using letters and numbers only')
  .optional();

export const pageLimit = (max = 100, fallback = 20) => queryInt({ min: 1, max, fallback });

/** Routes that take no body still validate one: an empty object, and nothing else. */
export const emptyBody = z.object({}).strict();

/** Routes that take no query string reject one rather than ignoring it. */
export const emptyQuery = z.object({}).strict();

/* ───────────── Legacy names ───────────── */

/**
 * Kept so nothing breaks while callers migrate; both now apply the prose rules rather
 * than accepting any printable text.
 *
 * @deprecated Use a field-specific format, or `prose` / `shortText`.
 */
export const safeText = (min, max) => shortText(min, max);
/** @deprecated Use `optionalProse`. */
export const optionalText = (max) => optionalProse(max, { multiline: false });
