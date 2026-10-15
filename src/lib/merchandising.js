/** Keep preview-only image URLs out of the strict settings payload. */
export const storefrontDraft = (settings) => ({
  theme: { ...settings.theme },
  announcement: { text: '', enabled: false, ...settings.announcement },
  banners: [...(settings.banners ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
  sections: [...(settings.sections ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
});

export const storefrontPatch = (draft) => ({
  theme: draft.theme,
  announcement: draft.announcement,
  banners: draft.banners.map(({ imageKey, link, alt }, sortOrder) => ({ imageKey, link: link ?? '', alt: alt ?? '', sortOrder })),
  sections: draft.sections.map(({ type, enabled, title }, sortOrder) => ({ type, enabled, title, sortOrder })),
});

export const moveItem = (items, index, offset) => {
  const next = [...items];
  const target = index + offset;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

/* ───────────── Plain-language helpers for the Storefront screen ───────────── */

/** Where a banner can send a shopper, as a path the storefront accepts. */
export const categoryLink = (category) => `/category/${category.slug}`;
export const productLink = (product) => `/products/${product.slug ? `${product.slug}--` : ''}${product.productId}`;

const titleCase = (slug) => slug.replace(/--[0-9A-HJKMNP-TV-Z]{26}$/, '').split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

/** What a banner's link does, in words an owner reads at a glance. */
export const linkLabel = (link, categories = []) => {
  const value = String(link ?? '').trim();
  if (!value) return 'Nothing, just show the picture';
  if (value === '/products') return 'All products';
  if (value.startsWith('/category/')) {
    const slug = value.slice('/category/'.length);
    return categories.find((c) => c.slug === slug)?.name ?? titleCase(slug);
  }
  if (value.startsWith('/products/')) return titleCase(value.slice('/products/'.length)) || 'A product';
  if (value.startsWith('/search')) return 'Search results';
  try { return new URL(value).host; } catch { return value; }
};

/**
 * Ready-made announcements, built only from what is true for this shop: its delivery rule, cash on delivery, and
 * coupons it already shows on the website. An owner taps one instead of wondering what to write.
 */
export const announcementIdeas = (settings = {}, coupons = [], money = (paise) => `₹${Math.round(paise / 100)}`) => {
  const methods = (settings.delivery?.methods ?? []).filter((m) => m.active !== false);
  const main = methods.find((m) => m.primary) ?? methods[0];
  const ideas = [];
  if (main?.pricing?.type === 'free') ideas.push('Free delivery on every order');
  else if (main?.pricing?.freeAbove > 0) ideas.push(`Free delivery on orders above ${money(main.pricing.freeAbove)}`);
  if (settings.payments?.codEnabled) ideas.push('Cash on delivery available');
  const offer = coupons.find((c) => c.showOnStorefront && c.active !== false);
  if (offer) ideas.push(`Use code ${offer.code} for ${offer.type === 'percentage' ? `${offer.value}%` : money(offer.value)} off`);
  ideas.push('New collection just arrived', 'Festive sale is live. Shop now');
  return ideas.filter((idea) => idea.length <= 200);
};

/** Black or white, whichever reads better on a `#rrggbb` colour (the storefront's own rule, lib/theme.js). */
export const readableOn = (hex = '#000000') => {
  const c = (o) => { const v = parseInt(hex.slice(o, o + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * c(1) + 0.7152 * c(3) + 0.0722 * c(5) > 0.4 ? '#111827' : '#FFFFFF';
};
