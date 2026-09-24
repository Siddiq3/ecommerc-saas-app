#!/usr/bin/env node
/**
 * Checks that every `router.push`/`replace` target in the app resolves to a real route
 * file.
 *
 * Expo Router matches routes by file path, so a typo does not fail to compile — it
 * navigates to a screen that does not exist and leaves the user staring at nothing. This
 * is the cheapest possible catch for that.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(root, 'app');

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(js|jsx)$/.test(entry)) out.push(full);
  }
  return out;
};

/** Turns `app/(tabs)/orders.jsx` into the route pattern `/(tabs)/orders`. */
const routeOf = (file) =>
  `/${relative(appDir, file).replace(/\.(js|jsx)$/, '').replace(/\/index$/, '').replace(/^index$/, '')}`
    .replace(/\/$/, '') || '/';

const routes = walk(appDir).filter((f) => !/_layout\.(js|jsx)$/.test(f)).map(routeOf);

/**
 * Builds a matcher for a route.
 *
 * Group segments contain literal parentheses and dynamic segments contain literal square
 * brackets, both of which are regex metacharacters — so everything is escaped first, and
 * only then are the escaped `\[param\]` placeholders turned back into wildcards.
 */
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matcherFor = (route) => new RegExp(`^${escape(route).replace(/\\\[[^\]]+\\\]/g, '[^/]+')}$`);

const isGroup = (segment) => /^\(.+\)$/.test(segment);

/** A push may omit the group segment: `/orders/1` reaches `/(tabs)/orders` too. */
const withoutGroups = (route) => `/${route.split('/').filter((s) => s && !isGroup(s)).join('/')}`;

const allForms = new Set();
for (const route of routes) {
  allForms.add(route);
  allForms.add(withoutGroups(route));
}
const allPatterns = [...allForms].map((route) => ({ route, regex: matcherFor(route) }));

const targets = [];
for (const file of walk(join(root, 'app')).concat(walk(join(root, 'src')))) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/router\.(push|replace)\(\s*['"`]([^'"`]+)['"`]/g)) {
    targets.push({ file: relative(root, file), target: match[2] });
  }
  for (const match of source.matchAll(/router\.(push|replace)\(\s*\{\s*pathname:\s*['"`]([^'"`]+)['"`]/g)) {
    targets.push({ file: relative(root, file), target: match[2] });
  }
  // `href: '/(tabs)/orders?status=NEW'` in a data array.
  for (const match of source.matchAll(/href:\s*['"`](\/[^'"`]*)['"`]/g)) {
    targets.push({ file: relative(root, file), target: match[1] });
  }
}

const broken = [];
for (const { file, target } of targets) {
  // Strip the query string and any template interpolation before matching.
  const path = target.split('?')[0].replace(/\$\{[^}]+\}/g, 'x');
  if (!allPatterns.some(({ regex }) => regex.test(path))) broken.push(`${file}  →  ${target}`);
}

if (broken.length) {
  console.error(`\n✖ ${broken.length} navigation target(s) do not resolve to a route file:\n`);
  for (const line of [...new Set(broken)]) console.error(`  ${line}`);
  console.error(`\nRoutes found:\n${routes.map((r) => `  ${r}`).join('\n')}\n`);
  process.exit(1);
}

console.log(`✓ All ${targets.length} navigation targets resolve (${routes.length} routes).`);
