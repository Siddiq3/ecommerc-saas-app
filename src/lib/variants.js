/**
 * The variant maths, kept free of any React Native import so it can be checked in plain node
 * (see scripts/verify-variants.mjs). The editor in components/VariantEditor.jsx is the UI
 * over these; the rules about identity and ordering live here because they are the part that
 * can silently corrupt a merchant's stock.
 */

/** The schema's ceiling: `variants` is `.max(100)`. */
export const MAX_VARIANTS = 100;
/** `variantOptions` is `.max(4)`, and four options is already 100+ combinations. */
export const MAX_OPTIONS = 4;

/**
 * A stable identity for a combination, matching the rule the API dedupes on: entries sorted,
 * so `{Size:'S',Colour:'Red'}` and `{Colour:'Red',Size:'S'}` are recognised as one variant.
 */
export const fingerprint = (attributes) =>
  JSON.stringify(Object.entries(attributes ?? {}).sort(([a], [b]) => a.localeCompare(b)));

/** "S, M , L, ," → ['S','M','L']. Blank and duplicate values are dropped, order kept. */
export const parseValues = (text) => {
  const out = [];
  for (const piece of String(text ?? '').split(',')) {
    const value = piece.trim();
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
};

/** The options that are complete enough to generate anything. */
export const usable = (options) =>
  options.filter((option) => option.name.trim() && parseValues(option.values).length > 0);

/**
 * Every combination of the given options, capped at the schema's limit.
 *
 * Existing rows are carried across by fingerprint, so this is safe to run on every keystroke.
 */
export const buildRows = (options, existing = [], fallbackPrice = '') => {
  const ready = usable(options);
  if (!ready.length) return [];

  let combinations = [{}];
  for (const option of ready) {
    const name = option.name.trim();
    combinations = combinations.flatMap((combination) =>
      parseValues(option.values).map((value) => ({ ...combination, [name]: value })));
    // Stop multiplying once past the ceiling; the caller reports the overflow.
    if (combinations.length > MAX_VARIANTS) break;
  }

  const previous = new Map(existing.map((row) => [fingerprint(row.attributes), row]));

  return combinations.slice(0, MAX_VARIANTS).map((attributes, index) => {
    const found = previous.get(fingerprint(attributes));
    return found
      ? { ...found, attributes, sortOrder: index }
      : { attributes, price: fallbackPrice, stock: '0', active: true, sortOrder: index };
  });
};

/**
 * Options saved on a product that arrived without them — a product created through the API,
 * or an older record. Rebuilt from what the variants themselves say, so editing such a
 * product shows the options it actually has rather than an empty section.
 */
export const optionsFromVariants = (variants = []) => {
  const collected = new Map();
  for (const variant of variants) {
    for (const [name, value] of Object.entries(variant.attributes ?? {})) {
      if (!collected.has(name)) collected.set(name, []);
      const values = collected.get(name);
      if (!values.includes(value)) values.push(value);
    }
  }
  return [...collected.entries()].slice(0, MAX_OPTIONS).map(([name, values]) => ({
    name,
    values: values.join(', '),
  }));
};

/** The human label for a row: "S · Red". */
export const comboLabel = (attributes) => Object.values(attributes ?? {}).join(' · ');
