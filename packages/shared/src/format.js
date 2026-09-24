import { CURRENCY, DEFAULT_LOCALE } from './constants.js';

/**
 * Money is integer paise everywhere. Floats never touch a total, so 0.1 + 0.2 can never
 * turn into a rupee discrepancy on an invoice.
 */
export const formatMoney = (minorUnits, locale = DEFAULT_LOCALE) =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: CURRENCY,
    maximumFractionDigits: Number(minorUnits) % 100 === 0 ? 0 : 2,
  }).format(Number(minorUnits || 0) / 100);

export const toMinor = (rupees) => Math.round(Number(rupees || 0) * 100);
export const toMajor = (minorUnits) => Number(minorUnits || 0) / 100;

export const discountPercent = (price, mrp) => {
  if (!mrp || mrp <= price) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
};

/**
 * Builds a UPI intent link. Every field is encoded and stripped, because an unescaped
 * amount or note would let a crafted product name rewrite the payee.
 */
export const buildUpiDeepLink = ({ upiId, payeeName, amountMinor, transactionNote, transactionRef }) => {
  const q = new URLSearchParams();
  q.set('pa', upiId);
  if (payeeName) q.set('pn', String(payeeName).replace(/[^\w\s.-]/g, '').slice(0, 50));
  q.set('am', (Number(amountMinor || 0) / 100).toFixed(2));
  q.set('cu', CURRENCY);
  if (transactionRef) q.set('tr', String(transactionRef).replace(/[^A-Za-z0-9]/g, '').slice(0, 35));
  if (transactionNote) q.set('tn', String(transactionNote).replace(/[^\w\s-]/g, '').slice(0, 50));
  return `upi://pay?${q.toString()}`;
};

export const slugify = (input) =>
  String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 60);

export const maskMobile = (m) => (typeof m === 'string' && m.length === 10 ? `${m.slice(0, 2)}xxxxx${m.slice(7)}` : 'xxxxxxxxxx');

export const maskEmail = (e) => {
  const [user = '', domain = ''] = String(e || '').split('@');
  return `${user.slice(0, 2)}${'*'.repeat(Math.max(user.length - 2, 1))}@${domain}`;
};

export const formatDate = (iso, locale = DEFAULT_LOCALE, opts = { dateStyle: 'medium', timeStyle: 'short' }) => {
  if (!iso) return '';
  return new Intl.DateTimeFormat(locale, opts).format(new Date(iso));
};

export const relativeTime = (iso, now = Date.now()) => {
  if (!iso) return '';
  let value = Math.round((new Date(iso).getTime() - now) / 1000);
  const units = [['second', 60], ['minute', 60], ['hour', 24], ['day', 7], ['week', 4.35], ['month', 12], ['year', Infinity]];
  for (const [unit, size] of units) {
    if (Math.abs(value) < size) {
      return new Intl.RelativeTimeFormat(DEFAULT_LOCALE, { numeric: 'auto' }).format(Math.round(value), unit);
    }
    value /= size;
  }
  return iso;
};

export const pluralize = (count, singular, plural) => `${count} ${count === 1 ? singular : plural ?? `${singular}s`}`;
