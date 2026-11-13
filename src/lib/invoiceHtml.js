/**
 * The order bill as an HTML page, turned into a PDF on the phone (expo-print) and shared on
 * WhatsApp. The numbers come from the API (backend orders/invoice.js); this file only lays
 * them out. Checked by scripts/verify-invoice.mjs.
 */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (paise) => (Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** Indian rupees in words for the total line: 205520 paise → "Two Thousand Fifty Five Rupees and Twenty Paise Only". */
export const rupeesInWords = (paise) => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
    'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`);
  const three = (n) => [n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred` : '', two(n % 100)].filter(Boolean).join(' ');
  const words = (n) => {
    if (!n) return 'Zero';
    const parts = [];
    for (const [size, name] of [[1e7, 'Crore'], [1e5, 'Lakh'], [1e3, 'Thousand']]) {
      if (n >= size) { parts.push(`${words(Math.floor(n / size))} ${name}`); n %= size; }
    }
    if (n) parts.push(three(n));
    return parts.join(' ');
  };
  const total = Math.round(Number(paise) || 0);
  const r = Math.floor(total / 100);
  const p = total % 100;
  return `${words(r)} Rupees${p ? ` and ${two(p)} Paise` : ''} Only`;
};

export const invoiceHtml = (inv) => {
  const gst = inv.kind === 'TAX_INVOICE';
  const taxCols = gst ? (inv.interState ? ['IGST'] : ['CGST', 'SGST']) : [];
  const rows = inv.lines.map((l, i) => `<tr>
      <td>${i + 1}</td>
      <td>${esc(l.name)}${l.variantLabel ? `<div class="muted">${esc(l.variantLabel)}</div>` : ''}${l.discount ? `<div class="muted">Discount ₹${money(l.discount)}</div>` : ''}</td>
      ${gst ? `<td>${esc(l.hsn ?? '')}</td>` : ''}
      <td class="r">${l.quantity}</td>
      <td class="r">${money(l.unitPrice)}</td>
      ${gst ? `<td class="r">${money(l.taxable)}</td><td class="r">${l.rate}%</td>` : ''}
      ${taxCols.map((c) => `<td class="r">${money(l[c.toLowerCase()])}</td>`).join('')}
      <td class="r">${money(l.amount)}</td>
    </tr>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 14mm; }
    body { font-family: -apple-system, Roboto, 'Noto Sans', sans-serif; color: #101014; font-size: 12px; }
    h1 { font-size: 20px; margin: 0; } h2 { font-size: 15px; margin: 0 0 4px; }
    .top { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #101014; padding-bottom: 10px; }
    .meta { text-align: right; } .muted { color: #55555f; font-size: 11px; }
    .parties { display: flex; gap: 24px; margin: 14px 0; } .parties > div { flex: 1; }
    table { width: 100%; border-collapse: collapse; } th, td { border-bottom: 1px solid #e6e6ea; padding: 6px 4px; text-align: left; vertical-align: top; }
    th { background: #f4f4f6; font-size: 11px; } .r { text-align: right; }
    .totals { margin-left: auto; width: 55%; margin-top: 10px; } .totals td { border: 0; padding: 3px 4px; }
    .grand td { font-size: 15px; font-weight: 700; border-top: 2px solid #101014; padding-top: 6px; }
    .foot { margin-top: 24px; font-size: 11px; color: #55555f; }
  </style></head><body>
    <div class="top">
      <div>
        <h1>${esc(inv.seller.name)}</h1>
        ${inv.seller.address ? `<div>${esc(inv.seller.address)}</div>` : ''}
        ${inv.seller.phone ? `<div>Phone: +91 ${esc(inv.seller.phone)}</div>` : ''}
        ${inv.seller.gstin ? `<div><b>GSTIN: ${esc(inv.seller.gstin)}</b></div>` : ''}
      </div>
      <div class="meta">
        <h2>${gst ? 'TAX INVOICE' : 'INVOICE'}</h2>
        <div>Invoice no: <b>${esc(inv.number)}</b></div>
        <div>Date: ${esc(day(inv.date))}</div>
        <div>Order: ${esc(inv.orderNumber)}</div>
        <div>Payment: ${inv.paymentMethod === 'COD' ? 'Cash on delivery' : 'UPI'}</div>
      </div>
    </div>
    <div class="parties">
      <div><div class="muted">Bill to</div><b>${esc(inv.buyer.name)}</b>
        ${inv.buyer.mobile ? `<div>+91 ${esc(inv.buyer.mobile)}</div>` : ''}<div>${esc(inv.buyer.address)}</div></div>
      ${gst ? `<div><div class="muted">Place of supply</div><b>${esc(inv.placeOfSupply ?? '—')}</b></div>` : ''}
    </div>
    <table>
      <thead><tr><th>#</th><th>Item</th>${gst ? '<th>HSN</th>' : ''}<th class="r">Qty</th><th class="r">Rate ₹</th>
        ${gst ? '<th class="r">Taxable ₹</th><th class="r">GST</th>' : ''}${taxCols.map((c) => `<th class="r">${c} ₹</th>`).join('')}<th class="r">Amount ₹</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <table class="totals">
      ${inv.totals.discount ? `<tr><td>Discount included</td><td class="r">₹${money(inv.totals.discount)}</td></tr>` : ''}
      ${gst ? `<tr><td>Taxable value</td><td class="r">₹${money(inv.totals.taxable)}</td></tr>` : ''}
      ${taxCols.map((c) => `<tr><td>${c}</td><td class="r">₹${money(inv.totals[c.toLowerCase()])}</td></tr>`).join('')}
      <tr class="grand"><td>Total</td><td class="r">₹${money(inv.totals.total)}</td></tr>
    </table>
    <div class="muted" style="text-align:right">${esc(rupeesInWords(inv.totals.total))}</div>
    <div class="foot">${gst ? 'Prices include GST. ' : ''}This is a computer-generated bill and needs no signature.</div>
  </body></html>`;
};
