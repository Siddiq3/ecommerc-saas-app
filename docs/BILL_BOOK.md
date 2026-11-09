# Bill book and khata

Open **Account → Bill book**, or use the Bill book card on Home. The book is a
manual register for shop-counter business. Online store orders remain in Orders;
they are not automatically added to the book.

## Daily balance

Amounts are stored as integer paise. Enter rupees in the app.

- Starting cash adds the cash held when the register begins.
- Cash and UPI bills increase sales and money in hand.
- Credit bills increase sales and the customer's dues, without adding cash.
- Collections increase money in hand and reduce the customer's dues.
- Expenses reduce money in hand; choose chit, dealer, rent, salary, bills or other.
- Old dues carry a customer's paper-khata balance into the app without moving cash.

## Bill items

A bill can list what was bought: item name, quantity, unit and price per unit.
Tap **Add items** on a bill, then either type the item (works offline) or pick
from **My products** (needs the internet; name and price are copied onto the
bill, so later product edits don't change old bills). Units: pcs, meter, kg,
gram, litre, ml, pair, set, dozen, box. Quantities allow up to 3 decimals
(2.5 m). Once a bill has items, its amount is their total and can't be typed.
Bills without items still work as before. The day book and the customer's
khata show a short list of the items on each bill.

Items are stored per entry in an `items` column (JSON) on the phone; existing
books gain the column on first open. On the server they are a plain list on the
entry record. Deploy the backend first: an older backend rejects entries with
items. A phone on an older app version ignores items and, if it edits such a
bill, saves it without them.

Each day's closing balance becomes the next day's opening balance. Editing or
deleting an earlier entry recalculates later balances. A customer's negative
balance is shown as an advance. Entries can be opened from the day book or the
customer history to edit or delete them.

Khata customers are separate from online-order customers. Add a customer from
Khata or while entering a credit bill, and optionally save a mobile number for
call and WhatsApp reminders. The app opens the external service; it does not
automatically send a reminder.

## Local storage and sync

Entries save to a SQLite database on the phone before any network request.
Pending records sync after a short delay, when the app returns to the foreground,
every minute while open, or when the sync badge is tapped. The server stores
records per business and exposes a paginated change feed. Deletes sync as flags.

For conflicting edits, the later revision timestamp wins. Timestamps for a local
record increase even if two edits happen in the same millisecond or the phone's
clock moves backwards. Acknowledgements clear only the revision actually sent;
an older response cannot replace a newer unsynced edit. Local writes and sync
transactions are serialized. Changing stores remounts the book session, cancels
timers, and waits for its active sync before closing the old database.

Unsynced records exist only on that phone. Clearing app data or uninstalling
before sync loses those records. The two-phone conflict policy uses device clocks;
it does not merge two edits to the same record field by field.

## Build and API

Install dependencies with `npm ci`. `expo-sqlite` is a native module, so rebuild
the native app when adopting this change. An existing binary without the module
cannot gain it through a JavaScript-only update.

Deploy the companion backend change before distributing the app:

- `POST /v1/businesses/:businessId/book/sync` accepts up to 100 records.
- `GET /v1/businesses/:businessId/book/changes` returns changes and a resume position.

The routes require `book:write` and `book:read`, respectively. Owner and manager
roles receive those permissions. The book uses existing table indexes and its
own business-scoped partition. Store/account removal also purges that partition.
The app and backend copies of the shared validation schemas and roles must match.

## Validation

On 8 November 2026, mobile lint, verification scripts, nine-language catalog
checks, and endpoint matching passed. Both platform bundles and a native iOS
Release build passed. The new storage checks execute production SQL against real
SQLite databases and exercise totals, same-millisecond revisions, offline retry,
delayed conflicts, two-phone restore/deletion and interrupted sync.
The native Android debug build passed, and the companion backend regression
suite passed all 1,507 tests, including 12 bill-book route tests. Backend lint
also passed.

The iPhone Simulator checks passed for starting cash; cash, UPI and credit bills;
required customer validation; expenses; customer creation/editing; collections;
old dues; credit-bill editing/deletion; advance balances; and daily totals. A bill
saved with the local API paused survived an app cold start and synced after the
API resumed. English and Hindi were exercised on the native app. Other languages
have catalog completeness checks, not a full native layout pass.

Screenshots and logs are in ignored `.local-qa/` directories. Call/WhatsApp
handoffs need a suitably configured device; the QA run does not establish actual
message delivery or phone calls.
