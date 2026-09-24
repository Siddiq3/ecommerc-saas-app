# StoreKit — merchant app

The Expo app a store owner runs their business from: orders, payments, catalogue,
customers and analytics.

It contains **no payment code**. Subscribing happens on the website, in the device's own
browser. See [`docs/PLAY_BILLING_POLICY.md`](../../docs/PLAY_BILLING_POLICY.md) — that
boundary is enforced by `npm test`, not by convention.

## Running it

```bash
cp .env.example .env          # point EXPO_PUBLIC_API_URL at your API
npm run dev:api               # from the repo root, in another terminal
npm start -w @storekit/mobile
```

On a physical device, `localhost` is the phone, not your machine. Use your LAN address:

```
EXPO_PUBLIC_API_URL=http://192.168.1.42:3001
```

## Checks

```bash
npm run lint -w @storekit/mobile              # includes the banned-import rules
npm test -w @storekit/mobile                  # the Play payment boundary
npm run verify:endpoints -w @storekit/mobile  # every app call hits a real backend route
npm run bundle:check -w @storekit/mobile      # both platforms bundle
```

`verify:endpoints` reads the backend's own route table, so a renamed route on the server
fails here rather than on someone's phone.

## Layout

```
app/                       Expo Router routes — the file tree is the navigation
  (auth)/                  welcome, login, signup, verify, forgot password
  (tabs)/                  home, orders, products, customers, account
  onboarding/              store creation, before the product exists
  orders/[orderId]         order detail: status, payment decision, cancel
  products/                detail, edit, new
  customers/[customerId]   one customer's history
  paywall.jsx              plans, and the handoff to the browser
  settings/                profile, security, subscription
src/
  api/       client (auth, refresh, errors), endpoints, keychain storage
  state/     auth, plan/entitlement, order counts
  components/ui kit, domain rows, screen chrome, sheet
  lib/       data-fetching hooks, uploads, formatting
  theme.js   the design system
```

## Things worth knowing before changing them

**Login needs three fields.** The API authenticates on email + mobile + password. Signup
must therefore collect a mobile number; an account created without one cannot sign in.
`signupSchema.phone` is still `.optional()` server-side — the app requires it to
compensate, but the schema should be tightened.

**Money is integer paise everywhere.** It is converted to and from rupees in exactly one
place, `ProductForm`, on submit. Nothing else should touch a float.

**The token refresh is single-flight.** Two concurrent 401s must not both refresh: the
backend rotates refresh tokens and detects reuse, so a double refresh logs the user out.

**Plan status is never cached as a boolean.** `entitled` is `null` until the first
successful load, so screens hold rather than flashing a paywall at a paying customer on a
slow connection.
