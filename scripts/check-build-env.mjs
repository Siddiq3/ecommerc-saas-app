#!/usr/bin/env node
/**
 * Fails an EAS build whose public settings would ship a broken app.
 *
 * `EXPO_PUBLIC_*` values are compiled into the bundle, so a missing one is not an error at runtime: the
 * client quietly falls back to `http://localhost:3001`, and a release build that can reach nothing is
 * found by a customer. This runs on the build worker (`eas-build-pre-install`) for the preview and
 * production profiles and stops the build instead.
 *
 * Nothing secret belongs in these variables — they can be read by unzipping the app.
 */
const profile = process.env.EAS_BUILD_PROFILE;
if (!profile || profile === 'development') process.exit(0);

const problems = [];
const need = (name) => {
  const value = process.env[name];
  if (!value) problems.push(`${name} is not set`);
  return value ?? '';
};

const httpsUrl = (name, value) => {
  if (!value) return;
  let url;
  try { url = new URL(value); } catch { problems.push(`${name} is not a URL: ${value}`); return; }
  if (url.protocol !== 'https:') problems.push(`${name} must be https (Android blocks cleartext traffic in release builds): ${value}`);
  if (/^(localhost|127\.|10\.|192\.168\.|.*\.local$)/i.test(url.hostname)) problems.push(`${name} points at a local address: ${value}`);
  if (/replace|placeholder|example/i.test(value)) problems.push(`${name} still holds a placeholder: ${value}`);
  if (url.username || url.password) problems.push(`${name} must not carry credentials`);
  if (name === 'EXPO_PUBLIC_API_URL' && /\/v1\/?$/.test(url.pathname)) problems.push(`${name} must be the host, without /v1 (the app adds it): ${value}`);
};

httpsUrl('EXPO_PUBLIC_API_URL', need('EXPO_PUBLIC_API_URL'));
httpsUrl('EXPO_PUBLIC_STOREFRONT_URL', need('EXPO_PUBLIC_STOREFRONT_URL'));
need('EXPO_PUBLIC_STOREFRONT_HOST');

for (const name of Object.keys(process.env)) {
  if (name.startsWith('EXPO_PUBLIC_') && /(SECRET|TOKEN|PASSWORD|PRIVATE|API_KEY)/i.test(name)) {
    problems.push(`${name} looks like a secret; EXPO_PUBLIC_ values are readable from the app bundle`);
  }
}

if (problems.length) {
  console.error(`Build environment is not fit for a ${profile} build:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`Build environment OK for ${profile}.`);
