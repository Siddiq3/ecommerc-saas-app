#!/usr/bin/env node
/** Checks src/lib/states.js: every state saves under the API's own rule, and search finds them. */
import assert from 'node:assert/strict';
import { placeName } from '@storekit/validation';
import { INDIAN_STATES, canonicalState, matchStates } from '../src/lib/states.js';

assert.equal(INDIAN_STATES.length, 36, '28 states and 8 union territories');
assert.equal(new Set(INDIAN_STATES).size, 36, 'no state listed twice');
for (const state of INDIAN_STATES) assert.equal(placeName.safeParse(state).success, true, `"${state}" must save as a place name`);

assert.deepEqual(matchStates('  tamil '), ['Tamil Nadu']);
assert.deepEqual(matchStates('pradesh').length, 5);
assert.equal(matchStates('').length, 36, 'no search: the whole list');
assert.deepEqual(matchStates('xyz'), []);
assert.equal(canonicalState(' telangana '), 'Telangana', 'an old typed value is recognised');
assert.equal(canonicalState('ap'), null, 'an abbreviation is not guessed at');

console.log('✓ States: all 36 save as place names, and search and matching behave.');
