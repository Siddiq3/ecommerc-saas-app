/**
 * Item codes: the `sku` of a product or variant, typed or scanned at the counter to put it on a bill.
 *
 * A generated code reads like the item it names: three letters of the name, the size/colour, and a number —
 * "Cotton Kurti" in M becomes COT-M-001. Upper-case A–Z, 0–9 and "-", at most 20 characters, so it fits a
 * label, a Code128 barcode and a quick thumb on the keypad. Codes a shop types itself (or scans off a branded
 * item's barcode) may be longer and use the wider `sku` rules; generated ones never need to.
 */

export const ITEM_CODE_MAX = 20;

const plain = (text) => String(text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** "Cotton Kurti", { Size: 'M' } → "COT-M". Room is left for the "-001" the caller adds. */
export const itemCodeBase = (name, attributes = {}) => {
  // Letters only for the head (a name in Hindi or Tamil has none; ITM stands in).
  const head = (plain(name).replace(/[0-9]/g, '').slice(0, 3) || 'ITM').padEnd(3, 'X');
  const parts = Object.values(attributes ?? {}).map((v) => plain(v).slice(0, 4)).filter(Boolean);
  return [head, ...parts].join('-').slice(0, ITEM_CODE_MAX - 5).replace(/-+$/, '');
};

/** "COT-M", 7 → "COT-M-007". */
export const itemCode = (base, n) => `${base}-${String(n).padStart(3, '0')}`;

/** What a typed or scanned code is compared as: trimmed, upper-case. */
export const normalizeItemCode = (code) => String(code ?? '').trim().toUpperCase();
