/**
 * Whether this copy of the app should be updated, from the versions the API reports (backend config/appVersion.js).
 * Plain functions, so scripts/verify-app-update.mjs can check them without a phone.
 */

export const PLAY_STORE_ID = 'in.storeflick.owner';
/** The Play Store app opens straight on the listing; the web page is the fallback. */
export const PLAY_STORE_URL = `market://details?id=${PLAY_STORE_ID}`;
export const PLAY_STORE_WEB_URL = `https://play.google.com/store/apps/details?id=${PLAY_STORE_ID}`;

/** After "Later", the card comes back this long afterwards: an owner who never updates still hears about it. */
export const REMIND_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

/** "1.10.0" vs "1.9.2" by number, not as text. Negative, zero or positive, like a sort comparator. */
export const compareVersions = (a, b) => {
  const pa = String(a ?? '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b ?? '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
};

/**
 * 'required' below the minimum, 'available' below the latest, otherwise null. Nothing is asked when either side is
 * unknown: a failed check must never lock an owner out of billing.
 */
export const updateNeed = (current, { latest, minimum } = {}) => {
  if (!current) return null;
  if (minimum && compareVersions(current, minimum) < 0) return 'required';
  if (latest && compareVersions(current, latest) < 0) return 'available';
  return null;
};

/** Whether the "update available" card should show, given what the owner did last time ({ version, at } or null). */
export const shouldOffer = (latest, dismissed, now = Date.now()) =>
  !dismissed || dismissed.version !== latest || now - dismissed.at >= REMIND_AFTER_MS;
