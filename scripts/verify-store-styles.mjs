#!/usr/bin/env node
/**
 * Checks that every store style offered during setup is something the API will accept.
 *
 * The style is saved on the last step of onboarding, after the store has already been
 * created — so a typo in a colour or a value outside one of the theme enums does not fail
 * in review, it fails on a real merchant's phone at the celebration, with a half-configured
 * store behind it. The schema is the API's own, so this cannot drift from what the server
 * enforces.
 */
import { themeSchema } from '@storekit/validation';
import { STORE_STYLES, styleById } from '../src/lib/storeStyles.js';

const problems = [];

if (STORE_STYLES.length === 0) problems.push('No store styles are offered.');

const seen = new Set();
for (const style of STORE_STYLES) {
  const where = style.id ?? '(no id)';
  if (!style.id || !style.label || !style.blurb) problems.push(`${where}: needs an id, a label and a blurb.`);
  if (seen.has(style.id)) problems.push(`${where}: duplicate id.`);
  seen.add(style.id);

  const parsed = themeSchema.safeParse(style.theme);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      problems.push(`${where}: theme.${issue.path.join('.')} — ${issue.message}`);
    }
  }

  // The card, the live preview and the storefront all colour themselves from primaryColor.
  if (style.theme?.primaryColor !== style.theme?.buttonColor) {
    problems.push(`${where}: buttonColor should match primaryColor, or the preview lies about the buttons.`);
  }
  if (styleById(style.id) !== style) problems.push(`${where}: styleById does not find it.`);
}

// The draft opens on this one before the merchant has chosen anything.
if (!styleById('modern')) problems.push("The default style 'modern' is missing.");

if (problems.length) {
  console.error('Store styles that the API would reject:\n');
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}

console.log(`✓ All ${STORE_STYLES.length} store styles are valid themes.`);
