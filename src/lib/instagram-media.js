/** Rule and report targets that are not a single post, so they never need a caption or thumbnail. */
const NOT_A_POST = new Set(['ALL', 'DM', 'UNKNOWN']);

/**
 * Whether the seller's posts must be fetched to name and picture everything on screen: a rule saved before media
 * snapshots existed, or a post in the report that no rule targets (replies reached through "All posts and Reels").
 */
export const needsMediaLookup = (rules = [], byMedia = []) =>
  [...rules, ...byMedia].some((item) => !NOT_A_POST.has(item.mediaId) && !item.media);
