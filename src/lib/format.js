import { formatMoney, relativeTime, formatDate } from '@storekit/shared';

/** Re-exported so screens import their formatting from one place. */
export { formatMoney, relativeTime, formatDate };

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
