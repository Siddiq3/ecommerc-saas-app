# Responsive layouts: Android QA (October 2026)

**Branch:** `feat/responsive-layouts`, created from `feat/instagram-account-connection` at `72b64ee`.
**Depends on that branch.** It builds on its Instagram responsiveness work: the opt-in `maxWidth` on `Screen` and `Sheet`,
`contentMaxWidth`, and the local QA scripts. Merge `feat/instagram-account-connection` first, or merge both together.
Neither branch is merged or deployed.

**iOS: not verified.** Nothing here has been run on an iPhone or iPad. Test with a real iPhone in Expo Go, or Xcode's
simulator, before calling any of it iOS-ready.

## What changed

| Area | Problem found | Fix |
|---|---|---|
| Tab bar | "Products" and "Customers" shrank to tiny text at large font sizes | Labels follow the system size up to 1.15x, then stop, so they never need to shrink |
| Home | Shortcut labels cut ("Catego…") | Two shortcuts per row when four would not fit at the reader's text size |
| Order and customer lists | Names cut to "Ana…"; order number cut | Name gets the full row width (two lines); order number has its own line; amount sits on the detail line |
| Filter chips (Orders, Products, Customers) | Hidden chips past the right edge gave no sign the row scrolls | Fade and chevron at the right edge while more chips are off screen |
| Order detail | Long product name squeezed beside the price | Line total moved to the quantity line; name gets three lines |
| Customer detail | "₹6,49,9 / 99" and "Cancelle / d" broke mid-word | Stats wrap to a second row; order history puts the amount over the status |
| Account | Store link showed half a second line; "Custom domain" broke letter by letter | Link truncates in the middle; row values sit under their label |
| Welcome | Did not scroll: on a small phone with large text the hero covered the logo and **Sign in was unreachable** | Scrolls when taller than the screen; layout unchanged on tall screens |
| Login and sign-up | "New to StoreKit? Create an account" could not wrap | One paragraph, so it wraps |
| Onboarding categories | "Electroni / cs", "Cosm / etics" broke mid-word | One column of horizontal cards when two would not fit |
| Onboarding typing | On a small phone with large text **the field being typed into was hidden** | While the keyboard is open on a short screen, the step header gives way |
| Onboarding location, product price | State/pincode and price/MRP side by side were too narrow ("6", "Enter M") | Each pair wraps onto two rows when it does not fit |
| Multiline fields | Store description placeholder lost its last line | Multiline inputs get room for three lines |
| Tablets | Everything stretched edge to edge | Content centred at 640 dp: `Screen`, `Sheet`, `StepScreen`, the list screens, their footers and Welcome |
| Placeholders (second pass) | Long single-line placeholders ("Enter your shop address") showed a sliver of a second line at large text | Shortened to a hint ("Shop address", "10-digit mobile", "Email or mobile"); every field keeps its persistent label above it, a page title, or a search icon |
| Delivery (second pass) | Method name cut to "Standard…" beside its "Main" pill; type control cut to "Pickup from st…" | Name wraps with the pills; control reads "Store pickup" |
| Custom domain (second pass) | Header action cut the title to "Cu…" | Action reads "+ Add" (accessible name still "New domain") |
| Store settings (second pass) | State cut to "Selec…" beside City; description placeholder overflowed three lines | City and State wrap to their own rows; placeholder "What you sell" |

## Test matrix (Android emulator, Medium Phone AVD, Expo Go)

Run on the final code of this branch (after the second pass), 14 October 2026.

| Cell | Screens | Result |
|---|---|---|
| 411 dp, font 1.0x | All six tabs, top and scrolled | Pass |
| 360 dp, font 1.0x | All six tabs, top and scrolled | Pass. "Customers" in the tab bar renders smaller than its neighbours (fits, still legible) |
| 320 x 569 dp, font 1.3x | All six tabs; price/MRP with keyboard; policies, profile, security with keyboard; coupon sheet with keyboard; delivery list and method sheet; domain screen and dialog; store settings placeholders | Pass, after the second-pass fixes below |
| 320 dp, font 1.3x (first pass) | Order, customer and product detail; store settings; Welcome; onboarding category, details and location with keyboard | Pass in the first pass; **not re-captured after the placeholder change** |
| Tablet portrait 800 x 1280 dp | All six tabs | Pass |
| Tablet landscape 1280 x 800 dp | Home, Social, Orders, Products (list and footer), Customers, Account, Welcome | Pass; onboarding layout only (that capture hit the icon-font problem below) |

Screenshots are named `<cell>_<screen>.jpg`: `default` = 411 dp, `standard` = 360 dp, `small-large` = 320 dp at 1.3x.

## Not verified

- **iOS and iPad:** not run at all. See the top of this file.
- **Custom domain entry field:** unreachable. The demo store's trial plan does not include custom domains, so both
  options in the dialog are disabled. The dialog itself fits at the worst case.
- **Shortened placeholders on onboarding, login, sign-up and forgot password:** changed after those screens were
  captured. Verified on screen: the Orders and Customers search boxes and every store settings field.
- **Tablet landscape onboarding** with working icons.
- **Forms not opened:** variant editor, category editor, policy text editor, order note sheet.

## Remaining issues

- **"Custom domain" title** still truncates to "Custom do…" at 320 dp with 1.3x text (was "Cu…").
- **Tab bar at 360 dp:** "Customers" shrinks to fit and reads smaller than the other labels.
- **Truncated secondary text** at the worst case, by design: order age ("1 item · 10 …"), customer mobile and city,
  long store links. The full value is on the detail screen.

## Test results

- Mobile (`feat/responsive-layouts`): `npm test` 13 checks passing; `eslint src app scripts` clean.
- Backend (`feat/instagram-account-connection`): already contains `main` (0 commits behind `origin/main`), so there was
  nothing to merge. Full suite under `caffeinate`: **1480 passing, 0 failing**, run twice.
- Shared-package sync: `backend/packages/{shared,validation}` is now identical in mobile, storefront and web
  (validation). Storefront `npm run sync:check` passes; storefront lint clean and vitest 244/244; web lint clean and
  `next build` succeeds. Web `packages/shared` still differs on purpose (its own pricing copy) and was not changed.

## Test environment notes

- The emulator ran out of storage (93% full), so Expo Go saved an empty icon font and every icon went blank. Clearing
  Expo Go's data fixed it. If icons vanish, check `adb shell df -h /data` first.
- After changing the screen size, a resumed app kept its old window size (content at 70% width). `matrix.sh` now force
  stops and relaunches the app, then waits for the bundle.
