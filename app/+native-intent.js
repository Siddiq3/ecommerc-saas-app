/**
 * Where a link that opens the app lands.
 *
 * The app has no deep links of its own, so any storekit:// link — including ones older
 * website pages still offer as "Return to the app" — opens the home screen instead of an
 * "unmatched route" page. The route guard then takes a signed-out merchant to sign-in.
 * Development-client URLs are passed through untouched so `expo start` keeps working.
 */
export function redirectSystemPath({ path }) {
  if (typeof path === 'string' && path.includes('expo-development-client')) return path;
  return '/';
}
