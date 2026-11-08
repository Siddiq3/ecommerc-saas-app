import { STRINGS, ORDER } from './strings.js';

/**
 * App languages. English is the source text: every t() key is the English string itself,
 * so an untranslated string shows in English instead of a key name.
 *
 * Adding a language: add its code here and to ORDER in strings.js, then one entry per string.
 */
export const LANGUAGES = [
  { code: 'en', name: 'English', english: 'English' },
  { code: 'hi', name: 'हिन्दी', english: 'Hindi' },
  { code: 'ta', name: 'தமிழ்', english: 'Tamil' },
  { code: 'te', name: 'తెలుగు', english: 'Telugu' },
  { code: 'kn', name: 'ಕನ್ನಡ', english: 'Kannada' },
  { code: 'ml', name: 'മലയാളം', english: 'Malayalam' },
  { code: 'mr', name: 'मराठी', english: 'Marathi' },
  { code: 'bn', name: 'বাংলা', english: 'Bengali' },
  { code: 'gu', name: 'ગુજરાતી', english: 'Gujarati' },
];

const CODES = new Set(LANGUAGES.map((l) => l.code));

/** `hi-IN` → `hi`; anything unsupported → English. */
export const pickLocale = (tag) => {
  const code = String(tag ?? '').toLowerCase().split(/[-_]/)[0];
  return CODES.has(code) ? code : 'en';
};

export const deviceLocale = () => {
  try {
    return pickLocale(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return 'en';
  }
};

/** `translate('hi', 'Delete {name}?', { name: 'Asha' })` → `Asha हटाएँ?` */
export const translate = (locale, text, vars) => {
  const index = ORDER.indexOf(locale);
  const out = (index >= 0 && STRINGS[text]?.[index]) || text;
  return vars ? out.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? String(vars[key]) : m)) : out;
};

/**
 * The language in use right now, for code outside components (formatters, helpers).
 * Set by LocaleProvider before its children render; components still re-render through useT().
 */
let active = 'en';
export const setActiveLocale = (code) => { active = pickLocale(code); };
export const tr = (text, vars) => translate(active, text, vars);
/** For Intl formatters: dates read as "8 नव॰ 2026" in Hindi. Money stays en-IN on purpose. */
export const intlLocale = () => `${active}-IN`;

/** Marks English text defined outside a component, translated later with t(). verify-i18n checks it. */
export const msg = (text) => text;
