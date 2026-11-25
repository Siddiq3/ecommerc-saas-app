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

/**
 * Ready-made options for common products. A tap fills the option's name and values; the merchant then taps away the
 * values they do not stock. Names and values stay English: customers see them on the website. A product with no
 * sizes (a saree) simply leaves options off. An empty `values` is for lists only the shop knows (its colours).
 */
export const OPTION_PRESETS = {
  shirt: { label: 'Shirt / T-shirt', name: 'Size', values: 'S, M, L, XL, XXL' },
  shirtChest: { label: 'Shirt (chest)', name: 'Size', values: '38, 40, 42, 44, 46' },
  pants: { label: 'Pants / Jeans', name: 'Waist', values: '28, 30, 32, 34, 36, 38, 40' },
  ladies: { label: 'Ladies wear', name: 'Size', values: 'XS, S, M, L, XL, XXL, 3XL' },
  kids: { label: 'Kids wear', name: 'Age', values: '0-1 Y, 1-2 Y, 2-3 Y, 3-4 Y, 4-5 Y, 5-6 Y, 6-8 Y, 8-10 Y, 10-12 Y' },
  footwear: { label: 'Footwear', name: 'Size (UK)', values: '5, 6, 7, 8, 9, 10, 11' },
  kidsFootwear: { label: 'Kids footwear', name: 'Size (UK)', values: '5C, 6C, 7C, 8C, 9C, 10C, 11C, 12C, 13C, 1, 2, 3' },
  sml: { label: 'Small / Medium / Large', name: 'Size', values: 'Small, Medium, Large' },
  colour: { label: 'Colour', name: 'Colour', values: '' },
  weight: { label: 'Weight', name: 'Weight', values: '250 g, 500 g, 1 kg, 2 kg, 5 kg' },
  volume: { label: 'Volume', name: 'Volume', values: '100 ml, 200 ml, 500 ml, 1 L, 2 L, 5 L' },
  pack: { label: 'Pack size', name: 'Pack', values: 'Pack of 1, Pack of 2, Pack of 6, Pack of 12' },
  flavour: { label: 'Flavour', name: 'Flavour', values: '' },
  cake: { label: 'Cake weight', name: 'Weight', values: '500 g, 1 kg, 1.5 kg, 2 kg' },
  portion: { label: 'Half / Full', name: 'Portion', values: 'Half, Full' },
  storage: { label: 'Storage', name: 'Storage', values: '64 GB, 128 GB, 256 GB, 512 GB' },
  ram: { label: 'RAM', name: 'RAM', values: '4 GB, 6 GB, 8 GB, 12 GB' },
  shade: { label: 'Shade', name: 'Shade', values: '' },
  bed: { label: 'Bed size', name: 'Size', values: 'Single, Double, Queen, King' },
  set: { label: 'Set size', name: 'Set', values: 'Set of 2, Set of 4, Set of 6' },
  material: { label: 'Material', name: 'Material', values: '' },
  ring: { label: 'Ring size', name: 'Ring size', values: '8, 10, 12, 14, 16, 18, 20, 22' },
  bangle: { label: 'Bangle size', name: 'Bangle size', values: '2.2, 2.4, 2.6, 2.8, 2.10' },
  chain: { label: 'Chain length', name: 'Length', values: '16 in, 18 in, 20 in, 22 in, 24 in' },
  metal: { label: 'Metal', name: 'Metal', values: 'Gold, Silver, Rose gold' },
  bat: { label: 'Cricket bat', name: 'Size', values: 'Size 4, Size 5, Size 6, Harrow, Full size' },
  ball: { label: 'Ball size', name: 'Size', values: 'Size 3, Size 4, Size 5' },
  format: { label: 'Book format', name: 'Format', values: 'Paperback, Hardcover' },
  language: { label: 'Language', name: 'Language', values: 'English, Hindi' },
};

/** Which lists come first for each kind of shop (BUSINESS_CATEGORIES); the rest are one tap away under More. */
export const PRESETS_FOR_SHOP = {
  fashion: ['shirt', 'shirtChest', 'pants', 'ladies', 'kids', 'footwear', 'kidsFootwear', 'sml', 'colour'],
  grocery: ['weight', 'volume', 'pack', 'flavour'],
  food: ['cake', 'portion', 'sml', 'flavour', 'pack', 'weight'],
  electronics: ['storage', 'ram', 'colour', 'sml', 'pack'],
  beauty: ['volume', 'weight', 'shade', 'pack', 'colour'],
  home: ['bed', 'set', 'sml', 'colour', 'material', 'volume'],
  jewellery: ['ring', 'bangle', 'chain', 'metal', 'colour'],
  sports: ['shirt', 'footwear', 'bat', 'ball', 'weight', 'colour'],
  books: ['format', 'language'],
  handmade: ['sml', 'colour', 'material', 'set'],
  other: ['sml', 'colour', 'weight', 'volume', 'pack', 'material'],
};

/** The shop's own lists, then every other list (for a general store that sells a bit of everything). */
export const presetsFor = (shopCategory) => {
  const first = PRESETS_FOR_SHOP[shopCategory] ?? PRESETS_FOR_SHOP.other;
  return { first, rest: Object.keys(OPTION_PRESETS).filter((id) => !first.includes(id)) };
};

/** "S, M, L" without "M" → "S, L". */
export const withoutValue = (text, value) => parseValues(text).filter((v) => v !== value).join(', ');

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
