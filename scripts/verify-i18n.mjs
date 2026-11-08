import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STRINGS, ORDER } from '../src/lib/strings.js';
import { LANGUAGES, pickLocale, setActiveLocale, translate } from '../src/lib/i18n.js';
import { shortAgo } from '../src/lib/format.js';
import {
  CANCELLATION_REASON_LABELS, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS,
} from '@storekit/shared';

// Every language in the picker has a column, and every row fills every column.
assert.deepEqual(LANGUAGES.map((l) => l.code).filter((c) => c !== 'en'), ORDER);
const vars = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join();
for (const [en, row] of Object.entries(STRINGS)) {
  assert.equal(row.length, ORDER.length, `"${en}" needs ${ORDER.length} translations`);
  row.forEach((tr, i) => {
    assert.ok(tr?.trim(), `"${en}" is empty in ${ORDER[i]}`);
    assert.equal(vars(tr), vars(en), `"${en}" in ${ORDER[i]} must keep its {placeholders}`);
  });
}

// Every string literal handed to t(), tr() or msg() has a row (a typo would silently show English).
// Reads each call's own arguments, so `t(n === 1 ? '{n} item' : '{n} items', …)` counts both.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d) => readdirSync(d).flatMap((e) => (statSync(join(d, e)).isDirectory() ? walk(join(d, e)) : [join(d, e)]));
const literalsIn = (src) => {
  const out = [];
  for (const m of src.matchAll(/\b(?:t|tr|msg)\(/g)) {
    let parens = 1; let braces = 0;
    for (let i = m.index + m[0].length; i < src.length && parens > 0; i += 1) {
      const c = src[i];
      if (c === "'" || c === '"') {
        let j = i + 1; let text = '';
        while (j < src.length && src[j] !== c) { if (src[j] === '\\') { text += src[j + 1]; j += 2; } else text += src[j++]; }
        if (parens === 1 && braces === 0) out.push(text);
        i = j;
      } else if (c === '`') { i = src.indexOf('`', i + 1); }
      else if (c === '(') parens += 1; else if (c === ')') parens -= 1;
      else if (c === '{') braces += 1; else if (c === '}') braces -= 1;
    }
  }
  return out;
};
const missing = new Set();
const files = [...walk(join(root, 'app')), ...walk(join(root, 'src'))].filter((f) => /\.jsx?$/.test(f) && !/strings|i18n\.js$/.test(f));
for (const f of files) for (const text of literalsIn(readFileSync(f, 'utf8'))) if (!STRINGS[text]) missing.add(text);
// Labels shown through t() that live in the shared package, and component default props.
for (const map of [ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_METHOD_LABELS, CANCELLATION_REASON_LABELS]) {
  for (const text of Object.values(map)) if (!STRINGS[text]) missing.add(text);
}
for (const text of ['Search', 'Select']) if (!STRINGS[text]) missing.add(text);
if (missing.size) console.error([...missing].map((m) => JSON.stringify(m)).join('\n'));
assert.equal(missing.size, 0, `${missing.size} strings have no translation (listed above)`);

assert.equal(pickLocale('hi-IN'), 'hi');
assert.equal(pickLocale('fr-FR'), 'en');
assert.equal(translate('ta', 'Delete {name}?', { name: 'Asha' }), 'Asha ஐ நீக்கவா?');
assert.equal(translate('hi', 'Not a known string'), 'Not a known string');
// Formatters outside components follow the active language.
setActiveLocale('hi');
assert.equal(shortAgo(new Date(Date.now() - 5 * 60_000).toISOString()), '5 मिनट पहले');
setActiveLocale('en');
assert.equal(shortAgo(new Date(Date.now() - 5 * 60_000).toISOString()), '5 min ago');
console.log(`✓ i18n: ${Object.keys(STRINGS).length} strings in ${ORDER.length + 1} languages, none missing.`);
