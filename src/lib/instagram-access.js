/**
 * Whether the Social (Instagram Auto DM) tab and its entry points are shown. Off until Instagram automation is live in
 * production: a tab that only says "coming soon" reads as unfinished to an app-store reviewer. The screen and the
 * Instagram sign-in return route stay in place, so switching this on is all it takes.
 */
export const SHOW_INSTAGRAM = false;

/** Only these management surfaces bypass the expired-plan lock. Writes remain server-authorized. */
export const canManageInstagramPath = (path) => path === '/social' || path === '/(tabs)/social' ||
  /^\/instagram\/[^/]+$/.test(path ?? '') && path !== '/instagram/new';
