import { itemCode, itemCodeBase, normalizeItemCode } from '@storeflick/shared';
import { BOOK_QTY_MAX } from '@storeflick/validation';
import { withBookTransaction } from './bookStore.js';

/**
 * A small copy of the store's products in the bill book's SQLite database, so a scanned or typed item code finds its
 * product at the counter with no internet. One row per thing that can go on a bill: a product without sizes, or one
 * size/colour of a product. Never synced: it is refreshed from the server (GET /products/catalog) when the book syncs
 * (at most every 10 minutes), and row by row when a product is saved on this phone.
 *
 * `variantId` is '' for a product without sizes, so (productId, variantId) can be the key.
 */

// The table and its sku index are created with the book (bookStore.js SCHEMA).

const COLS = ['productId', 'variantId', 'name', 'label', 'sku', 'price', 'unit', 'stockTracked', 'sortOrder'];
export const REFRESH_EVERY_MS = 10 * 60_000;

/** "M / Red" — the same label the bill uses for a size picked from My products. */
export const sizeLabel = (attributes) => Object.values(attributes ?? {}).join(' / ');

const sizeRow = (product, v) => ({
  productId: product.productId,
  variantId: v.variantId,
  name: product.name,
  label: sizeLabel(v.attributes),
  sku: v.sku ? normalizeItemCode(v.sku) : null,
  price: v.price || product.price,
  unit: 'pcs',
  stockTracked: product.trackInventory === false ? 0 : 1,
  sortOrder: v.sortOrder ?? 0,
});

/**
 * Bill rows for one product as the API returns it (with `variants`): its sizes, or itself when it has none. A product
 * or size hidden from the online store is still offered: online visibility never decides what the counter can sell.
 */
export const rowsForProduct = (product) => {
  if (!product || product.deletedAt) return [];
  const sizes = product.variants ?? [];
  if (product.hasVariants || sizes.length) return sizes.map((v) => sizeRow(product, v));
  return [{
    productId: product.productId, variantId: '', name: product.name, label: '', sku: product.sku ? normalizeItemCode(product.sku) : null,
    price: product.price, unit: 'pcs', stockTracked: product.trackInventory === false ? 0 : 1, sortOrder: 0,
  }];
};

/** Rows from the catalog feed, which sends products and sizes as separate records. */
export const rowsFromCatalog = (records) => {
  const products = new Map();
  const sizes = new Map();
  for (const r of records) {
    if (r.kind === 'product') products.set(r.productId, r);
    else if (r.kind === 'variant') sizes.set(r.productId, [...(sizes.get(r.productId) ?? []), r]);
  }
  return [...products.values()].flatMap((p) => rowsForProduct({ ...p, variants: sizes.get(p.productId) ?? [] }));
};

const insert = (tx, row) => tx.runAsync(
  `INSERT OR REPLACE INTO catalog (${COLS.join(', ')}) VALUES (${COLS.map(() => '?').join(', ')})`,
  COLS.map((c) => row[c] ?? null),
);

/** Replaces the whole copy (a full refresh). */
export const replaceCatalog = (db, rows) => withBookTransaction(db, async (tx) => {
  await tx.runAsync('DELETE FROM catalog');
  for (const row of rows) await insert(tx, row);
});

/** Puts one product's rows in place of the old ones (after a save on this phone, or a code found online). */
export const cacheProduct = (db, product) => withBookTransaction(db, async (tx) => {
  await tx.runAsync('DELETE FROM catalog WHERE productId = ?', [product.productId]);
  for (const row of rowsForProduct(product)) await insert(tx, row);
});

export const uncacheProduct = (db, productId) => db.runAsync('DELETE FROM catalog WHERE productId = ?', [productId]);

/**
 * Fetches every page of the catalog and replaces the copy, unless it was refreshed in the last 10 minutes (`force`
 * skips that). A failure leaves the old copy, which is better than none at the counter.
 */
export const refreshCatalog = async (db, api, businessId, { force = false, now = Date.now() } = {}) => {
  const last = Number((await db.getFirstAsync("SELECT value FROM meta WHERE key = 'catalogAt'"))?.value) || 0;
  if (!force && now - last < REFRESH_EVERY_MS) return false;
  const records = [];
  let cursor;
  for (let page = 0; page < 40; page += 1) {
    const res = await api.catalog(businessId, cursor ? { cursor } : undefined);
    records.push(...res.items);
    if (!res.nextCursor) break;
    cursor = res.nextCursor;
  }
  await replaceCatalog(db, rowsFromCatalog(records));
  await db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES ('catalogAt', ?)", [String(now)]);
  return true;
};

/** The bill row with exactly this code (any case), or null. Uses the sku index. */
export const findByCode = async (db, code) => {
  const key = normalizeItemCode(code);
  return key ? (await db.getFirstAsync('SELECT * FROM catalog WHERE sku = ? LIMIT 1', [key])) ?? null : null;
};

/**
 * Up to `limit` rows whose code starts with `text`, or whose name has it, for the suggestions under the item-code box.
 * The code prefix is a range on the index (KUR ≤ sku < KUS), so it stays quick with thousands of products.
 */
export const suggest = async (db, text, limit = 5) => {
  const key = normalizeItemCode(text);
  if (!key) return [];
  const upper = key.slice(0, -1) + String.fromCharCode(key.charCodeAt(key.length - 1) + 1);
  const byCode = await db.getAllAsync('SELECT * FROM catalog WHERE sku >= ? AND sku < ? ORDER BY sku LIMIT ?', [key, upper, limit]);
  if (byCode.length >= limit) return byCode;
  const like = `%${String(text).trim().replace(/[%_]/g, '')}%`;
  const byName = await db.getAllAsync(
    'SELECT * FROM catalog WHERE name LIKE ? OR label LIKE ? ORDER BY name, sortOrder LIMIT ?', [like, like, limit * 2],
  );
  const seen = new Set(byCode.map((r) => `${r.productId}#${r.variantId}`));
  return [...byCode, ...byName.filter((r) => !seen.has(`${r.productId}#${r.variantId}`))].slice(0, limit);
};

/**
 * Finds a code: the phone's copy first; when it is not there and the phone is online, the server once (and the answer
 * is kept). Returns { row } when found, { row: null } when no product has it, { row: null, offline: true } when only the
 * server could have said and it could not be reached.
 */
export const lookupCode = async (db, api, businessId, code) => {
  const cached = await findByCode(db, code);
  if (cached) return { row: cached };
  if (!api) return { row: null, offline: true };
  try {
    const { product, variant } = await api.byCode(businessId, normalizeItemCode(code));
    await cacheProduct(db, product);
    if (product.hasVariants && !variant) return { row: null, needsSize: product };
    return { row: await findByCode(db, code) };
  } catch (error) {
    if (error?.status === 404) return { row: null };
    return { row: null, offline: true };
  }
};

/** A bill line for a row, exactly as My products makes one: the size in the name, the product and size ids kept. */
export const lineFor = (row) => ({
  name: (row.label ? `${row.name} (${row.label})` : row.name).slice(0, 80),
  qty: 1,
  unit: row.unit || 'pcs',
  price: row.price,
  productId: row.productId,
  ...(row.variantId ? { variantId: row.variantId } : {}),
});

/** Adds a line, or one more of it when the same product and size is already on the bill. */
export const addOrIncrement = (items, line) => {
  const i = items.findIndex((it) => it.productId && it.productId === line.productId && (it.variantId ?? '') === (line.variantId ?? ''));
  if (i < 0) return [...items, line];
  return items.map((it, j) => (j === i ? { ...it, qty: Math.min(BOOK_QTY_MAX, Number(it.qty) + 1) } : it));
};

/**
 * The scanner sees a barcode many times a second while it is in view. A code is taken once, then the same code is
 * ignored for `ms`; a different code is taken at once.
 */
export const cooldown = (ms = 1200) => {
  let last = { code: null, at: -Infinity };
  return (code, now = Date.now()) => {
    if (code === last.code && now - last.at < ms) return false;
    last = { code, at: now };
    return true;
  };
};

/**
 * A code for a new product, for the Generate button: COT-001, numbered after the highest this phone knows for that
 * base. The server still checks it is free when the product is saved (and a product saved with no code gets one there).
 */
export const nextCode = async (db, name) => {
  const base = itemCodeBase(name);
  const taken = db ? await db.getAllAsync('SELECT sku FROM catalog WHERE sku >= ? AND sku < ?', [`${base}-`, `${base}.`]) : [];
  const top = taken.reduce((n, r) => Math.max(n, Number(String(r.sku).slice(base.length + 1)) || 0), 0);
  return itemCode(base, top + 1);
};
