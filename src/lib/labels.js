import JsBarcode from 'jsbarcode';

/**
 * Barcode labels and the counter scan card, as HTML for expo-print. Barcodes are Code128 (what every phone camera and
 * shop scanner reads), drawn as SVG bars from jsbarcode's pattern — jsbarcode fills a plain object, so no DOM is needed.
 *
 * Layouts:
 * - a4-65: an A4 sheet of 65 stickers, 5 × 13, each 38.1 × 21.2 mm (the common "65 per sheet" label paper).
 * - thermal-50x25: one 50 × 25 mm label per page, for a thermal label printer.
 */

export const LAYOUTS = {
  'a4-65': { perPage: 65 },
  'thermal-50x25': { perPage: 1 },
};

const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The bar pattern for a code: a string of 1s (bar) and 0s (space), one per module, quiet zones excluded. */
export const code128Pattern = (code) => {
  const out = {};
  JsBarcode(out, String(code), { format: 'CODE128' });
  return out.encodings.map((e) => e.data).join('');
};

/** An SVG of the bars, stretched to the width it is given; 10 modules of quiet zone each side. */
export const barcodeSvg = (code, { height = '100%' } = {}) => {
  const bars = code128Pattern(code);
  const quiet = 10;
  const width = bars.length + quiet * 2;
  const rects = [];
  for (let i = 0; i < bars.length;) {
    if (bars[i] !== '1') { i += 1; continue; }
    let run = 1;
    while (bars[i + run] === '1') run += 1;
    rects.push(`<rect x="${i + quiet}" y="0" width="${run}" height="10"/>`);
    i += run;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 10" preserveAspectRatio="none" width="100%" height="${height}" shape-rendering="crispEdges">${rects.join('')}</svg>`;
};

/** Each label `copies` times, in order. */
export const expandCopies = (labels) => labels.flatMap((l) => Array.from({ length: Math.max(0, Math.min(500, l.copies ?? 1)) }, () => l));

const labelBody = ({ store, name, size, price, code }) => `
  <div class="store">${esc(store)}</div>
  <div class="name">${esc(name)}${size ? ` <span class="size">${esc(size)}</span>` : ''}</div>
  <div class="price">${esc(price)}</div>
  <div class="bars">${barcodeSvg(code)}</div>
  <div class="code">${esc(code)}</div>`;

/**
 * Labels to print. Each label is { name, size, price (already formatted, "₹499"), code, copies }; `store` is printed
 * small at the top of every label.
 */
export const labelsHtml = ({ store, labels, layout = 'a4-65' }) => {
  const all = expandCopies(labels).map((l) => ({ ...l, store }));
  if (layout === 'thermal-50x25') {
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      @page { size: 50mm 25mm; margin: 0; }
      * { box-sizing: border-box; margin: 0; }
      body { font-family: -apple-system, Roboto, sans-serif; color: #000; }
      .label { width: 50mm; height: 25mm; padding: 1.2mm 2mm; overflow: hidden; page-break-after: always; display: flex; flex-direction: column; }
      .label:last-child { page-break-after: auto; }
      .store { font-size: 6pt; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .name { font-size: 8pt; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .size { font-weight: 700; }
      .price { font-size: 9pt; font-weight: 700; }
      .bars { height: 8mm; margin-top: 0.5mm; }
      .code { font-size: 7pt; text-align: center; letter-spacing: 0.4pt; font-family: Menlo, monospace; }
    </style></head><body>${all.map((l) => `<div class="label">${labelBody(l)}</div>`).join('')}</body></html>`;
  }
  const pages = [];
  for (let i = 0; i < all.length; i += 65) pages.push(all.slice(i, i + 65));
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; margin: 0; }
    body { font-family: -apple-system, Roboto, sans-serif; color: #000; }
    .page { width: 210mm; height: 297mm; padding: 10.7mm 0 0 4.65mm; display: grid;
      grid-template-columns: repeat(5, 38.1mm); grid-auto-rows: 21.2mm; column-gap: 2.5mm; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    .label { padding: 1mm 1.6mm; overflow: hidden; display: flex; flex-direction: column; }
    .store { font-size: 4.5pt; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .name { font-size: 6pt; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .size { font-weight: 700; }
    .price { font-size: 6.5pt; font-weight: 700; }
    .bars { height: 6.5mm; }
    .code { font-size: 5pt; text-align: center; font-family: Menlo, monospace; }
  </style></head><body>${pages.map((p) => `<div class="page">${p.map((l) => `<div class="label">${labelBody(l)}</div>`).join('')}</div>`).join('')}</body></html>`;
};

/**
 * One A4 page (or more) listing products with their price and barcode, three across: a shop whose items carry no
 * barcode keeps it at the counter and scans the item off the card.
 */
export const scanCardHtml = ({ store, title, rows }) => `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: -apple-system, Roboto, sans-serif; color: #000; }
  h1 { font-size: 14pt; margin-bottom: 1mm; }
  .sub { font-size: 9pt; color: #444; margin-bottom: 5mm; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
  .cell { border: 0.3mm solid #bbb; border-radius: 2mm; padding: 2.5mm 3mm; break-inside: avoid; page-break-inside: avoid; }
  .name { font-size: 9.5pt; font-weight: 600; }
  .size { font-weight: 700; }
  .price { font-size: 10pt; font-weight: 700; margin-top: 0.5mm; }
  .bars { height: 13mm; margin-top: 1.5mm; }
  .code { font-size: 8pt; text-align: center; font-family: Menlo, monospace; letter-spacing: 0.5pt; }
</style></head><body>
  <h1>${esc(store)}</h1>
  <div class="sub">${esc(title)}</div>
  <div class="grid">${rows.map((r) => `<div class="cell">
    <div class="name">${esc(r.name)}${r.size ? ` <span class="size">${esc(r.size)}</span>` : ''}</div>
    <div class="price">${esc(r.price)}</div>
    <div class="bars">${barcodeSvg(r.code)}</div>
    <div class="code">${esc(r.code)}</div>
  </div>`).join('')}</div>
</body></html>`;
