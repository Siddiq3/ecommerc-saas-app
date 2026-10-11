/** Only these management surfaces bypass the expired-plan lock. Writes remain server-authorized. */
export const canManageInstagramPath = (path) => path === '/social' || path === '/(tabs)/social' ||
  /^\/instagram\/[^/]+$/.test(path ?? '') && path !== '/instagram/new';
