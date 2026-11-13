/**
 * Indian scripts → English letters, so website text the seller speaks in Telugu, Hindi, Tamil…
 * is stored readable for every customer: "ఎరుపు కాటన్ కుర్తీ" → "Erupu Kaatan Kurtee".
 *
 * This is spelling, not translation (free, offline, no library). Unicode lays out Devanagari,
 * Bengali, Gurmukhi, Gujarati, Oriya, Tamil, Telugu, Kannada and Malayalam in parallel blocks
 * (క, क, க and ಕ share one offset), so one table keyed by that offset covers them all.
 * ponytail: plain phonetic rules; spellings are readable, not dictionary-perfect, and stay editable.
 */

const BLOCKS = [
  [0x0900, 'deva'], [0x0980, 'beng'], [0x0a00, 'guru'], [0x0a80, 'gujr'],
  [0x0b00, 'orya'], [0x0b80, 'taml'], [0x0c00, 'telu'], [0x0c80, 'knda'], [0x0d00, 'mlym'],
];
// North Indian scripts drop the final "a" ("लाल" → "laal"); Dravidian ones keep it ("ధర" → "dhara").
const DROPS_FINAL_A = new Set(['deva', 'beng', 'guru', 'gujr', 'orya']);

const VOWELS = {
  0x05: 'a', 0x06: 'aa', 0x07: 'i', 0x08: 'ee', 0x09: 'u', 0x0a: 'oo', 0x0b: 'ri', 0x0c: 'li',
  0x0d: 'e', 0x0e: 'e', 0x0f: 'e', 0x10: 'ai', 0x11: 'o', 0x12: 'o', 0x13: 'o', 0x14: 'au',
};
const SIGNS = { // vowel signs after a consonant
  0x3e: 'aa', 0x3f: 'i', 0x40: 'ee', 0x41: 'u', 0x42: 'oo', 0x43: 'ri', 0x44: 'ri',
  0x45: 'e', 0x46: 'e', 0x47: 'e', 0x48: 'ai', 0x49: 'o', 0x4a: 'o', 0x4b: 'o', 0x4c: 'au',
};
const CONSONANTS = {
  0x15: 'k', 0x16: 'kh', 0x17: 'g', 0x18: 'gh', 0x19: 'ng', 0x1a: 'ch', 0x1b: 'chh', 0x1c: 'j', 0x1d: 'jh', 0x1e: 'ny',
  0x1f: 't', 0x20: 'th', 0x21: 'd', 0x22: 'dh', 0x23: 'n', 0x24: 't', 0x25: 'th', 0x26: 'd', 0x27: 'dh', 0x28: 'n',
  0x29: 'n', 0x2a: 'p', 0x2b: 'ph', 0x2c: 'b', 0x2d: 'bh', 0x2e: 'm', 0x2f: 'y', 0x30: 'r', 0x31: 'r', 0x32: 'l',
  0x33: 'l', 0x34: 'zh', 0x35: 'v', 0x36: 'sh', 0x37: 'sh', 0x38: 's', 0x39: 'h',
  0x58: 'q', 0x59: 'kh', 0x5a: 'gh', 0x5b: 'z', 0x5c: 'r', 0x5d: 'rh', 0x5e: 'f', 0x5f: 'y',
};
const PER_SCRIPT = { taml: { 0x1a: 's' }, beng: { 0x4e: 't' } }; // Tamil ச is "s"; Bengali ৎ is a final "t"
const CHILLU = { 0x0d7a: 'n', 0x0d7b: 'n', 0x0d7c: 'r', 0x0d7d: 'l', 0x0d7e: 'l', 0x0d7f: 'k' }; // Malayalam
const VIRAMA = 0x4d;
const NUKTA = 0x3c;
const NASAL = [0x01, 0x02];
const VISARGA = 0x03;
const LABIALS = [0x2a, 0x2b, 0x2c, 0x2d, 0x2e];

const scriptOf = (code) => {
  for (let i = BLOCKS.length - 1; i >= 0; i -= 1) {
    const [base, name] = BLOCKS[i];
    if (code >= base && code < base + 0x80) return [name, code - base];
  }
  return [null, -1];
};

/** One word or sentence; anything that is not an Indian script passes through untouched. */
export const toLatin = (text) => {
  let out = '';
  let pendingA = false; // a consonant waiting to see whether a vowel sign follows
  let script = null;
  let consonantsInWord = 0;

  const endWord = () => {
    if (pendingA && !(DROPS_FINAL_A.has(script) && consonantsInWord > 1)) out += 'a';
    pendingA = false;
    consonantsInWord = 0;
  };

  const chars = [...String(text ?? '')];
  chars.forEach((ch, i) => {
    const code = ch.codePointAt(0);
    if (CHILLU[code]) { if (pendingA) out += 'a'; pendingA = false; out += CHILLU[code]; return; }
    const [name, off] = scriptOf(code);
    if (!name) { endWord(); out += ch; return; }
    script = name;

    const consonant = PER_SCRIPT[name]?.[off] ?? CONSONANTS[off];
    if (consonant && off !== 0x4e) {
      if (pendingA) out += 'a';
      out += consonant;
      pendingA = true;
      consonantsInWord += 1;
    } else if (SIGNS[off]) {
      out += SIGNS[off];
      pendingA = false;
    } else if (off === VIRAMA) {
      pendingA = false;
    } else if (VOWELS[off]) {
      if (pendingA) out += 'a';
      out += VOWELS[off];
      pendingA = false;
    } else if (NASAL.includes(off)) {
      if (pendingA) out += 'a';
      pendingA = false;
      const [, nextOff] = scriptOf(chars[i + 1]?.codePointAt(0) ?? 0);
      out += LABIALS.includes(nextOff) ? 'm' : 'n';
    } else if (off === VISARGA) {
      if (pendingA) out += 'a';
      pendingA = false;
      out += 'h';
    } else if (off >= 0x66 && off <= 0x6f) {
      endWord();
      out += String(off - 0x66);
    } else if (PER_SCRIPT[name]?.[off]) {
      if (pendingA) out += 'a';
      out += PER_SCRIPT[name][off];
      pendingA = false;
    } else if (off === NUKTA && /d$/.test(out)) {
      out = out.replace(/d(h?)$/, 'r$1'); // ड़ / ढ़ (dot below) are r / rh: "साड़ी" → "saaree"
    } // other nukta, length marks, avagraha: silent
  });
  endWord();
  return out;
};

/** For names and titles: each word capitalised ("Erupu Kaatan Kurtee"). Untouched when nothing changed. */
export const toLatinTitle = (text) => {
  const latin = toLatin(text);
  return latin === text ? text : latin.replace(/(^|\s)([a-z])/g, (m, space, c) => space + c.toUpperCase());
};

/** For sentences: only the first letter capitalised. */
export const toLatinSentence = (text) => {
  const latin = toLatin(text);
  return latin === text ? text : latin.replace(/^([a-z])/, (c) => c.toUpperCase());
};
