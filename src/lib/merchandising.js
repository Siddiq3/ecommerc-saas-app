/** Keep preview-only image URLs out of the strict settings payload. */
export const storefrontDraft = (settings) => ({
  theme: { ...settings.theme },
  announcement: { text: '', enabled: false, ...settings.announcement },
  banners: [...(settings.banners ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
  sections: [...(settings.sections ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
});

export const storefrontPatch = (draft) => ({
  theme: draft.theme,
  announcement: draft.announcement,
  banners: draft.banners.map(({ imageKey, link, alt }, sortOrder) => ({ imageKey, link: link ?? '', alt: alt ?? '', sortOrder })),
  sections: draft.sections.map(({ type, enabled, title }, sortOrder) => ({ type, enabled, title, sortOrder })),
});

export const moveItem = (items, index, offset) => {
  const next = [...items];
  const target = index + offset;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};
