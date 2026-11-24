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
call, WhatsApp and SMS reminders. The app opens the external service; it does not
automatically send a reminder.

A customer's history reads like Khatabook: "You gave" (credit bills, old dues)
and "You got" (payments) columns, each entry showing the balance after it.
**PDF report** builds a statement on the phone (expo-print) and opens the share
sheet. The khata list shows each customer's last entry date and, when customers
hold advances, the total you will give back.

### Suppliers

Khata has **Customers** and **Suppliers** tabs. A party's `partyType` is `customer` or
`supplier`; parties saved before this have none and are customers. For a
supplier, **Got goods on credit** is a `due` entry (no cash moves, you owe more)
and **Paid supplier** is a "Dealer payment" expense naming the supplier (cash out
of the day, you owe less). An expense in the day book can also name a supplier.
Phones gain the `parties.partyType` column on first open. (Not `type`: the change
feed tags each record with its own `type`, and a party field of that name overwrote it.) Deploy the backend first:
an older backend rejects `type` and expenses that name a party, and those records
stay unsynced on the phone until it is updated. Older app versions show
suppliers as customers.

### Add from contacts

**Add from contacts** in the new-customer/supplier sheet opens the phone's
contact picker and fills the name and number (last 10 digits). iOS needs no
permission for the picker; Android asks for `READ_CONTACTS` first. `WRITE_CONTACTS`
is blocked in app.json. `expo-contacts` is a native module: make a new build.
Google Play asks for a contacts declaration in the Data safety form.

### After saving

A new entry for a customer or supplier opens **Transaction saved**
(`app/book/saved.jsx`): the amount, a message with the balance ready to share or
SMS, and buttons to add the next entry for the same party.

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

## Bills, expenses, khata and reports (23 November 2026)

**Bills.** New bills get a number `DDMMYY-n` (the day and that phone's count; two
phones billing offline on the same day can repeat a number). A bill with items can
take a discount (amount = items − discount). A GST slab (5/12/18/28%) marks prices
as GST-inclusive; the bill PDF shows taxable value and CGST/SGST halves. **Share
bill** makes a PDF from the saved bill screen or when you open a bill. On a credit
bill, **Paid now** writes a payment entry for that part, so the khata keeps only the
rest. When a synced bill names catalogue products with whole-number quantities, the
server takes them off stock once (a claim record stops a resent bill from taking
twice). Products with variants or untracked stock are skipped; editing or deleting
a bill does not put stock back.

**Expenses.** "Other" expenses can carry your own name (Tea, Petrol). The names you
use most show as chips. A receipt photo can be added to a bill or expense; it is kept
on this phone only (not synced or backed up). **Repeat every month** adds the expense
on the same day each month on this phone; stop it from Reports.

**Khata.** Delete a customer or supplier from Edit: the party leaves the khata, and
their bills and payments stay in the day book. Set a due date; this phone reminds
you at 9 am that day. Sort the list by highest due, recent, oldest, due date or
name. **PDF report** on the list covers everyone in the tab. **Share ledger link**
gives a customer a page at `storeflick.in/k/<token>` with their balance, dates,
amounts and items (never your notes). The token is 130 random bits made on the
phone. **Turn off ledger link** removes it and the page stops working. The link works
once the party has synced.

**Reports.** Day book → Reports and export: a week or month of sales (cash, UPI,
credit), collections, expenses, sales minus expenses, goods bought on credit,
opening and closing cash, and expenses by head. Export as PDF or CSV (Excel opens
it; formula-like text in notes is neutralised).

Deploy order: backend (schema, `GET /v1/public/khata/:shareToken`, stock), then
web (`/k/[token]`), then a new app build.

## Fixes from emulator testing (24 November 2026)

- Parties sync as `partyType`. A field named `type` was overwritten by the change
  feed's record tag, so customers and suppliers never reached a second phone or a
  reinstall. Covered by a backend test and checked on the emulator (wipe, sign in,
  suppliers restored).
- A new entry, its part payment, and a new party keep one id for the life of the
  form, so a save that fails after writing can be retried without a duplicate.
- Deleted parties are listed under **Recently deleted** in the khata, with Restore.
- Paying a customer's balance to zero clears their due date and its reminder.
- Receipt photos live in a folder per store; deleting the entry or the store's
  offline book deletes them.
- Turning a ledger link off, replacing it, or deleting the store removes its
  lookup record on the server.
- The khata list shows each party's last entry date again (and Recent/Oldest sort
  works); "1 customer owes you" / "You owe 1 supplier" read correctly.

## Entry date

Every entry form (full bill, expense, payment, and the simple khata forms) has a **Date**
field. Tap it to pick an earlier day; future days are disabled so cash in hand is never
counted for a day that has not happened. The bill number follows the chosen day
(`211126-1` for a bill dated 21 Nov), and later days' opening balances update on their own.

## Search, custom reports, stock, bill numbers, reminders (24 November 2026)

- **Search** (day book → search icon): every bill, payment and expense by party name, bill
  number, item, note, expense name, or an exact amount ("250"). Works offline.
- **Reports → Custom**: any From–To range (no future days); opening balance is the cash
  carried into the range.
- **Bill numbers** are `DDMMYY-<phone code>-<n>` (`241126-FV4-1`). Each phone makes a
  three-letter code once per store (kept in the book's `meta` table) and counts only its own
  bills, deleted ones included, so two phones never print the same number. (Two phones drawing
  the same code is a 1-in-32,768 chance.)
- **Stock**: the server keeps, beside each bill, the lines it has taken off stock. Every newer
  copy moves stock by the difference: editing 3 → 1 puts 2 back, deleting puts all back, a resent
  copy changes nothing. Bill items picked from a product sold in variants must name the size
  or colour (`variantId`); that variant's stock is used. Part quantities (2.5 m) and untracked
  products are still left alone.
- **Part-paid bills**: the bill PDF shows "Paid now (Cash/UPI)" and "Balance on credit".
- **Reminders (free)**: every Monday at 10 the phone tells the owner how many customers owe
  and how much; tapping opens the khata's **Remind all** sheet, which steps through everyone
  who owes with one tap each (WhatsApp opens with the amount written). Due-date reminders as
  before. Nothing is sent without the owner tapping: automatic customer messages need a paid
  WhatsApp Business or SMS provider.

## Purchases, returns, receipts, UPI QR, GST summary (24 November 2026)

- **Purchase** (stock bought), **Sales return** (from a customer, a credit note) and **Return to
  supplier** (a debit note) are entry kinds beside Bill. Each can list items, carry GST and be
  paid by cash, UPI or credit. Cash and UPI move the day's money (purchases and refunds out,
  supplier refunds in); credit moves the party's balance. A purchase can keep the supplier's
  own bill number. Catalogue items move stock: purchases and customer returns add, sales and
  returns to suppliers take away; edits and deletions correct it on the server.
- **Receipt printing**: "Print receipt" makes a 58 mm or 80 mm till receipt and opens
  Android's print dialog. A Bluetooth thermal printer needs a print-service app (RawBT, or the
  printer maker's) installed once; then it appears as a printer.
- **UPI QR**: with a UPI ID in Store settings → Payments, bills and receipts show a scan-to-pay
  QR for what is left to pay (credit balance or a UPI bill), reminders add "Pay by UPI: <id>",
  and the customer's ledger page has a "Pay ₹X by UPI" button. Store details are cached in the
  book so bills made offline still carry them (after the app has been online once).
- **GST summary** (Reports, PDF, CSV): GST collected on sales less sales returns, GST paid on
  purchases less returns, by rate, and the net to pay (or credit to carry forward). A summary
  from the book, not a GSTR-1: no HSN codes or customer GSTINs.

## Khata only (25 November 2026)

Each shop has a `usage`: `store` (the online store plus bills and khata: a 3-day trial, then a plan) or `books`
(bills, khata and expenses only: free, never locked, no trial spent).

- **Setup** asks first ("How will you use StoreFlick?"). Khata only skips what-you-sell, the store link (one is made
  from the name with a random tail and kept hidden) and the design step, and lands on a khata Home.
- **Khata only in the app**: Home, Products and Account tabs; no plan banner or lock. Account has "Start online
  store", which starts the email's one free trial if unused, otherwise turns the store on locked until a plan is
  bought on the website. The last known usage is kept on the phone (`sk.usage.<businessId>`) so the right Home shows
  offline.
- **Lock screen** (trial or plan ended) has "Continue free with khata only". Account has "Turn off online store".
  Either closes the public store at once; products, orders and settings are kept.
- **Server**: `POST /v1/businesses/:id/usage` (owner only, works while locked). A khata-only shop may write only
  `/book`, `/products`, `/categories`, `/uploads`, `/notifications`, `/members`, the shop profile and settings
  (`isBooksWrite` in `middleware/entitlement.js`). The public store answers "not open right now" for a khata-only
  shop and, new with this change, for a store whose trial or plan has run out. Paying for a plan on the website
  sets `usage` back to `store`.
