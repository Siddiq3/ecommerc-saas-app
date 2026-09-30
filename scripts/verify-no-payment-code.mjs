#!/usr/bin/env node
/**
 * Fails the build if payment code has crept into the Expo app.
 *
 * The app ships on Google Play, where taking a payment inside the binary for a digital
 * subscription breaches the payments policy. The app is consumption-only: it reads an
 * entitlement and shows it, and never sells, prices or links to a purchase — plans and
 * checkout live only on the website. That is a promise about the whole source tree, so it
 * is checked mechanically rather than by memory.
 *
 * Run with `npm run verify:compliance -w @storekit/mobile`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['app', 'src'];

/** Each rule is a thing that must not appear in application source. */
const RULES = [
  { id: 'payment-sdk', pattern: /\bcashfree\b|\brazorpay\b/i, why: 'The payment provider must only be reached from the website.' },
  { id: 'webview', pattern: /\bWebView\b|react-native-webview/, why: 'Checkout must open in the system browser, never an in-app WebView.' },
  { id: 'auth-session', pattern: /openAuthSessionAsync/, why: 'Use openBrowserAsync; an auth session is a surface we control.' },
  { id: 'iap', pattern: /expo-in-app-purchases|react-native-iap|InAppPurchase/i, why: 'Billing is on the website, not through in-app purchases.' },
  { id: 'card-entry', pattern: /\b(cardNumber|card_number|cvv|cvc|expiryMonth|expiry_month)\b/i, why: 'The app must never collect card details.' },
  { id: 'checkout-call', pattern: /\/billing\/(checkout|confirm|cancel)\b/, why: 'These endpoints belong to the website, not the app.' },
  // The app is consumption-only: it shows plan status and never leads to a purchase.
  // Account sign-up (/auth/signup) is not a purchase and is deliberately not matched here.
  {
    id: 'billing-handoff',
    pattern: /\/me\/billing\/handoff|\/billing\/plans\b|\bopenBilling\b|\/pricing\b/,
    why: 'The app must not open billing, list plans or link to pricing; it only reads status.',
  },
  { id: 'checkout-deep-link', pattern: /payment-success/, why: 'The app must not handle a return-from-checkout link.' },
  {
    id: 'purchase-cta',
    pattern: /['"`>][^'"`<]*\b(View plans|Choose a plan|Pick a plan|Subscribe|Subscribe now|Resubscribe|Upgrade now|Upgrade plan|Upgrade to|Pay now|Buy plan|Buy a plan|Update payment)\b/i,
    why: 'No purchase, upgrade or payment call to action in the app.',
  },
];

/** Comments describing the boundary necessarily name the things they forbid. */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(js|jsx)$/.test(entry)) out.push(full);
  }
  return out;
};

const violations = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(root, dir))) {
    const code = stripComments(readFileSync(file, 'utf8'));
    code.split('\n').forEach((line, index) => {
      for (const rule of RULES) {
        if (rule.pattern.test(line)) {
          violations.push({ file: relative(root, file), line: index + 1, rule: rule.id, why: rule.why, text: line.trim() });
        }
      }
    });
  }
}

/** A banned package in the manifest is a violation even if nothing imports it yet. */
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const BANNED_PACKAGES = [
  'react-native-webview', 'react-native-razorpay', 'razorpay',
  '@cashfreepayments/cashfree-pg', 'react-native-cashfree-pg-sdk', '@cashfreepayments/cashfree-js',
  'expo-in-app-purchases', 'react-native-iap', '@stripe/stripe-react-native',
];
for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
  if (BANNED_PACKAGES.includes(name)) {
    violations.push({ file: 'package.json', line: 0, rule: 'banned-dependency', why: 'Payment and WebView packages must not be installed.', text: name });
  }
}

if (violations.length) {
  console.error('\n✖ Google Play payment boundary violated:\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]\n    ${v.text}\n    ${v.why}\n`);
  }
  process.exit(1);
}

console.log('✓ No payment, WebView, in-app-purchase or purchase call-to-action code in the Expo app.');
console.log('  The app only reads plan status (src/state/plan.jsx); purchases happen on the website on their own.');
