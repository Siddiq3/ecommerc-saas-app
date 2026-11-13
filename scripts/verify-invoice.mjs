#!/usr/bin/env node
/** The bill PDF layout: amounts in words, GST columns only on GST bills, and seller text escaped. */
import assert from 'node:assert/strict';
import { invoiceHtml, rupeesInWords } from '../src/lib/invoiceHtml.js';

assert.equal(rupeesInWords(205520), 'Two Thousand Fifty Five Rupees and Twenty Paise Only');
assert.equal(rupeesInWords(12345600), 'One Lakh Twenty Three Thousand Four Hundred Fifty Six Rupees Only');
assert.equal(rupeesInWords(1000000000), 'One Crore Rupees Only');

const base = {
  number: 'INV/26-27/0001', date: '2026-11-13T05:00:00Z', orderNumber: 'SK-1001', paymentMethod: 'COD',
  seller: { name: 'Asha <Kurtis>', gstin: '36ABCDE1234F1Z5', address: 'Hyderabad', phone: '9876500001' },
  buyer: { name: 'Ravi', mobile: '9876512345', address: 'Bengaluru' }, placeOfSupply: 'Karnataka',
  lines: [{ name: 'Kurti', quantity: 1, unitPrice: 59900, amount: 59900, taxable: 57048, rate: 5, cgst: 0, sgst: 0, igst: 2852, discount: 0, hsn: '6211' }],
  totals: { taxable: 57048, cgst: 0, sgst: 0, igst: 2852, discount: 0, total: 59900 },
};
const gst = invoiceHtml({ ...base, kind: 'TAX_INVOICE', interState: true });
assert.ok(gst.includes('TAX INVOICE') && gst.includes('IGST') && !gst.includes('CGST') && gst.includes('Place of supply'));
assert.ok(gst.includes('Asha &lt;Kurtis&gt;') && !gst.includes('<Kurtis>'), 'seller text is escaped');
const plain = invoiceHtml({ ...base, kind: 'INVOICE', interState: false, seller: { ...base.seller, gstin: null } });
assert.ok(plain.includes('>INVOICE<') && !plain.includes('GSTIN') && !plain.includes('HSN'));
console.log('✓ Bills: amounts in words, GST columns only on GST bills, seller text escaped.');

// WhatsApp messages: one customer, one chat, typed in for the seller to send.
import { codConfirmMessage, orderUpdateMessage, waLink } from '../src/lib/whatsapp.js';
const o = { orderNumber: 'SK-7', status: 'SHIPPED', paymentMethod: 'COD', courierName: 'Delhivery', trackingReference: 'AWB123',
  customer: { name: 'Asha', mobile: '98765 12345' }, items: [{ quantity: 2, name: 'Kurti' }], totals: { total: 119800 } };
assert.equal(waLink('12345', 'hi'), null, 'a short number opens nothing');
assert.ok(waLink('+91 98765 12345', 'hi').startsWith('https://wa.me/919876512345?text='));
assert.ok(codConfirmMessage(o, 'Asha Kurtis').includes('reply *YES*') && codConfirmMessage(o, 'Asha Kurtis').includes('₹1,198'));
const shipped = orderUpdateMessage(o, 'Asha Kurtis', 'https://asha.storekit.site/track');
assert.ok(shipped.includes('shipped') && shipped.includes('AWB123') && shipped.includes('/track'));
console.log('✓ WhatsApp: valid numbers only; COD asks for YES with the total; shipped update carries courier and tracking.');
