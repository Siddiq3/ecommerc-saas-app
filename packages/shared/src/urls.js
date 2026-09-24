/**
 * Public URL builders. Object keys are tenant-scoped, so even a leaked key cannot be
 * used to enumerate another business's assets behind the CDN.
 */

const trimEnd = (s) => String(s || '').replace(/\/+$/, '');

/**
 * Storefront addresses. Every store lives on its own subdomain: `https://{slug}.storekit.site`.
 *
 * `cfg.storefrontBaseUrl` is the storefront *root* — `https://storekit.site` in production,
 * `http://lvh.me:3000` on a developer machine (`*.localhost` does not resolve reliably;
 * lvh.me and its subdomains resolve to 127.0.0.1). The scheme and port are carried over as
 * written, so moving between environments is a configuration change and no caller knows the
 * difference. A path on the root is ignored: a store is a host, never a path.
 *
 * This is the only place a store's address is assembled. Custom domains resolve through the
 * same Host-header routing on the serving side, and a custom domain's own URL is a separate
 * concern from this one.
 *
 * Slug *rules* (length, characters, reserved names such as `www`, `api`, `cdn`) live in the
 * validation package's `storeSlug`, which this package cannot import without a cycle. What
 * is enforced here is narrower and unconditional: the slug must be a single DNS label,
 * because the host is now built from data. A slug like `evil.com#` would otherwise turn a
 * store link into a link to somewhere else.
 */
const ROOT = /^(https?):\/\/([^/?#\s]+)/i;
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const parseRoot = (cfg) => {
  const match = ROOT.exec(String(cfg?.storefrontBaseUrl ?? ''));
  if (!match) throw new TypeError('storefrontBaseUrl must be an http(s) URL such as https://storekit.site');
  return { scheme: match[1].toLowerCase(), domain: match[2].toLowerCase() };
};

/** The storefront root's host, with any port: `storekit.site`, `lvh.me:3000`. */
export const storefrontDomain = (cfg) => parseRoot(cfg).domain;

/** `{slug}.storekit.site` — the address without a scheme, for display. */
export const storeHostname = (cfg, slug) => {
  const label = String(slug ?? '').toLowerCase();
  if (!DNS_LABEL.test(label)) throw new TypeError(`"${slug}" cannot be used as a store subdomain`);
  return `${label}.${storefrontDomain(cfg)}`;
};

export const storeUrl = (cfg, slug) => `${parseRoot(cfg).scheme}://${storeHostname(cfg, slug)}`;

export const productUrl = (cfg, slug, productId, productSlug) =>
  `${storeUrl(cfg, slug)}/products/${productSlug ? `${productSlug}--` : ''}${productId}`;

export const categoryUrl = (cfg, slug, categorySlug) => `${storeUrl(cfg, slug)}/c/${categorySlug}`;

export const trackingUrl = (cfg, slug, token) =>
  `${storeUrl(cfg, slug)}/order/track?t=${encodeURIComponent(token)}`;

export const imageUrl = (cfg, objectKey) => {
  if (!objectKey) return undefined;
  const safe = String(objectKey).replace(/^\/+/, '');
  // A key containing traversal segments is never a key we wrote; refuse to build a URL.
  if (safe.includes('..') || safe.includes('//')) return undefined;
  return `${trimEnd(cfg.cdnBaseUrl)}/${safe}`;
};

export const derivativeUrl = (cfg, objectKey, label = 'medium') => {
  if (!objectKey) return undefined;
  return imageUrl(cfg, `${String(objectKey).replace(/\.[a-z0-9]+$/i, '')}_${label}.webp`);
};

export const whatsappLink = (phone, text) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return undefined;
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${normalized}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};

export const shareLinks = (url, title) => ({
  whatsapp: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`,
  facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  x: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
  telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
});

/** Extracts the product id from a "pretty-slug--ULID" path segment. */
export const productIdFromSlugParam = (param) => {
  const raw = String(param || '');
  const tail = raw.includes('--') ? raw.split('--').pop() : raw;
  return /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(tail) ? tail : null;
};
