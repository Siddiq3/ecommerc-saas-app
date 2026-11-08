import { formatMoney, formatDate as baseFormatDate } from '@storekit/shared';
import { intlLocale, tr } from './i18n.js';

export { formatMoney };

/** Dates in the app language. The locale argument is ignored: the app language decides. */
export const formatDate = (iso, _locale, opts) => baseFormatDate(iso, intlLocale(), opts);

/** Compact money for dense rows: ₹1.2L rather than ₹1,20,000. */
export const compactMoney = (paise) => {
  const rupees = Number(paise ?? 0) / 100;
  if (rupees >= 10_000_000) return `₹${(rupees / 10_000_000).toFixed(1).replace(/\.0$/, '')}Cr`;
  if (rupees >= 100_000) return `₹${(rupees / 100_000).toFixed(1).replace(/\.0$/, '')}L`;
  if (rupees >= 1_000) return `₹${(rupees / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return formatMoney(paise);
};

/** Signed percentage change, guarding the divide-by-zero that a first trading day hits. */
export const percentChange = (current, previous) => {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
};

export const initials = (name) =>
  String(name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

export const pluralize = (count, singular, plural) => `${count} ${count === 1 ? singular : plural ?? `${singular}s`}`;

/**
 * A short age for dense list rows: "just now", "22 min ago", "3 hr ago", "yesterday",
 * "4 days ago", then the date. The full "22 minutes ago" cut off beside an order number on a
 * 360pt phone. A time in the future (a skewed clock) reads as "just now".
 */
export const shortAgo = (iso, now = Date.now()) => {
  if (!iso) return '';
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return tr('just now');
  if (minutes < 60) return tr('{n} min ago', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return tr('{n} hr ago', { n: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return tr('yesterday');
  if (days < 7) return tr('{n} days ago', { n: days });
  return formatDate(iso, undefined, { day: 'numeric', month: 'short' });
};

/**
 * Past times in sentences ("Placed 3 hr ago"). Hermes has no Intl.RelativeTimeFormat, so this
 * is the same translated scale as shortAgo rather than the shared English-only helper.
 */
export const relativeTime = shortAgo;
