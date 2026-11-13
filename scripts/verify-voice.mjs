#!/usr/bin/env node
/** Spoken numbers for price/stock fields: Indian-script digits and "Rs 1,499" become plain numbers. */
import assert from 'node:assert/strict';
import { spokenNumber, toAsciiDigits } from '../src/lib/voice.js';

assert.equal(spokenNumber('499'), '499');
assert.equal(spokenNumber('Rs. 1,499.50 only'), '1499.50');
assert.equal(spokenNumber('४९९ रुपये'), '499'); // Hindi
assert.equal(spokenNumber('৫০'), '50'); // Bengali
assert.equal(spokenNumber('௧௨'), '12'); // Tamil
assert.equal(spokenNumber('price is'), '');
assert.equal(toAsciiDigits('೨೦ ಪೀಸ್'), '20 ಪೀಸ್'); // Kannada, words untouched
console.log('✓ Voice typing: spoken numbers in every Indian script become plain digits.');

// Whole-product dictation.
import { parseProductSpeech as parse } from '../src/lib/voice.js';
assert.deepEqual(parse('red cotton kurti 499 rupees 20 pieces'), { name: 'Red cotton kurti', price: '499', stock: '20' });
assert.deepEqual(parse('Red cotton kurti, price 499, MRP 799, stock 20'), { name: 'Red cotton kurti', price: '499', mrp: '799', stock: '20' });
assert.deepEqual(parse('Samsung charger for ₹350'), { name: 'Samsung charger', price: '350' });
assert.deepEqual(parse('Kurti 499 20'), { name: 'Kurti', price: '499', stock: '20' });
assert.deepEqual(parse('20 pieces of steel tiffin box at 1,299 rupees'), { name: 'Steel tiffin box', price: '1299', stock: '20' });
assert.deepEqual(parse('लाल कॉटन कुर्ती ४९९ रुपये २० पीस'), { name: 'लाल कॉटन कुर्ती', price: '499', stock: '20' });
assert.deepEqual(parse('காட்டன் சேலை 899 ரூபாய் 5 பீஸ்'), { name: 'காட்டன் சேலை', price: '899', stock: '5' });
assert.deepEqual(parse('mango pickle 250rs'), { name: 'Mango pickle', price: '250' });
assert.deepEqual(parse('hello'), { name: 'Hello' });
console.log('✓ Voice typing: a spoken product fills name, price, MRP and stock in English, Hindi and Tamil.');
assert.deepEqual(parse('Redmi Note 13 phone 12999 rupees'), { name: 'Redmi Note 13 phone', price: '12999' });
assert.deepEqual(parse('back cover for iPhone 15 at 299'), { name: 'Back cover for iPhone 15', price: '299' });
console.log('✓ Voice typing: model numbers stay in the name.');

// Website text spoken in an Indian language is stored in English letters.
import { toLatinTitle } from '../src/lib/transliterate.js';
const latin = {
  'ఎరుపు కాటన్ కుర్తీ': 'Erupu Kaatan Kurtee', // Telugu
  'బంగారు గాజులు': 'Bangaaru Gaajulu',
  'लाल कॉटन कुर्ती': 'Laal Kotan Kurtee', // Hindi: final "a" dropped
  'साड़ी': 'Saaree',
  'संबंध': 'Sambandh',
  'காட்டன் சேலை': 'Kaattan Selai', // Tamil
  'ಕೆಂಪು ಕುರ್ತಿ': 'Kempu Kurti', // Kannada
  'ചുവന്ന കോട്ടൺ കുർത്തി': 'Chuvanna Kottan Kurtti', // Malayalam
  'লাল শাড়ি': 'Laal Shaari', // Bengali
  'લાલ કુર્તી': 'Laal Kurtee', // Gujarati
  'Red kurti ५००': 'Red Kurti 500',
  'Red cotton kurti': 'Red cotton kurti', // English is left exactly as said
};
for (const [said, want] of Object.entries(latin)) assert.equal(toLatinTitle(said), want, said);
console.log('✓ Voice typing: website text in 8 Indian scripts is stored in English letters.');

// End to end: a seller speaks Telugu on the product screen.
const telugu = parse('ఎరుపు కాటన్ కుర్తీ 499 రూపాయలు 20 పీసులు');
assert.deepEqual({ ...telugu, name: toLatinTitle(telugu.name) }, { name: 'Erupu Kaatan Kurtee', price: '499', stock: '20' });
console.log('✓ Voice typing: "ఎరుపు కాటన్ కుర్తీ 499 రూపాయలు 20 పీసులు" saves as Erupu Kaatan Kurtee, ₹499, 20 in stock.');
