/** Pure helpers for voice typing (see components/VoiceButton.jsx); checked by scripts/verify-voice.mjs. */

// Devanagari, Bengali, Gujarati, Tamil, Telugu, Kannada, Malayalam digit zeros.
const DIGIT_ZEROS = [0x0966, 0x09e6, 0x0ae6, 0x0be6, 0x0c66, 0x0ce6, 0x0d66];
export const toAsciiDigits = (text) =>
  String(text).replace(/[०-९০-৯૦-૯௦-௯౦-౯೦-೯൦-൯]/g, (ch) => {
    const code = ch.charCodeAt(0);
    const zero = DIGIT_ZEROS.find((z) => code >= z && code <= z + 9);
    return String(code - zero);
  });

/** "Rs. 1,499.50" → "1499.50"; anything without a number → "". */
export const spokenNumber = (text) => {
  const match = toAsciiDigits(text).replace(/,/g, '').match(/\d+(\.\d+)?/);
  return match ? match[0] : '';
};

/*
 * Whole-product dictation, on the phone and free: "Red cotton kurti, 499 rupees, MRP 799,
 * 20 pieces" → { name, price, mrp, stock }. Plain word rules in the app's languages, no AI.
 * ponytail: keyword lists, not NLP; odd phrasings fall back to "first number is the price,
 * next is the stock", and every field stays editable. Add words here when sellers say them.
 */
const PRICE_AFTER = ['rupees', 'rupee', 'rs', 'rs.', '₹', 'inr', 'रुपये', 'रुपए', 'रुपया', 'रु', 'ரூபாய்', 'ரூ', 'రూపాయలు', 'రూపాయి', 'ರೂಪಾಯಿ', 'ರೂ', 'രൂപ', 'টাকা', 'রুপি', 'રૂપિયા'];
const PRICE_BEFORE = ['price', 'priced', 'cost', 'costs', 'rate', 'कीमत', 'दाम', 'रेट', 'விலை', 'ధర', 'ಬೆಲೆ', 'വില', 'किंमत', 'দাম', 'કિંમત'];
const MRP_WORDS = ['mrp', 'एमआरपी', 'எம்ஆர்பி', 'ఎంఆర్పీ', 'ಎಂಆರ್‌ಪಿ', 'എംആർപി', 'এমআরপি', 'એમઆરપી'];
const STOCK_AFTER = ['pieces', 'piece', 'pcs', 'pc', 'units', 'unit', 'items', 'item', 'nos', 'पीस', 'नग', 'पीसेज', 'துண்டுகள்', 'பீஸ்', 'ముక్కలు', 'పీసులు', 'ಪೀಸ್', 'ತುಂಡು', 'പീസ്', 'എണ്ണം', 'পিস', 'টি', 'પીસ', 'નંગ'];
const STOCK_BEFORE = ['stock', 'quantity', 'qty', 'स्टॉक', 'மொத்தம்', 'స్టాక్', 'ಸ್ಟಾಕ್', 'സ്റ്റോക്ക്', 'স্টক', 'સ્ટોક'];
// Only count right before a number: "cover for iPhone 15 at 299" is not priced at 15.
const WEAK_BEFORE = ['for', 'at', '₹', 'rs', 'rs.'];
const FILLER = ['and', 'with', 'of', 'is', 'the', 'for', 'at', 'और', 'का', 'की', 'है'];
const STRONG = new Set([...PRICE_AFTER, ...PRICE_BEFORE, ...MRP_WORDS, ...STOCK_AFTER, ...STOCK_BEFORE].filter((w) => !WEAK_BEFORE.includes(w)));
const KEYWORDS = new Set([...STRONG, ...WEAK_BEFORE]);
const isNumber = (tok) => /^\d+(\.\d+)?$/.test(tok);

export const parseProductSpeech = (said) => {
  const tokens = toAsciiDigits(said)
    .replace(/(\d),(?=\d{2,3}\b)/g, '$1') // 1,499 → 1499
    .replace(/(\d)([^\d\s.,])/g, '$1 $2') // 499rs → 499 rs
    .replace(/([^\d\s.])(\d)/g, '$1 $2') // ₹499 → ₹ 499
    .split(/[\s,;:]+/)
    .map((tok) => tok.replace(/^[^\p{L}\p{M}\p{N}₹]+|[^\p{L}\p{M}\p{N}₹.]+$/gu, '').replace(/\.$/, ''))
    .filter(Boolean);
  const low = tokens.map((tok) => tok.toLowerCase());

  const out = {};
  const loose = [];
  const tagged = new Set();
  const whole = (tok) => String(Math.trunc(Number(tok)));
  low.forEach((tok, i) => {
    if (!isNumber(tok)) return;
    const before = low.slice(Math.max(0, i - 2), i);
    const prev = low[i - 1];
    const after = low[i + 1];
    if (before.some((w) => MRP_WORDS.includes(w)) && !out.mrp) out.mrp = tok;
    else if ((STOCK_AFTER.includes(after) || before.some((w) => STOCK_BEFORE.includes(w))) && !out.stock) out.stock = whole(tok);
    else if ((PRICE_AFTER.includes(after) || before.some((w) => PRICE_BEFORE.includes(w)) || WEAK_BEFORE.includes(prev)) && !out.price) out.price = tok;
    else { loose.push(i); return; }
    tagged.add(i);
  });
  // With a clearly tagged number, numbers before it belong to the name ("Redmi Note 13 … 12999 rupees").
  const firstTag = tagged.size ? Math.min(...tagged) : -1;
  const inName = (i) => firstTag !== -1 && i < firstTag;
  const spare = loose.filter((i) => !inName(i)).map((i) => low[i]);
  if (!out.price && spare.length) out.price = spare.shift();
  if (!out.stock && spare.length) out.stock = whole(spare.shift());

  const stops = (tok, i) => STRONG.has(tok) || tagged.has(i) || (isNumber(tok) && !inName(i))
    || (WEAK_BEFORE.includes(tok) && tagged.has(i + 1)) || (WEAK_BEFORE.includes(tok) && tagged.has(i + 2) && WEAK_BEFORE.includes(low[i + 1]));
  const firstStop = low.findIndex(stops);
  const keep = (tok, i) => !STRONG.has(low[i]) && (!isNumber(low[i]) || inName(i));
  let words = (firstStop === -1 ? tokens : tokens.slice(0, firstStop)).filter(keep);
  if (!words.length) words = tokens.filter((tok, i) => !isNumber(low[i]) && !KEYWORDS.has(low[i]));
  while (words.length && FILLER.includes(words[words.length - 1].toLowerCase())) words.pop();
  while (words.length && FILLER.includes(words[0].toLowerCase())) words.shift();
  if (words.length) out.name = words.join(' ').replace(/^\p{Ll}/u, (c) => c.toUpperCase());
  return out;
};
