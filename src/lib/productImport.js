import { createProductSchema } from '@storeflick/validation';
import { msg } from './i18n.js';

/**
 * Product import from a CSV file: Shopify and WooCommerce product exports, and StoreFlick's own template.
 *
 * Pure functions only (no React, no network), so scripts/verify-product-import.mjs runs them under Node. The screen
 * (app/products/import.jsx) uploads photos and creates the products one by one through the normal API.
 */

/** The template's columns, in order. Photo columns hold web links (https://…). */
export const TEMPLATE_COLUMNS = ['name', 'price', 'mrp', 'stock', 'category', 'sku', 'description', 'image1', 'image2', 'image3'];
export const TEMPLATE_CSV = `${TEMPLATE_COLUMNS.join(',')}\r\n`
  + 'Cotton Kurti,499,799,10,Kurtis,KURTI-01,Soft cotton kurti for daily wear,https://example.com/kurti.jpg,,\r\n';

/** One file at a time stays small enough for a phone and for a sitting: bigger stores split the file. */
export const MAX_PRODUCTS = 2000;
export const MAX_PHOTOS = 3;

/** RFC 4180 CSV: quoted fields, "" inside quotes, line breaks inside quotes (Shopify descriptions), CRLF or LF. */
export const parseCsv = (text) => {
  const src = String(text ?? '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i += 1; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') { row.push(field); field = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
};

/** Header row → objects keyed by header, plus each object's line number in the file (for the preview). */
const toRecords = (rows) => {
  const [head = [], ...body] = rows;
  const headers = head.map((h) => h.trim());
  return body.map((cells, i) => {
    const record = { __row: i + 2 };
    headers.forEach((h, j) => { record[h] = (cells[j] ?? '').trim(); });
    return record;
  });
};

export const detectFormat = (headers) => {
  const has = (...names) => names.every((n) => headers.some((h) => h.trim().toLowerCase() === n.toLowerCase()));
  if (has('Handle', 'Title')) return 'shopify';
  if (has('Name', 'Regular price')) return 'woocommerce';
  if (has('name', 'price')) return 'template';
  return null;
};

/* ───────────── Cleaning to StoreFlick's rules ───────────── */

const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁤﻿]/g;
const tidy = (v) => String(v ?? '').replace(INVISIBLE, '').replace(/[–—]/g, '-').replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"');
/** Keeps what a name may hold (letters, numbers, spaces and the allowed marks); anything else becomes a space. */
const keep = (allowed) => (v) => tidy(v).replace(allowed, ' ').replace(/\s+/g, ' ').trim();
const nameChars = keep(/[^\p{L}\p{M}\p{N} &.,'()/%+:"-]/gu);
const optionChars = keep(/[^\p{L}\p{M}\p{N} ./&+'-]/gu);
const categoryChars = keep(/[^\p{L}\p{M}\p{N} &.,'()-]/gu);
/** Names must start with a letter or number. */
const leading = (v) => v.replace(/^[^\p{L}\p{M}\p{N}]+/u, '');

export const cleanName = (v) => leading(nameChars(v)).slice(0, 140).trim();
export const cleanOption = (v, max) => leading(optionChars(v)).slice(0, max).trim();
export const cleanCategory = (v) => leading(categoryChars(v)).slice(0, 60).trim();
export const cleanSku = (v) => {
  const s = tidy(v).toUpperCase().replace(/[^A-Z0-9_/-]+/g, '-').replace(/^[^A-Z0-9]+/, '').slice(0, 64);
  return s || undefined;
};

const ENTITIES = { amp: '&', nbsp: ' ', quot: '"', apos: "'", '#39': "'", gt: '>', lt: '' };
/** HTML description → plain text: line breaks kept, tags dropped, "<" removed (descriptions may not hold it). */
export const plainText = (html) => {
  const text = tidy(html)
    .replace(/<\s*(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#?\w+);/g, (m, e) => ENTITIES[e.toLowerCase()] ?? (e.startsWith('#') ? String.fromCharCode(Number(e.slice(1))) || '' : m))
    .replace(/</g, '')
    .replace(INVISIBLE, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.slice(0, 8000).trim() || undefined;
};

/** The lowest price among variants, or undefined when none has one. */
const lowest = (variants) => {
  const prices = variants.map((v) => v.price).filter((v) => v !== undefined);
  return prices.length ? Math.min(...prices) : undefined;
};

/** "₹1,299.00" → 129900 paise. Empty or not a number → undefined. */
export const paise = (v) => {
  const s = String(v ?? '').replace(/[^0-9.]/g, '');
  if (!s || !/^\d*\.?\d*$/.test(s)) return undefined;
  const n = Math.round(Number(s) * 100);
  return Number.isFinite(n) ? n : undefined;
};
const count = (v) => {
  const n = Number.parseInt(String(v ?? '').replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1_000_000) : 0;
};
const isLink = (v) => /^https?:\/\/\S+$/i.test(v);
const links = (...values) => [...new Set(values.flatMap((v) => String(v ?? '').split(/[\s,]+/)).filter(isLink))];

/* ───────────── Each format into one shape ───────────── */

/**
 * The common shape before validation: { row, name, description, price, mrp, stock, sku, category, images,
 * options: [{ name, values }], variants: [{ attributes, price, mrp, stock, sku }], active }.
 */
const fromShopify = (records) => {
  const byHandle = new Map();
  for (const r of records) {
    const handle = r.Handle;
    if (!handle) continue;
    if (!byHandle.has(handle)) byHandle.set(handle, []);
    byHandle.get(handle).push(r);
  }
  return [...byHandle.values()].map((rows) => {
    const first = rows.find((r) => r.Title) ?? rows[0];
    const optionNames = [1, 2, 3].map((n) => first[`Option${n} Name`]).filter((n) => n && n !== 'Title');
    const variantRows = rows.filter((r) => r['Variant Price']);
    const images = rows
      .filter((r) => r['Image Src'])
      .sort((a, b) => Number(a['Image Position'] || 0) - Number(b['Image Position'] || 0))
      .map((r) => r['Image Src']);
    const variants = optionNames.length ? variantRows.map((r) => ({
      attributes: Object.fromEntries(optionNames.map((n, i) => [n, r[`Option${i + 1} Value`]]).filter(([, v]) => v)),
      price: paise(r['Variant Price']),
      mrp: paise(r['Variant Compare At Price']),
      stock: count(r['Variant Inventory Qty']),
      sku: r['Variant SKU'],
    })) : [];
    const main = variantRows[0] ?? first;
    const category = first.Type || String(first['Product Category'] ?? '').split('>').pop();
    return {
      row: first.__row,
      name: first.Title,
      description: first['Body (HTML)'],
      price: variants.length ? lowest(variants) : paise(main['Variant Price']),
      mrp: variants.length ? undefined : paise(main['Variant Compare At Price']),
      stock: variants.length ? 0 : count(main['Variant Inventory Qty']),
      sku: variants.length ? undefined : main['Variant SKU'],
      category,
      images: links(...images, ...variantRows.map((r) => r['Variant Image'])),
      options: optionNames.map((name) => ({ name, values: [...new Set(variants.map((v) => v.attributes[name]).filter(Boolean))] })),
      variants,
      active: !/^(draft|archived)$/i.test(first.Status ?? '') && !/^false$/i.test(first.Published ?? ''),
    };
  });
};

const wooAttributes = (r) => {
  const out = [];
  for (let n = 1; n <= 4; n += 1) {
    const name = r[`Attribute ${n} name`];
    if (name) out.push([name, String(r[`Attribute ${n} value(s)`] ?? '').split(',').map((v) => v.trim()).filter(Boolean)]);
  }
  return out;
};

const fromWoo = (records) => {
  const parents = records.filter((r) => !/^variation$/i.test(r.Type ?? ''));
  const children = records.filter((r) => /^variation$/i.test(r.Type ?? ''));
  const wooPrice = (r) => ({
    price: paise(r['Sale price']) ?? paise(r['Regular price']),
    mrp: paise(r['Sale price']) !== undefined ? paise(r['Regular price']) : undefined,
  });
  return parents.map((p) => {
    const mine = children.filter((c) => c.Parent && (c.Parent === `id:${p.ID}` || (p.SKU && c.Parent === p.SKU)));
    const options = /^variable$/i.test(p.Type ?? '') ? wooAttributes(p).map(([name, values]) => ({ name, values })) : [];
    const variants = options.length ? mine.map((c) => ({
      attributes: Object.fromEntries(wooAttributes(c).map(([name, values]) => [name, values[0]]).filter(([, v]) => v)),
      ...wooPrice(c),
      stock: count(c.Stock),
      sku: c.SKU,
    })) : [];
    const own = wooPrice(p);
    const category = String(p.Categories ?? '').split(',')[0].split('>').pop();
    return {
      row: p.__row,
      name: p.Name,
      description: p.Description || p['Short description'],
      price: variants.length ? lowest(variants) : own.price,
      mrp: variants.length ? undefined : own.mrp,
      stock: variants.length ? 0 : count(p.Stock),
      sku: variants.length ? undefined : p.SKU,
      category,
      images: links(p.Images),
      options,
      variants,
      active: String(p.Published ?? '1').trim() !== '-1' && String(p.Published ?? '1').trim() !== '0',
    };
  });
};

const fromTemplate = (records) => records.map((r) => {
  const get = (k) => r[Object.keys(r).find((h) => h.toLowerCase() === k) ?? k];
  return {
    row: r.__row,
    name: get('name'),
    description: get('description'),
    price: paise(get('price')),
    mrp: paise(get('mrp')),
    stock: count(get('stock')),
    sku: get('sku'),
    category: get('category'),
    images: links(get('image1'), get('image2'), get('image3'), get('images')),
    options: [],
    variants: [],
    active: true,
  };
});

/* ───────────── To StoreFlick's product input ───────────── */

const firstIssue = (error) => {
  const issue = error.issues[0];
  return issue ? issue.message : 'This product cannot be imported';
};

/**
 * One product in the common shape → { input, images, category } ready for the API (photos added later), or
 * { problem } saying why it cannot be imported, in the same words the server would use.
 */
export const toProduct = (p) => {
  const name = cleanName(p.name);
  if (!name) return { problem: msg('No product name') };
  if (!p.price) return { problem: msg('Price missing or not a number') };
  const cleanMrp = (price, mrp) => (mrp && mrp > price ? mrp : undefined);
  const options = p.options
    .map((o) => ({ name: cleanOption(o.name, 40), values: [...new Set(o.values.map((v) => cleanOption(v, 60)).filter(Boolean))].slice(0, 30) }))
    .filter((o) => o.name && o.values.length)
    .slice(0, 4);
  const names = new Set(options.map((o) => o.name));
  const seen = new Set();
  const variants = options.length ? p.variants
    .map((v) => ({
      attributes: Object.fromEntries(Object.entries(v.attributes)
        .map(([k, val]) => [cleanOption(k, 40), cleanOption(val, 60)])
        .filter(([k, val]) => names.has(k) && val)),
      price: v.price ?? p.price,
      ...(cleanMrp(v.price ?? p.price, v.mrp) ? { mrp: cleanMrp(v.price ?? p.price, v.mrp) } : {}),
      stock: v.stock ?? 0,
      ...(cleanSku(v.sku) ? { sku: cleanSku(v.sku) } : {}),
    }))
    .filter((v) => {
      const key = JSON.stringify(Object.entries(v.attributes).sort());
      if (!Object.keys(v.attributes).length || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 100) : [];
  const withVariants = variants.length > 0;
  const input = {
    name,
    price: p.price,
    ...(cleanMrp(p.price, p.mrp) ? { mrp: cleanMrp(p.price, p.mrp) } : {}),
    stock: withVariants ? variants.reduce((sum, v) => sum + v.stock, 0) : p.stock,
    ...(cleanSku(p.sku) && !withVariants ? { sku: cleanSku(p.sku) } : {}),
    ...(plainText(p.description) ? { description: plainText(p.description) } : {}),
    ...(withVariants ? { variantOptions: options, variants } : {}),
    active: p.active,
  };
  const checked = createProductSchema.safeParse(input);
  if (!checked.success) return { problem: firstIssue(checked.error) };
  return { input, images: p.images.slice(0, MAX_PHOTOS), category: cleanCategory(p.category) || null };
};

/**
 * A whole file → { format, ready: [{ row, input, images, category }], problems: [{ row, name, message }] }, or
 * { error } when the file is not one we can read. `existingNames` (lower case) are skipped as already in the store.
 */
export const readProductFile = (text, existingNames = new Set()) => {
  const rows = parseCsv(text);
  if (!rows.length) return { error: 'empty' };
  const format = detectFormat(rows[0]);
  if (!format) return { error: 'unknown' };
  const records = toRecords(rows);
  const items = format === 'shopify' ? fromShopify(records) : format === 'woocommerce' ? fromWoo(records) : fromTemplate(records);
  if (items.length > MAX_PRODUCTS) return { error: 'too_many', count: items.length };
  const ready = [];
  const problems = [];
  let already = 0;
  const inFile = new Set();
  for (const item of items) {
    const result = toProduct(item);
    if (result.problem) { problems.push({ row: item.row, name: cleanName(item.name) || null, message: result.problem }); continue; }
    const key = result.input.name.toLowerCase();
    if (existingNames.has(key) || inFile.has(key)) { already += 1; continue; }
    inFile.add(key);
    ready.push({ row: item.row, ...result });
  }
  return { format, ready, problems, already };
};

/**
 * Products in groups for one call each: at most 25 (the server's limit), and small enough to stay well under the
 * API's 256 KB request limit, since a long description or many sizes make one product big.
 */
export const groupsOf = (items, { max = 25, bytes = 150_000 } = {}) => {
  const groups = [];
  let group = [];
  let size = 0;
  for (const item of items) {
    const itemSize = JSON.stringify(item.input).length + 200 * (item.images?.length ?? 0);
    if (group.length && (group.length >= max || size + itemSize > bytes)) { groups.push(group); group = []; size = 0; }
    group.push(item);
    size += itemSize;
  }
  if (group.length) groups.push(group);
  return groups;
};
