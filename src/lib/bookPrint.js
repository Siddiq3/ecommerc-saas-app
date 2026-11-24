import { itemTotal } from '@storeflick/validation';
import { ledgerSide, taxInside } from './book.js';
import { esc, money, rupeesInWords } from './invoiceHtml.js';

/**
 * Printable pages for the bill book: a counter bill, khata statements and the cash book.
 * They are made on the phone (expo-print) and shared, in English like the order invoice.
 * Checked by scripts/verify-invoice.mjs.
 */

const day = (date) => new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 14mm; }
  body { font-family: -apple-system, Roboto, 'Noto Sans', sans-serif; color: #101014; font-size: 12px; }
  h1 { font-size: 20px; margin: 0; } h2 { font-size: 15px; margin: 18px 0 6px; } .muted { color: #55555f; font-size: 11px; }
  .top { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #101014; padding-bottom: 10px; margin-bottom: 14px; }
  .meta { text-align: right; } .big { font-size: 16px; font-weight: 700; margin: 10px 0 14px; }
  table { width: 100%; border-collapse: collapse; } th, td { border-bottom: 1px solid #e6e6ea; padding: 6px 4px; text-align: left; vertical-align: top; }
  th { background: #f4f4f6; font-size: 11px; } .r { text-align: right; } .gave { color: #b3261e; } .got { color: #1b7a3d; }
  .totals { margin-left: auto; width: 55%; margin-top: 10px; } .totals td { border: 0; padding: 3px 4px; }
  .grand td { font-size: 15px; font-weight: 700; border-top: 2px solid #101014; padding-top: 6px; }
  .pay { display: flex; gap: 14px; align-items: center; margin-top: 18px; padding: 12px; border: 1px solid #e6e6ea; border-radius: 8px; }
  .qr svg { width: 120px; height: 120px; display: block; }
</style></head><body>${body}</body></html>`;

/**
 * What a bill prints at the top, from the store record (GET /businesses/:id). A shop that only
 * uses the khata may have nothing but a name: every other line is left out when it is blank.
 */
export const billHeader = (business = {}) => {
  const c = business.contact ?? {};
  return {
    name: business.name ?? '',
    phone: c.phone || business.phone || null,
    address: [c.addressLine, c.city, [c.state, c.pincode].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null,
    gstin: business.gstin || null,
    upi: business.upi?.id ? business.upi : null,
  };
};

/** GST inside a price: ₹105 at 5% is ₹100 taxable and ₹5 tax, split CGST/SGST for a counter sale. */
export const gstSplit = (amount, rate) => {
  const taxable = Math.round((amount * 100) / (100 + rate));
  const tax = amount - taxable;
  const cgst = Math.floor(tax / 2);
  return { taxable, cgst, sgst: tax - cgst };
};

/** A counter bill from the book: items (or just the amount), discount, GST split, total. */
/** A UPI payment link (any UPI app opens it): to the shop's UPI ID, with the amount filled in. */
export const upiLink = (upi, amount, note) => {
  const q = new URLSearchParams({ pa: upi.id, pn: upi.name ?? '', am: (amount / 100).toFixed(2), cu: 'INR', ...(note ? { tn: note } : {}) });
  return `upi://pay?${q.toString().replace(/\+/g, '%20')}`;
};

/** What a goods entry is called on paper, and who is on the other side. */
const DOC = {
  sale: { title: 'BILL', gstTitle: 'TAX INVOICE', party: 'Bill to', noLabel: 'Bill no', line: 'Sale' },
  purchase: { title: 'PURCHASE', gstTitle: 'PURCHASE', party: 'Supplier', noLabel: "Supplier's bill no", line: 'Goods bought' },
  salesReturn: { title: 'CREDIT NOTE', gstTitle: 'CREDIT NOTE', party: 'Customer', noLabel: 'Ref no', line: 'Goods returned' },
  purchaseReturn: { title: 'DEBIT NOTE', gstTitle: 'DEBIT NOTE', party: 'Supplier', noLabel: 'Ref no', line: 'Goods returned' },
};

/** What is still to pay on a bill: the credit left after a part payment, or a UPI bill's total. */
export const dueOnBill = (entry, paid) => (entry.kind !== 'sale' ? 0
  : entry.mode === 'credit' ? entry.amount - (paid?.amount ?? 0) : entry.mode === 'upi' ? entry.amount : 0);

/**
 * `qr` is an SVG (src/lib/qr.js) of upiLink(...) for what is still to pay, made by the caller
 * (QR generation is async); shown with the UPI ID so a customer can scan or type it.
 */
export const billHtml = ({ store: business, entry, partyName, paid, qr }) => {
  const doc = DOC[entry.kind] ?? DOC.sale;
  const store = billHeader(business);
  const items = entry.items ?? [];
  const subtotal = items.reduce((sum, i) => sum + itemTotal(i), 0);
  // Tax lines and "TAX INVOICE" only for a GST-registered shop: without a GSTIN it is a plain bill.
  const gst = entry.gstRate && store.gstin ? gstSplit(entry.amount, entry.gstRate) : null;
  const rows = items.length
    ? items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.name)}</td><td class="r">${i.qty} ${esc(i.unit)}</td><td class="r">${money(i.price)}</td><td class="r">${money(itemTotal(i))}</td></tr>`).join('')
    : `<tr><td>1</td><td>${esc(entry.note || doc.line)}</td><td class="r">1</td><td class="r">${money(entry.amount)}</td><td class="r">${money(entry.amount)}</td></tr>`;
  return page(`
    <div class="top">
      <div><h1>${esc(store.name)}</h1>
        ${store.address ? `<div>${esc(store.address)}</div>` : ''}
        ${store.phone ? `<div>Phone: +91 ${esc(store.phone)}</div>` : ''}
        ${store.gstin ? `<div><b>GSTIN: ${esc(store.gstin)}</b></div>` : ''}</div>
      <div class="meta"><h2 style="margin:0">${gst ? doc.gstTitle : doc.title}</h2>
        ${entry.billNo ? `<div>${doc.noLabel}: <b>${esc(entry.billNo)}</b></div>` : ''}
        <div>Date: ${esc(day(entry.date))}</div>
        <div>Payment: ${entry.mode === 'credit' ? (paid ? 'Part paid, rest on credit' : 'Credit') : entry.mode === 'upi' ? 'UPI' : 'Cash'}</div></div>
    </div>
    ${partyName ? `<div class="muted">${doc.party}</div><b>${esc(partyName)}</b>` : ''}
    <table style="margin-top:12px"><thead><tr><th>#</th><th>Item</th><th class="r">Qty</th><th class="r">Rate ₹</th><th class="r">Amount ₹</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="totals">
      ${entry.discount ? `<tr><td>Subtotal</td><td class="r">₹${money(subtotal)}</td></tr><tr><td>Discount</td><td class="r">− ₹${money(entry.discount)}</td></tr>` : ''}
      ${gst ? `<tr><td>Taxable value</td><td class="r">₹${money(gst.taxable)}</td></tr>
        <tr><td>CGST ${entry.gstRate / 2}%</td><td class="r">₹${money(gst.cgst)}</td></tr>
        <tr><td>SGST ${entry.gstRate / 2}%</td><td class="r">₹${money(gst.sgst)}</td></tr>` : ''}
      <tr class="grand"><td>Total</td><td class="r">₹${money(entry.amount)}</td></tr>
      ${paid ? `<tr><td>Paid now (${paid.mode === 'upi' ? 'UPI' : 'Cash'})</td><td class="r">− ₹${money(paid.amount)}</td></tr>
        <tr><td><b>Balance on credit</b></td><td class="r"><b>₹${money(entry.amount - paid.amount)}</b></td></tr>` : ''}
    </table>
    <div class="muted" style="text-align:right">${esc(rupeesInWords(entry.amount))}</div>
    ${qr && store.upi && dueOnBill(entry, paid) ? `<div class="pay"><div class="qr">${qr}</div><div><b>Scan to pay ₹${money(dueOnBill(entry, paid))}</b>
      <div class="muted">UPI ID: ${esc(store.upi.id)}</div><div class="muted">Any UPI app: GPay, PhonePe, Paytm, BHIM</div></div></div>` : ''}
    <div class="muted" style="margin-top:24px">${gst ? 'Prices include GST. ' : ''}${entry.kind === 'sale' ? 'Thank you for shopping with us.' : ''}</div>`);
};

/**
 * One party's statement: every entry, newest first, in "You gave" / "You got" columns with
 * the running balance. `entries` come from readParty (with balanceAfter).
 */
export const khataHtml = ({ store, party, entries }) => {
  const supplier = party.partyType === 'supplier';
  const rows = entries.map((e) => `<tr>
      <td>${esc(day(e.date))}${e.note ? `<div class="muted">${esc(e.note)}</div>` : ''}</td>
      <td class="r gave">${ledgerSide(e, party.partyType) === 'gave' ? money(e.amount) : ''}</td>
      <td class="r got">${ledgerSide(e, party.partyType) === 'got' ? money(e.amount) : ''}</td>
      <td class="r">${money(e.balanceAfter)}</td>
    </tr>`).join('');
  return page(`
    <div class="top"><div><h1>${esc(store)}</h1><div class="muted">Khata statement · ${esc(day(new Date().toISOString().slice(0, 10)))}</div></div></div>
    <div><b>${esc(party.name)}</b>${party.mobile ? ` · +91 ${esc(party.mobile)}` : ''}</div>
    <div class="big">${party.balance < 0 ? 'Advance' : supplier ? 'You will give' : 'Balance due'}: ₹${money(Math.abs(party.balance))}</div>
    <table><thead><tr><th>Date</th><th class="r">You gave ₹</th><th class="r">You got ₹</th><th class="r">Balance ₹</th></tr></thead><tbody>${rows}</tbody></table>`);
};

/** Everyone in a khata tab with what they owe (or are owed), and the total. */
export const khataListHtml = ({ store, supplier, parties }) => {
  const owed = parties.filter((p) => p.balance > 0).reduce((sum, p) => sum + p.balance, 0);
  const rows = parties.map((p) => `<tr><td>${esc(p.name)}</td><td>${p.mobile ? `+91 ${esc(p.mobile)}` : ''}</td>
    <td>${p.dueDate ? esc(day(p.dueDate)) : ''}</td><td>${p.lastDate ? esc(day(p.lastDate)) : ''}</td>
    <td class="r ${p.balance > 0 ? (supplier ? 'got' : 'gave') : ''}">${p.balance < 0 ? `Advance ${money(-p.balance)}` : money(p.balance)}</td></tr>`).join('');
  return page(`
    <div class="top"><div><h1>${esc(store)}</h1><div class="muted">${supplier ? 'Suppliers' : 'Customers'} · ${esc(day(new Date().toISOString().slice(0, 10)))}</div></div></div>
    <div class="big">${supplier ? 'Total to pay' : 'Total to collect'}: ₹${money(owed)}</div>
    <table><thead><tr><th>Name</th><th>Mobile</th><th>Due date</th><th>Last entry</th><th class="r">Balance ₹</th></tr></thead><tbody>${rows}</tbody></table>`);
};

const KIND = {
  sale: 'Bill', expense: 'Expense', collection: 'Payment received', opening: 'Starting cash', due: 'Old dues',
  purchase: 'Purchase', salesReturn: 'Sales return', purchaseReturn: 'Return to supplier',
};
const entryType = (e) => (e.partyType === 'supplier' ? { expense: 'Paid supplier', due: 'Goods on credit' }[e.kind] : null) ?? KIND[e.kind] ?? e.kind;

/** The cash book for a range (from readRange): totals, each day's balances, expenses by head. */
export const cashBookHtml = ({ store, range }) => {
  const { totals } = range;
  const line = (label, value) => `<tr><td>${label}</td><td class="r">₹${money(value)}</td></tr>`;
  return page(`
    <div class="top"><div><h1>${esc(store)}</h1><div class="muted">Cash book · ${esc(day(range.from))} to ${esc(day(range.to))}</div></div></div>
    <table class="totals" style="margin-left:0;width:100%">
      ${line('Opening balance', range.opening)}
      ${line('Sales (cash + UPI)', totals.sales.cash + totals.sales.upi)}
      ${line('Sales on credit', totals.sales.credit)}
      ${line('Dues collected', totals.collections)}
      ${line('Expenses', totals.expenses)}
      ${line('Purchases (all)', totals.purchases.total)}
      ${totals.salesReturns.total ? line('Sales returns', totals.salesReturns.total) : ''}
      ${totals.purchaseReturns.total ? line('Returns to suppliers', totals.purchaseReturns.total) : ''}
      ${line('Goods bought on credit (old style)', range.purchases)}
      ${line('Sales − expenses', totals.sales.total - totals.expenses)}
      <tr class="grand"><td>Closing balance</td><td class="r">₹${money(range.closing)}</td></tr>
    </table>
    <h2>Day by day</h2>
    <table><thead><tr><th>Date</th><th class="r">Opening</th><th class="r">Sales</th><th class="r">Collected</th><th class="r">Expenses</th><th class="r">Closing</th></tr></thead>
      <tbody>${range.days.map((d) => `<tr><td>${esc(day(d.date))}</td><td class="r">${money(d.openingBalance)}</td><td class="r">${money(d.sales.total)}</td>
        <td class="r">${money(d.collections)}</td><td class="r">${money(d.expenses)}</td><td class="r">${money(d.closingBalance)}</td></tr>`).join('')}</tbody></table>
    ${range.gst?.rates.length ? `<h2>GST</h2>
      <table><thead><tr><th>Rate</th><th class="r">Sales taxable ₹</th><th class="r">Tax collected ₹</th><th class="r">Purchase taxable ₹</th><th class="r">Tax paid ₹</th></tr></thead>
      <tbody>${range.gst.rates.map((r) => `<tr><td>${r.rate}%</td><td class="r">${money(r.output.taxable)}</td><td class="r">${money(r.output.tax)}</td>
        <td class="r">${money(r.input.taxable)}</td><td class="r">${money(r.input.tax)}</td></tr>`).join('')}</tbody></table>
      <table class="totals"><tr><td>Tax collected (CGST + SGST)</td><td class="r">₹${money(range.gst.output.tax)}</td></tr>
        <tr><td>Tax paid on purchases</td><td class="r">− ₹${money(range.gst.input.tax)}</td></tr>
        <tr class="grand"><td>${range.gst.payable < 0 ? 'GST credit to carry forward' : 'GST to pay'}</td><td class="r">₹${money(Math.abs(range.gst.payable))}</td></tr></table>
      <div class="muted">A summary from the book. For GSTR-1, add HSN codes and customers' GSTINs.</div>` : ''}
    ${range.expensesBy.length ? `<h2>Expenses by head</h2><table><tbody>${range.expensesBy.map((e) => `<tr><td>${esc(e.label ?? e.category ?? 'Other')}</td><td class="r">${money(e.total)}</td></tr>`).join('')}</tbody></table>` : ''}`);
};

const cell = (v) => {
  const text = String(v ?? '');
  // Quote everything; a leading = + - @ is neutralised so a spreadsheet never runs it as a formula.
  return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
};

/** Every entry in a range as CSV for a spreadsheet or an accountant. Amounts in rupees. */
export const cashBookCsv = (range) => [
  ['Date', 'Type', 'Party', 'Mode', 'Category', 'Bill no', 'Amount (Rs)', 'GST %', 'Taxable (Rs)', 'GST (Rs)', 'Note'],
  ...range.entries.map((e) => {
    const g = e.gstRate ? taxInside(e.amount, e.gstRate) : null;
    return [e.date, entryType(e), e.partyName, e.mode, e.label ?? e.category, e.billNo, (e.amount / 100).toFixed(2),
      e.gstRate ?? '', g ? (g.taxable / 100).toFixed(2) : '', g ? (g.tax / 100).toFixed(2) : '', e.note];
  }),
].map((row) => row.map(cell).join(',')).join('\r\n');

/**
 * A till receipt for a 58 mm or 80 mm thermal printer, printed through Android's print system
 * (a Bluetooth printer shows up there through a print-service app such as RawBT, or the
 * printer maker's own). Plain, narrow, monospace-free so Indian names print; the QR lets the
 * customer pay what is left by UPI.
 */
export const receiptHtml = ({ store: business, entry, partyName, paid, qr, width = 58 }) => {
  const store = billHeader(business);
  const doc = DOC[entry.kind] ?? DOC.sale;
  const items = entry.items ?? [];
  // Tax lines and "TAX INVOICE" only for a GST-registered shop: without a GSTIN it is a plain bill.
  const gst = entry.gstRate && store.gstin ? gstSplit(entry.amount, entry.gstRate) : null;
  const due = dueOnBill(entry, paid);
  const lines = items.length
    ? items.map((i) => `<div class="it"><div>${esc(i.name)}</div><div class="row"><span>${i.qty} × ${money(i.price)}</span><span>${money(itemTotal(i))}</span></div></div>`).join('')
    : `<div class="row"><span>${esc(entry.note || doc.line)}</span><span>${money(entry.amount)}</span></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${width}mm auto; margin: 0; }
    body { width: ${width - 6}mm; margin: 3mm; font-family: -apple-system, Roboto, 'Noto Sans', sans-serif; font-size: ${width === 80 ? 12 : 10.5}px; color: #000; }
    .c { text-align: center; } h1 { font-size: 1.35em; margin: 0; } .muted { font-size: .9em; }
    .rule { border-top: 1px dashed #000; margin: 4px 0; } .row { display: flex; justify-content: space-between; gap: 6px; }
    .it { margin-bottom: 3px; } .grand { font-weight: 700; font-size: 1.2em; } .qr svg { width: ${width === 80 ? 44 : 32}mm; height: auto; }
  </style></head><body>
    <div class="c"><h1>${esc(store.name)}</h1>
      ${store.address ? `<div class="muted">${esc(store.address)}</div>` : ''}
      ${store.phone ? `<div class="muted">Ph: ${esc(store.phone)}</div>` : ''}
      ${store.gstin ? `<div class="muted">GSTIN: ${esc(store.gstin)}</div>` : ''}
      <div><b>${gst ? doc.gstTitle : doc.title}</b></div></div>
    <div class="rule"></div>
    <div class="row"><span>${entry.billNo ? esc(entry.billNo) : ''}</span><span>${esc(day(entry.date))}</span></div>
    ${partyName ? `<div>${doc.party}: ${esc(partyName)}</div>` : ''}
    <div class="rule"></div>
    ${lines}
    <div class="rule"></div>
    ${entry.discount ? `<div class="row"><span>Discount</span><span>− ${money(entry.discount)}</span></div>` : ''}
    ${gst ? `<div class="row muted"><span>Taxable</span><span>${money(gst.taxable)}</span></div>
      <div class="row muted"><span>CGST ${entry.gstRate / 2}%</span><span>${money(gst.cgst)}</span></div>
      <div class="row muted"><span>SGST ${entry.gstRate / 2}%</span><span>${money(gst.sgst)}</span></div>` : ''}
    <div class="row grand"><span>TOTAL ₹</span><span>${money(entry.amount)}</span></div>
    <div class="row"><span>Paid by</span><span>${entry.mode === 'credit' ? (paid ? `${paid.mode === 'upi' ? 'UPI' : 'Cash'} ${money(paid.amount)} + credit` : 'Credit') : entry.mode === 'upi' ? 'UPI' : 'Cash'}</span></div>
    ${paid ? `<div class="row"><span>Balance</span><span>${money(entry.amount - paid.amount)}</span></div>` : ''}
    ${qr && store.upi && due ? `<div class="rule"></div><div class="c"><div class="qr">${qr}</div><div>Scan to pay ₹${money(due)}</div><div class="muted">${esc(store.upi.id)}</div></div>` : ''}
    <div class="rule"></div>
    <div class="c muted">${entry.kind === 'sale' ? 'Thank you! Visit again.' : ''}</div>
  </body></html>`;
};
