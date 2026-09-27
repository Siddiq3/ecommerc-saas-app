#!/usr/bin/env node
/**
 * Checks the help content in src/lib/help.js: every question id is unique, every screen's
 * "Need help?" list points at a real question, and every answer has steps and at most one
 * kind of action. Routes in `action.href` are checked by verify-routes.
 */
import assert from 'node:assert/strict';
import { HELP_CATEGORIES, HELP_CONTEXTS, helpQuestion } from '../src/lib/help.js';

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

console.log(`✓ ${questions.length} help questions in ${HELP_CATEGORIES.length} topics are well formed.`);
