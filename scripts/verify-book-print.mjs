import assert from 'node:assert/strict';
import { billHeader, billHtml, cashBookCsv, dueOnBill, gstSplit, khataListHtml, receiptHtml, upiLink } from '../src/lib/bookPrint.js';

// GST is inside the price: ₹105 at 5% is ₹100 + ₹2.50 + ₹2.50, and the parts always add back up.
assert.deepEqual(gstSplit(10500, 5), { taxable: 10000, cgst: 250, sgst: 250 });
for (const [amount, rate] of [[9999, 18], [1, 28], [123457, 12]]) {
  const g = gstSplit(amount, rate);
  assert.equal(g.taxable + g.cgst + g.sgst, amount);
}

// The bill header comes from the store record; a khata-only shop with just a name prints just the name.
assert.deepEqual(billHeader({ name: 'Ravi Kirana' }), { name: 'Ravi Kirana', phone: null, address: null, gstin: null, upi: null });
assert.equal(billHeader({ name: 'S', contact: { addressLine: 'MG Road', city: 'Kurnool', state: 'Andhra Pradesh', pincode: '518001' } }).address,
  'MG Road, Kurnool, Andhra Pradesh 518001');
const store = {
  name: 'Asha <Kurtis>', gstin: '29ABCDE1234F1Z5', logoUrl: 'https://cdn.example/logo.png',
  contact: { phone: '9876543210', addressLine: 'MG Road', city: 'Kurnool' },
};
const bill = billHtml({ store, partyName: 'Ravi', entry: {
  date: '2026-11-23', amount: 240000, discount: 10000, gstRate: 5, billNo: '231126-1', mode: 'credit',
  items: [{ name: 'Silk saree', qty: 2, unit: 'pcs', price: 125000 }],
} });
assert.ok(bill.includes('TAX INVOICE') && bill.includes('231126-1') && bill.includes('MG Road, Kurnool'));
assert.ok(!bill.includes('<img') && bill.includes('Phone: +91 9876543210') && bill.includes('GSTIN: 29ABCDE1234F1Z5'));
assert.ok(bill.includes('Asha &lt;Kurtis&gt;'), 'store text is escaped');
assert.ok(bill.includes('2,500.00') && bill.includes('− ₹100.00'), 'subtotal and discount');
assert.ok(!billHtml({ store: { name: 'S' }, entry: { date: '2026-11-23', amount: 500, mode: 'cash' } }).includes('TAX INVOICE'), 'no GST, no tax invoice');

const partPaid = billHtml({ store: { name: 'S' }, partyName: 'Ravi', paid: { amount: 10000, mode: 'cash' },
  entry: { date: '2026-11-23', amount: 30000, mode: 'credit', billNo: '231126-K7Q-1' } });
assert.ok(partPaid.includes('Paid now (Cash)') && partPaid.includes('− ₹100.00') && partPaid.includes('Balance on credit') && partPaid.includes('₹200.00'),
  'a part-paid bill shows what was paid and what is left on credit');
const list = khataListHtml({ store: 'S', supplier: false, parties: [{ name: 'A', balance: 5000 }, { name: 'B', balance: -200 }] });
assert.ok(list.includes('Total to collect: ₹50.00') && list.includes('Advance 2.00'));

const csv = cashBookCsv({ entries: [
  { date: '2026-11-23', kind: 'expense', partyType: 'supplier', partyName: 'Ramesh "RT" Traders', mode: 'cash', category: 'dealer', amount: 150050, note: '=HYPERLINK("x")' },
] }).split('\r\n');
assert.equal(csv.length, 2);
assert.ok(csv[1].includes('"Paid supplier"') && csv[1].includes('"Ramesh ""RT"" Traders"') && csv[1].includes('"1500.50"'));
assert.ok(csv[1].includes(`"'=HYPERLINK(""x"")"`), 'a formula in a note is neutralised');

// An unregistered shop (no GSTIN) never prints a tax invoice, even for an entry with a GST rate.
const unregistered = billHtml({ store: { name: 'Ravi Kirana' }, entry: { kind: 'sale', date: '2026-11-23', amount: 10500, gstRate: 5, mode: 'cash' } });
assert.ok(!unregistered.includes('TAX INVOICE') && !unregistered.includes('CGST') && unregistered.includes('BILL'));
assert.ok(!receiptHtml({ store: { name: 'Ravi Kirana' }, entry: { kind: 'sale', date: '2026-11-23', amount: 10500, gstRate: 5, mode: 'cash' } }).includes('CGST'));

// UPI: a payment link any UPI app opens, a QR only when something is left to pay.
const upi = { id: 'meera@okaxis', name: 'Meera Handlooms' };
assert.equal(upiLink(upi, 12550, 'Bill 1'), 'upi://pay?pa=meera%40okaxis&pn=Meera%20Handlooms&am=125.50&cu=INR&tn=Bill%201');
assert.equal(dueOnBill({ kind: 'sale', mode: 'cash', amount: 500 }), 0, 'a cash bill is paid');
assert.equal(dueOnBill({ kind: 'sale', mode: 'credit', amount: 500 }, { amount: 200 }), 300);
const withQr = billHtml({ store: { name: 'S', upi }, qr: '<svg id="q"></svg>', entry: { kind: 'sale', date: '2026-11-23', amount: 500, mode: 'credit' } });
assert.ok(withQr.includes('<svg id="q">') && withQr.includes('Scan to pay ₹5.00') && withQr.includes('meera@okaxis'));
assert.ok(!billHtml({ store: { name: 'S', upi }, qr: '<svg id="q"></svg>', entry: { kind: 'sale', date: '2026-11-23', amount: 500, mode: 'cash' } }).includes('Scan to pay'));
assert.ok(billHtml({ store: { name: 'S' }, entry: { kind: 'salesReturn', date: '2026-11-23', amount: 500, mode: 'cash' } }).includes('CREDIT NOTE'));
assert.ok(billHtml({ store: { name: 'S' }, entry: { kind: 'purchase', billNo: 'INV-9', date: '2026-11-23', amount: 500, mode: 'credit' } }).includes("Supplier's bill no"));
// Thermal receipt: sized to the paper, with the total and how it was paid.
const r58 = receiptHtml({ store: { name: 'S', upi }, qr: '<svg/>', paid: { amount: 100, mode: 'cash' },
  entry: { kind: 'sale', date: '2026-11-23', amount: 500, mode: 'credit', billNo: '231126-K7Q-1', items: [{ name: 'Tea', qty: 2, unit: 'pcs', price: 250 }] } });
assert.ok(r58.includes('size: 58mm auto') && r58.includes('TOTAL ₹') && r58.includes('Cash 1.00 + credit') && r58.includes('Scan to pay ₹4.00'));
assert.ok(receiptHtml({ store: { name: 'S' }, width: 80, entry: { kind: 'sale', date: '2026-11-23', amount: 500, mode: 'cash' } }).includes('size: 80mm auto'));
// The CSV carries the GST split.
const gstCsv = cashBookCsv({ entries: [{ date: '2026-11-23', kind: 'purchase', mode: 'cash', amount: 11800, gstRate: 18 }] }).split('\r\n');
assert.ok(gstCsv[0].includes('"GST %"') && gstCsv[1].includes('"Purchase"') && gstCsv[1].includes('"100.00"') && gstCsv[1].includes('"18.00"'));

console.log('✓ Book printing: counter bill with discount and GST split, khata list, and a safe CSV export.');
