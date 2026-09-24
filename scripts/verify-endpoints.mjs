#!/usr/bin/env node
/**
 * Checks every path in src/api/endpoints.js against the backend's real route table.
 *
 * A typo in a client path fails at runtime, on a device, usually in the one screen nobody
 * opened before release. Comparing the two lists catches it here instead — and catches a
 * backend route being renamed out from under the app, which is the harder direction to
 * notice.
 *
 * Run with `npm run verify:endpoints -w @storekit/mobile` (the API workspace must be
 * installed; it does not need to be running).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '..', '..');

/* ───────────── The backend's routes ───────────── */

const dump = execFileSync('npm', ['run', '--silent', 'routes', '-w', '@storekit/api'], {
  cwd: repoRoot,
  encoding: 'utf8',
});

const backend = new Set();
for (const line of dump.split('\n')) {
  const match = line.match(/^(GET|POST|PATCH|PUT|DELETE)\s+(\/\S*)$/);
  if (match) backend.add(`${match[1]} ${match[2]}`);
}

if (backend.size === 0) {
  console.error('Could not read the backend route table. Is @storekit/api installed?');
  process.exit(1);
}

/* ───────────── The app's calls ───────────── */

const source = readFileSync(join(root, 'src/api/endpoints.js'), 'utf8');

const METHODS = { get: 'GET', post: 'POST', patch: 'PATCH', del: 'DELETE' };

/**
 * Normalises a template literal into the backend's `:param` form: `${businessId}` and
 * every other interpolation becomes a parameter, and a trailing `${qs(...)}` is dropped.
 */
const normalise = (template) =>
  template
    // Greedy to the final `)}`, because a qs() argument contains braces of its own.
    .replace(/\$\{qs\([\s\S]*\)\}/g, '')
    .replace(/\$\{scope\([^}]*\)\}/g, '/businesses/:businessId')
    .replace(/\$\{[^}]+\}/g, ':param')
    .replace(/\/$/, '');

const calls = [];
const callPattern = /api\.(get|post|patch|del)\(\s*`([^`]+)`/g;
for (const match of source.matchAll(callPattern)) {
  calls.push({ method: METHODS[match[1]], path: normalise(match[2]) });
}
const literalPattern = /api\.(get|post|patch|del)\(\s*'([^']+)'/g;
for (const match of source.matchAll(literalPattern)) {
  calls.push({ method: METHODS[match[1]], path: normalise(match[2]) });
}

if (calls.length === 0) {
  console.error('No API calls found in endpoints.js — has the file moved?');
  process.exit(1);
}

/** The backend's parameter names differ from ours; compare shape, not spelling. */
const shapeOf = (route) => route.replace(/:[A-Za-z0-9_]+/g, ':param');
const backendShapes = new Set([...backend].map((route) => shapeOf(route)));

const missing = [];
for (const call of calls) {
  const candidate = shapeOf(`${call.method} /v1${call.path}`);
  if (!backendShapes.has(candidate)) missing.push(`${call.method} /v1${call.path}`);
}

const unique = [...new Set(missing)];

if (unique.length) {
  console.error(`\n✖ ${unique.length} call(s) in the app have no matching backend route:\n`);
  for (const route of unique) console.error(`  ${route}`);
  console.error('\nCompare against `npm run routes -w @storekit/api`.\n');
  process.exit(1);
}

console.log(`✓ All ${calls.length} app API calls match a real backend route (${backend.size} routes checked).`);
