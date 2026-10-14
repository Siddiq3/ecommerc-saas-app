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
| Tab bar (third pass) | "Customers" shrank alone and read smaller than its neighbours | One shared label size for all six tabs, as large as fits; tab widths shared half equally, half by label length; labels and slots measured on the device |
| Custom domain (third pass) | Title still cut to "Custom do…" | Header action is a round + (44pt) when the screen is narrow at the reader's text size; labelled "New domain" otherwise. Domain placeholder now matches the help text (subdomain example) |
| Variant editor (third pass) | Option Name and Values too narrow side by side ("Enter", "Red, Blue") | Wrap to two rows when they do not fit; placeholders "Size, Colour" and "Red, Blue, Green" |
| Onboarding store link (third pass) | Placeholder wrapped ("Store / link"), then clipped ("yoursho") beside the domain suffix | Placeholder "myshop" |
| Store settings (second pass) | State cut to "Selec…" beside City; description placeholder overflowed three lines | City and State wrap to their own rows; placeholder "What you sell" |

## Results

All Android, on the final code of `feat/responsive-layouts`, Medium Phone AVD in Expo Go, 14 October 2026.
`default` = 411 dp at 1.0x, `standard` = 360 dp at 1.0x, `small-large` = 320 dp at 1.3x (the worst case).

### Passed

| Check | Cells | Evidence |
|---|---|---|
| All six tabs, top and scrolled | 411, 360, 320 at 1.3x | `default_tabs*`, `standard_tabs*`, `small-large_tabs*` |
| Tab labels one shared, readable size | tablet landscape, 320 at 1.3x, 411 | `tab-bar_tablet-landscape-320-411.jpg` |
| Tablet tabs, portrait and landscape | 800 x 1280, 1280 x 800 | `tablet-portrait_tabs`, `tablet-landscape_tabs-1`, `tablet-landscape_products` |
| Login and sign-up placeholders and links | 320 at 1.3x | `small-large_r3-auth-onboarding-placeholders` |
| Onboarding category, details (incl. store link), location | 320 at 1.3x | same, plus `small-large_onboarding-*` |
| Onboarding typing with the keyboard open | 320 at 1.3x | `small-large_onboarding-keyboard`, `-details-keyboard` |
| Price/MRP stacking with keyboard | 320 at 1.3x | `small-large_price-mrp` |
| Variant editor layout with keyboard | 320 at 1.3x | `small-large_r3-variants` |
| Category editor sheet with keyboard | 320 at 1.3x | `small-large_r3-category` |
| Policy text editor with keyboard; discard prompt on leave | 320 at 1.3x | `small-large_r3-policy_text` |
| Order note in the status sheet with keyboard | 320 at 1.3x | `small-large_r3-order_note` |
| Custom domain: title, dialog, add form, typing, keyboard | 320 at 1.3x, local store on the Business plan | `small-large_r3-domain_form` |
| Coupon sheet, delivery list and method sheet | 320 at 1.3x | `small-large_sheet-coupon`, `small-large_delivery-*-fixed` |
| Policies, profile, security forms with keyboard | 320 at 1.3x | `small-large_form-*` |
| Store settings placeholders and City/State | 320 at 1.3x | `small-large_store-settings-placeholders` |
| Order, customer, product detail; Welcome | 320 at 1.3x | `small-large_order-detail`, `-customer-detail`, `-product-detail`, `-welcome` |

### Failed (not fixed)

None that block use. Two minor issues:

- **Custom domain add form:** while typing, the keyboard covers the "Add domain" button. The keyboard's Done key
  submits the form, and closing the keyboard shows the button.
- **Product edit:** leaving with unsaved changes gives no "discard changes?" prompt (the policy editor does). Existing
  behaviour, not a layout issue; noted for a product decision.

### Unverified

- **iOS and iPad:** not run at all.
- **Variant rows after values are entered:** the field layout passed, but my scripted typing put both strings into one
  field, so the generated price/stock rows were not seen.
- **"Buy a new domain":** disabled locally (no domain purchase set up); only "Add existing domain" was tested.
- **Order, customer, product detail, Welcome** were last captured before the placeholder and tab-bar changes; those
  changes do not touch these screens apart from the tab bar.
- **Tablet landscape onboarding** with working icons.
- The `default_tabs*` and `standard_tabs*` screenshots predate the tab-bar change; `tab-bar_*` shows the final bar.

## Test results

- Mobile (`feat/responsive-layouts`): `npm test` 13 checks passing; `eslint src app scripts` clean.
- Backend (`feat/instagram-account-connection`): contains `main`; full suite under `caffeinate` **1480 passing,
  0 failing**, run twice.
- Shared-package sync: `backend/packages/{shared,validation}` identical in mobile and storefront, and validation in web.
  Storefront `sync:check` passes, lint clean, vitest 244/244; web lint clean, `next build` succeeds. Web
  `packages/shared` (pricing wording) intentionally unchanged.

## Test data used

Local only (`backend/api/scripts/local-qa`): DynamoDB Local, fake Instagram API, the seeded "Meera Handlooms" store,
and a store-less owner for onboarding. Custom domains were tested by setting `FEATURE_CUSTOM_DOMAINS=true` in the local
QA environment and putting the local store on the Business plan with `grant-plan.mjs`, which refuses to run against
anything but a local DynamoDB. Nothing was saved: forms were opened, typed into and cancelled.

## Test environment notes

- The emulator ran out of storage (93% full), so Expo Go saved an empty icon font and every icon went blank. Clearing
  Expo Go's data fixed it. If icons vanish, check `adb shell df -h /data` first.
- After changing the screen size, a resumed app kept its old window size. `matrix.sh` force stops and relaunches.
- Bundling once took five minutes; scripted taps that ran before it finished hit the previous screen.
