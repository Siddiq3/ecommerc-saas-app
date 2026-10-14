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
  // storekit:// in a real build; Expo Go hands over exp://host:port/--/instagram-complete while developing.
  if (typeof path === 'string' && (/^\/?instagram-complete(?:[?/#]|$)/.test(path) || /^storekit:\/\/instagram-complete(?:[?/#]|$)/.test(path) ||
      /^exps?:\/\/[^/?#]+\/--\/instagram-complete(?:[?/#]|$)/.test(path))) {
    // Instagram login returns a one-time confirmation code. Only that, and only in its exact format, is carried over.
    const code = path.match(/[?&]confirmation=([\w-]{43})(?:[&#]|$)/)?.[1];
    return code ? `/(tabs)/social?igConfirm=${code}` : '/(tabs)/social';
  }
  return '/';
}
