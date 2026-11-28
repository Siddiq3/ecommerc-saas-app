#!/usr/bin/env node
/**
 * Checks the help content in src/lib/help.js: every question id is unique, every screen's
 * "Need help?" list points at a real question, and every answer has steps and at most one
 * kind of action. Routes in `action.href` are checked by verify-routes.
 */
import assert from 'node:assert/strict';
import { HELP_CATEGORIES, HELP_CONTEXTS, helpQuestion, helpTexts, helpTopics } from '../src/lib/help.js';
import { STRINGS, ORDER } from '../src/lib/strings.js';

const questions = HELP_CATEGORIES.flatMap((c) => c.questions);
const ids = questions.map((q) => q.id);
assert.equal(new Set(ids).size, ids.length, 'question ids are unique');

for (const q of questions) {
  assert.ok(q.question && q.steps?.length, `${q.id} has a question and steps`);
  if (q.action) assert.ok(q.action.label && Boolean(q.action.href) !== Boolean(q.action.url), `${q.id} action has a label and one target`);
  for (const text of [...q.steps, q.note ?? '']) assert.equal(text.split('**').length % 2, 1, `${q.id} bold markers are paired`);
}

for (const [screen, list] of Object.entries(HELP_CONTEXTS)) {
  for (const id of list) assert.ok(helpQuestion(id), `${screen} → ${id} exists`);
}

// Every help text is translated, and each translation keeps the same **bold** labels in English: the help screen
// translates those on their own, so they read exactly like the buttons. Each bold label needs its own row too.
const bold = (text) => text.split('**').filter((_, i) => i % 2).sort().join('|');
const missing = [];
for (const text of new Set(helpTexts())) {
  const row = STRINGS[text];
  if (!row) { missing.push(text); continue; }
  row.forEach((tr, i) => assert.equal(bold(tr), bold(text), `"${text}" in ${ORDER[i]} must keep its bold labels`));
  for (const label of text.split('**').filter((_, i) => i % 2)) if (!STRINGS[label]) missing.push(label);
}
if (missing.length) console.error([...new Set(missing)].map((m) => JSON.stringify(m)).join('\n'));
assert.equal(missing.length, 0, `${new Set(missing).size} help texts have no translation (listed above)`);

// A shop using only the bill book and khata sees no online-store topics.
assert.ok(helpTopics(true).every((c) => !c.store) && helpTopics(true).some((c) => c.id === 'khata'));
assert.equal(helpTopics(false).length, HELP_CATEGORIES.length);

console.log(`✓ ${questions.length} help questions in ${HELP_CATEGORIES.length} topics are well formed and translated.`);
