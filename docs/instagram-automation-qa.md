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

## V1 management gaps — final verification, 11 October 2026

Implemented the five follow-up gaps across the existing backend and owner-app feature branches:

- Expired owners can reach Social and individual automations from the plan lock, pause/delete rules and disconnect Instagram. New connections, creation, activation and product changes remain restricted.
- Rules expose backend-computed Ready, Paused or Action needed, with specific reasons. The reply worker uses the same eligibility checks. Ready means eligible to attempt a reply; delivery remains separate activity evidence.
- Product selection searches the server with 20-item pages, scroll loading, retry and stale-response protection. Rule lists paginate and details load directly by ID, including rules beyond the first 100.
- Reports distinguish initial failure from genuine zero activity and retain the last successful counts with a stale-data notice after refresh failure. The UI shows freshness, tracked visits and orders placed, and explains that paid orders are not measured.
- Older media selections use short-lived signed proof from the authenticated Meta account-media response, bound to the store, account, connection generation and media ID. Older clients can follow official cursors beyond four pages; timeout is retryable rather than a false ownership rejection.

Final checks passed: backend ESLint, all **1,470 backend tests**, including **125 focused Instagram tests**, mobile ESLint and `npm test`, and Android/iOS Expo exports. Regression coverage includes 107 rules, 61 searchable products, expired-owner write restrictions, foreign/forged/expired media selection proofs and persistent temporary connection-health failures.

Native Android testing used local fake Meta and DynamoDB Local only. Tested the expired-plan Manage Instagram entry point, pause, disabled reactivation, deletion and disconnect; disconnected owners can still open/delete remaining paused rules. Restored the demo trial, connection and original rules after testing and removed disposable rules. No live account or customer message was used.

The final bundle was also checked for initial report failure (error and retry, no zero counters), stale report retention, successful retry recovery, and product search for `Silk`. The filtered result was Silk Saree while the existing Printed Dupatta reply preview stayed intact. The Action needed reason fits below the product title in the final overview layout.

Evidence: [expired plan entry](instagram-qa/v1-management/expired-lock.png), [final management statuses](instagram-qa/v1-management/expired-management.png), [pause](instagram-qa/v1-management/expired-paused.png), [disconnect](instagram-qa/v1-management/expired-disconnected.png), [initial report failure](instagram-qa/v1-management/report-initial-failure.png), [retained stale report](instagram-qa/v1-management/report-stale.png), [recovered report](instagram-qa/v1-management/report-recovered.png), [product search](instagram-qa/v1-management/product-search.png). The pause/disconnect/stale screenshots precede the final overview badge layout adjustment; the management and initial-failure screenshots show the final layout.

Changes remain local on `feat/instagram-account-connection` in both repositories; nothing was merged or deployed. The controlled live Meta acceptance checklist is in `backend/docs/INSTAGRAM_V1.md`. Real OAuth, webhook delivery, eligible private replies and attributed customer visits/orders still require that live test. iOS visual and physical-device checks remain outstanding; the iOS export passed.

## Per-Reel activity — 11 October 2026

Activity now includes a separate card for each Reel/post with keywords, replies sent, tracked visits, orders placed and handled/failed/unconfirmed counts. DMs have a separate card. The common reporting window is the last seven days, within the existing eight-day reply-event retention. Every database page in that window is included, replacing the former 100-record cap. Configured post rules with no activity appear with genuine zeros; deleted rules do not erase recorded activity.

Attribution links and visit/order records now preserve the actual source media ID even when an ALL rule sent the reply. Historical post-specific records can recover their source from the rule ID. Historical ALL links without a source ID remain under Older all-post links. No Instagram view count is inferred from store visits, and no paid sales count is inferred from placed orders.

Passed backend/mobile lint, mobile tests, 128 focused Instagram tests, and native Android/iOS exports. Tests cover multiple keyword rules grouped on one Reel, ALL replies tied to actual media, cross-store isolation, seven-day exclusion, deduplication, actual send-link source persistence, over 100 reply/visit/rule records, and legacy attribution labels.

The final Android app displayed the demo Reel with two replies, Direct messages with one reply, and the configured paused Reel with zero activity. Titles, thumbnails, keywords and the three metric columns were readable. Evidence: [per-Reel activity](instagram-qa/v1-management/per-reel-activity.png). Live Meta verification remains pending.

## Daily, weekly, monthly, yearly and calendar reporting

The Activity selector now applies one period to overall and per-Reel counts: Daily (today), Weekly (last seven calendar days), Monthly (this month), Yearly (this year), or an inclusive custom calendar range up to 366 days. Dates use India time. Custom dates are validated in both the app and backend; future, impossible and reversed ranges are rejected. Selecting a new period clears the previous period's counters so failed requests cannot display numbers for the wrong dates.

Daily summaries now retain non-sensitive per-media/keyword counters for 400 days. Unique source markers and counter increments commit transactionally with finalized reply outcomes and attributed visit/order writes. Raw reply history still expires after eight days. Initial migration preserves available raw history without double counting; older expired history cannot be reconstructed and is explicitly labeled as limited. This supersedes the previous fixed seven-day-only implementation.

All 1,476 backend tests pass, including 131 focused Instagram regressions covering period validation, India-day boundaries, durable historical counters and duplicate protection. Mobile lint/tests and Android/iOS exports pass. Android testing verified Yearly requests January 1 through today, opened the native calendar, selected October 6 and applied the October 6–11 range. Evidence: [Yearly selector](instagram-qa/v1-management/activity-yearly.png), [native calendar](instagram-qa/v1-management/activity-calendar.png), [custom range](instagram-qa/v1-management/activity-custom-range.png). Live Meta and iOS visual behavior remain unverified. No merge or deployment.
