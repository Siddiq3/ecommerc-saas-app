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

## Test matrix (Android emulator, Medium Phone AVD, Expo Go)

| Cell | Result |
|---|---|
| 320 x 569 dp, font 1.3x (worst case) | Every screen below checked after the fixes |
| 360 dp and 411 dp, font 1.0x | **Not re-run on this branch** (covered for the Instagram screens on the parent branch) |
| Tablet portrait 800 x 1280 dp | All six tabs |
| Tablet landscape 1280 x 800 dp | Home, Social, Orders, Customers, Account, Welcome; onboarding layout only (that capture hit the icon-font problem below) |

Screens covered at the worst case: Home, Social, Orders, Products, Customers, Account, order detail, customer detail,
product detail, store settings, Welcome, onboarding (category, details, location) with the keyboard open.

Screenshots in this folder are named `<cell>_<screen>.jpg` and show the final code.

## Not verified on screen

- The product price/MRP wrap: the code is in, but the screenshot predates it.
- Landscape Products: the capture caught Home while the app reloaded. Portrait confirms the same footer fix.
- Other forms not walked: coupons, delivery, policies, profile, security, domain.

## Known remaining issue

**Long placeholders in single-line fields** ("Enter your shop address", "Enter your business name", "Enter your email
or mobile number") still show a sliver of a second line at large text. Android wraps a placeholder even in a one-line
input. Capping the input height did not clip it (Android does not clip at padding), so that attempt was reverted. The
practical fix is shorter placeholder copy, which is a wording decision.

## Test results

- Mobile: `npm test`, 13 checks passing; `eslint src app scripts` clean.
- Backend (`feat/instagram-account-connection`): full suite under `caffeinate`, **1480 passing, 0 failing** (3 min).
  The two earlier failures were in a run the machine slept through (15 min); both files passed alone and the
  sleep-protected run is clean.

## Test environment note

The emulator ran out of storage during testing (93% full), so Expo Go saved an empty icon font and every icon went
blank. Clearing Expo Go's data fixed it. If icons vanish while testing, check `adb shell df -h /data` first.
