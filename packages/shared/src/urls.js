/**
 * Public URL builders. Object keys are tenant-scoped, so even a leaked key cannot be
 * used to enumerate another business's assets behind the CDN.
 */

const trimEnd = (s) => String(s || '').replace(/\/+$/, '');

export const storeUrl = (cfg, slug) => `${trimEnd(cfg.storefrontBaseUrl)}/${slug}`;

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
