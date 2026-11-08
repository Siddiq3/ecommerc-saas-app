# iOS app

iOS and Android use the same Expo Router routes, API client, validation, state,
and components. Changes to orders, products and photos, customers, Instagram,
analytics, coupons, categories, notifications, onboarding, store settings,
storefront, delivery, policies, domains, account security, and account deletion
ship from this repository to both platforms.

## Run on this Mac

Install Xcode and an iOS Simulator runtime through Xcode's Settings. Install the
JavaScript dependencies with `npm ci` and CocoaPods if `pod` is unavailable.
Keep at least 5 GB of free disk space for native build output and Simulator data.
Configure `.env` using `.env.example`. The Simulator can reach an API on this Mac
through `localhost`; a physical iPhone needs a reachable LAN or HTTPS API URL.

From the mobile repository:

```sh
npm run ios:release
# Optional: select a Simulator by UDID or exact name
npm run ios:release -- --device "iPhone 17 Pro"
```

The launcher selects the installed Xcode for its own process when the Mac's
global selection points to Command Line Tools. It leaves that global selection
unchanged. With Xcode 26, it uses Expo's normal iOS launcher. With Xcode 27,
which replaced Simulator.app with Device Hub, it generates the iOS project,
installs Pods, builds a standalone Release app, installs and launches it, and
opens the chosen device in Device Hub. The fallback also applies to `npm run ios`;
it builds Release and does not use Metro or Fast Refresh.

No Apple signing account is needed for the local Simulator build. Local ad hoc
signing supplies the identity needed for secure Keychain session storage. Native
projects, build output and `.env` stay outside Git. The Device Hub build applies
the app's iOS 15.1 minimum to all dependencies, including older resource bundles.

Apple's Device Hub documentation:
https://developer.apple.com/documentation/xcode/device-hub

Expo's Xcode 27 compatibility notes:
https://expo.dev/blog/xcode-27-device-hub-expo-device-hub

## Checks

```sh
npm run lint
npm test
npm run bundle:check
```

CI bundles both iOS and Android. A successful bundle verifies JavaScript and
assets; a native build and device testing are separate checks.

Validation on 8 November 2026: lint, the mobile verification suite, both platform
bundles, and a native Release build passed. The app was installed and exercised
on an iPhone 17 Pro Simulator with the iOS 26 runtime. The backend regression
suite passed all 1,495 tests. Endpoint verification matched 83 mobile API calls
against 137 backend routes. These checks do not establish complete device parity.

Native testing used disposable local data, DynamoDB Local, local S3-compatible
storage, console email, and a fake Meta service. No real payment was made and no
live Instagram delivery was verified. Screenshots and API logs are retained in
the ignored `.local-qa/` directories.

| Area | Observed Simulator result |
| --- | --- |
| Authentication | Signup, sign-in, sign-out, session restoration, password reset, and login with the reset password passed. Email verification is bypassed by the current shared signup flow. |
| Onboarding | Category, business name, generated link availability, address, searchable state selection, style choice, store creation, copy link, and dashboard entry passed. |
| Products | Creation, editing, visibility, stock updates, size variant generation and persistence passed. |
| Photos | Denied permission error, full-access gallery selection, crop, zoom, upload, save, repeated gallery opening, fit selection, removal and store logo upload passed. |
| Orders | Filters, customer navigation, confirmed/preparing/ready-to-ship/shipped/delivered transitions, completed delivered timeline, and cancellation with a reason passed. |
| UPI | Local reference submission, approval confirmation, verified state, rejection reason, and rejected state passed. |
| Customers | Sorting, detail, order-history navigation, block and unblock passed. |
| Categories and coupons | Category creation and product-scoped coupon creation passed, including preserved draft and native start-date calendar. |
| Instagram | Reports, custom date calendar/range, automation creation, product change and pause/resume passed with fake Meta data. |
| Settings | Profile preference, delivery estimate, storefront style/message and return-policy saves passed. Store details, policy editor, domains, security/devices, analytics, activity and Help screens loaded; Help topic interaction passed. |
| Account deletion | Missing acknowledgement was rejected and the final native confirmation appeared. Actual deletion was not executed. |

Remaining checks include actual disposable-account deletion; remaining edit/delete
cases for categories, coupons and automations; banner and UPI QR uploads; limited
photo access; real HEIC assets; upload failure/retry; password change and device
revocation; domain connection; expired-plan flows; back-gesture draft prompts;
large text, small iPhone, iPad and multitasking coverage. An iPad Simulator install
completed, but app launch and layout checks were not executed. Simulator controls
and screenshots supplied the native evidence; the attempted XCTest runner did
not produce a passing UI suite.

## Simulator QA

Use the existing local demo API described in `scripts/local-qa/README.md` to
exercise seeded merchant data. `localhost:8795` works directly in Simulator.
Screenshots and build logs belong in `.local-qa/`, which Git ignores.

Verify these flows on iPhone and iPad before marking feature parity complete:

- Sign in, sign up, email verification, password reset, session restoration,
  sign out, and account deletion.
- Home, orders and status transitions, payment verification, customers,
  analytics, and activity navigation.
- Create/edit products, variants, stock, categories, gallery selection, crop,
  reorder, upload, removal, and repeated camera/gallery opening.
- Store logo and storefront banners, including iPhone HEIC photos; denied and
  limited photo permissions; upload failure and retry.
- Coupon creation/editing, specific-product selection, start/end date pickers,
  and return to the form with the draft preserved.
- Instagram connection/return links, automations, product selection, reports,
  custom dates, and expired-plan management.
- Storefront, delivery, policies, domains, profile, password/devices, and plan
  status. Check unsaved-change prompts when using iOS back gestures.
- Keyboard-visible forms, bottom sheets, safe areas, large text, small iPhones,
  iPad and multitasking layouts.

Camera hardware, WhatsApp/call handoffs, real Instagram authorization, and
physical-device performance need a real iPhone. The Simulator cannot establish
those checks. TestFlight/App Store signing and submission are separate from
the local Simulator build.

## Optional cloud Simulator build

```sh
eas build --platform ios --profile simulator
```

The `simulator` profile inherits preview endpoints and produces a Simulator
build. The existing production profile remains the path for signed device builds.
