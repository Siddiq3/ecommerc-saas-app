# Instagram automation continuation

Claude's in-progress mobile changes now separate Social into an overview, a four-step New automation screen (Where, Product, Word, Review), and an Automation details screen (preview, toggle, change product, delete).

Follow-up fixes: retryable loading errors on both new screens; failed rule fetches no longer appear as an empty automation list; failed media fetches show a retry while all-post/DM choices remain usable; saves use the existing synchronous duplicate-request guard; product previews use the backend's shared product URL helper. Native testing also exposed Social content scrolling behind the status bar; its top inset now surrounds the scroll view so content stays below system chrome.

## Verification — 11 October 2026

- Mobile ESLint and all existing `npm test` checks passed, including 97 navigation targets, 40 routes and 9 deep links.
- Android and iOS Expo exports passed after the final changes.
- All 115 focused backend Instagram tests passed with mocked AWS/Meta services.
- Render smoke checks passed for load-error Retry, target selection, review/save and automation details.
- Local integration passed: confirmed connection/readiness, five posts, six products, create, list, pause, change product, enable, activity report and delete. The temporary verification rule was removed; the three original demo rules remain.
- The local seed processed three sample comment/DM events successfully through fake Meta responses.

Local verification uses DynamoDB Local on port 8002 and the fake-Meta backend on port 8795. The existing Expo development server is on port 8081. No real Instagram account or customer messaging was used.

## Android visual and interaction verification

Completed on the 1080 × 2400 Android emulator in Expo Go, using ADB with the user's permission. The overview and all four wizard steps were inspected. Product rows, post thumbnails, keyword suggestions, the wrapped product URL and pinned wizard buttons were readable and usable.

Created a temporary post-specific BUY automation, returned from Review to change the word and confirmed selections were retained, saved it and confirmed it appeared in Social. Opened its details, paused it, changed its product, resumed it and reopened it to confirm persistence. Tested Cancel in the delete confirmation, then deleted the temporary automation and confirmed Social refreshed to the original three rules. Activity shows the three seeded replies. No ReactNativeJS errors were present in the final log check.

Screenshots: [overview](instagram-qa/overview-now.png), [Where](instagram-qa/step-1-where.png), [Product](instagram-qa/step-2-product.png), [Word](instagram-qa/step-3-word.png), [Review](instagram-qa/step-4-review.png), [saved overview](instagram-qa/saved-overview.png), [details](instagram-qa/automation-details.png), [paused/product changed](instagram-qa/paused-product-change.png), [delete confirmation](instagram-qa/delete-confirmation.png), [activity](instagram-qa/activity.png).

Physical-device and iOS visual behavior, and live Meta authorization/customer replies, remain unverified. The iOS export passed; all Instagram walkthrough data uses the local fake-Meta backend.

The repository's all-platform export command also requests web, but react-native-web is not installed. Native Android and iOS exports were run separately; no web dependency was added.
