import { storeUrl as buildStoreUrl, storeHostname as buildStoreHostname, storefrontDomain } from '@storekit/shared';

/**
 * The app's one window onto storefront addresses.
 *
 * Every store is `https://{slug}.storekit.site`, assembled by the shared helper the API also
 * uses, so what the app prints and shares is what the API returns. This file only supplies
 * the configuration: EXPO_PUBLIC_STOREFRONT_URL is the storefront *root* (production
 * `https://storekit.site`, local `http://lvh.me:3000`). No screen builds a store address
 * itself — a screen that does will disagree with the API the day the scheme changes.
 *
 * The variable is read as a literal `process.env.EXPO_PUBLIC_*` access because Expo inlines
 * those at bundle time; a computed lookup would come through as undefined.
 */
const config = { storefrontBaseUrl: process.env.EXPO_PUBLIC_STOREFRONT_URL ?? 'https://storekit.site' };

/** `https://asha-boutique.storekit.site` — for opening and sharing. */
export const storeUrl = (slug) => buildStoreUrl(config, slug);

/** `asha-boutique.storekit.site` — the same address, without a scheme, for display. */
export const storeHostname = (slug) => buildStoreHostname(config, slug);

/**
 * `storekit.site` — for showing the part of the address that is not the slug, next to a
 * slug that is still being typed and so may not be a valid label yet.
 */
export const STOREFRONT_DOMAIN = storefrontDomain(config);
