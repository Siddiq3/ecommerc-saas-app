import { z } from 'zod';
import { dateOnly, isoDateTime, mobile, money, objectId, optionalProse, pageLimit, shortText } from './primitives.js';

/**
 * Bill book and khata: the shop's own daily register, kept on the phone and synced.
 *
 * Records are created offline, so the phone mints the ids (ULIDs) and stamps `updatedAt`;
 * the server keeps whichever copy of a record was changed last. Deletion is a flag, never
 * a removed row, so a deletion made on one phone reaches the others.
 *
 * Entry kinds and what they do to the day's money and to a customer's dues:
 *   sale       a bill. Cash or UPI is money in; credit is owed by the customer instead.
 *   expense    money out: chit, dealer payment, rent, salary, bills, anything else.
 *   collection a customer paying their dues: money in, and their dues go down.
 *   opening    the cash in hand on the day the book was started: money in.
 *   due        dues carried over from the paper khata: owed by the customer, no money moves.
 *              With a supplier: goods bought on credit, owed by the shop to the supplier.
 *   purchase       stock bought: cash or UPI is money out; credit is owed to the supplier.
 *   salesReturn    goods a customer brought back: cash or UPI refunded (money out), or on
 *                  credit taken off what the customer owes.
 *   purchaseReturn goods sent back to a supplier: cash or UPI refunded (money in), or on
 *                  credit taken off what the shop owes the supplier.
 * Bills, purchases and both returns can list items; those from the catalogue move stock.
 *
 * An expense can name a supplier (a party with partyType 'supplier'): that is paying the supplier,
 * money out of the day and off what the shop owes them.
 */
export const BOOK_PARTY_TYPES = ['customer', 'supplier'];
/** GST slabs a counter bill can carry. Bill prices include the tax; the bill only shows the split. */
export const BOOK_GST_RATES = [0, 5, 12, 18, 28];

/**
 * What an entry does to its party's balance: +1 adds to it (credit bill, dues, goods from a
 * supplier on credit), -1 takes off (a customer paying, paying a supplier), 0 leaves it.
 * Shared by the phone and the customer's ledger page, so both read a balance the same way.
 */
export const partyEffect = (entry) => {
  const credit = entry.mode === 'credit';
  if (entry.kind === 'due' || (credit && (entry.kind === 'sale' || entry.kind === 'purchase'))) return 1;
  if (entry.kind === 'collection' || entry.kind === 'expense') return -1;
  if (credit && (entry.kind === 'salesReturn' || entry.kind === 'purchaseReturn')) return -1;
  return 0;
};

/** Entry kinds that list goods (and can move stock). */
export const BOOK_GOODS_KINDS = ['sale', 'purchase', 'salesReturn', 'purchaseReturn'];

/** A customer's ledger link token: 26 random base32 characters (130 bits), made on the phone. */
export const bookShareToken = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'Invalid link');
export const BOOK_ENTRY_KINDS = ['sale', 'expense', 'collection', 'opening', 'due', 'purchase', 'salesReturn', 'purchaseReturn'];
export const BOOK_PAY_MODES = ['cash', 'upi', 'credit'];
export const BOOK_EXPENSE_CATEGORIES = ['chit', 'dealer', 'rent', 'salary', 'bills', 'other'];
export const BOOK_SYNC_MAX = 100;
/** How an item on a bill is counted: pieces, length (cloth), weight, volume or packs. */
export const BOOK_UNITS = ['pcs', 'm', 'kg', 'g', 'l', 'ml', 'pair', 'set', 'dozen', 'box'];
export const BOOK_ITEMS_MAX = 50;
export const BOOK_QTY_MAX = 100_000;

const note = optionalProse(200, { multiline: false, label: 'Note' });

/** Quantities keep at most three decimals (2.5 m, 0.250 kg) and are compared as thousandths. */
export const qtyMilli = (qty) => Math.round(Number(qty) * 1000);

/** A line's total in paise: quantity × price per unit, rounded to the nearest paisa. */
export const itemTotal = (item) => Math.round((qtyMilli(item.qty) * item.price) / 1000);
export const itemsTotal = (items = []) => items.reduce((acc, item) => acc + itemTotal(item), 0);

/**
 * One line of a bill: what was sold, how much and at what price per unit. `productId` is
 * set when the line was picked from the store's catalogue; the name and price are copied
 * onto the bill, so a later change to the product does not rewrite an old bill.
 */
export const bookItemSchema = z
  .object({
    name: shortText(1, 80, 'Item name'),
    qty: z
      .number({ invalid_type_error: 'Quantity must be a number' })
      .positive('Quantity must be more than zero')
      .max(BOOK_QTY_MAX, 'Quantity is too large')
      .refine((q) => Math.abs(q * 1000 - qtyMilli(q)) < 1e-6, 'Use at most 3 decimals in quantity'),
    unit: z.enum(BOOK_UNITS),
    price: money,
    productId: objectId.optional(),
    // The size/colour picked, for a product sold in variants: its stock is the variant's.
    variantId: objectId.optional(),
  })
  .strict()
  .refine((i) => !i.variantId || i.productId, { path: ['variantId'], message: 'A variant needs its product' });

export const bookEntrySchema = z
  .object({
    entryId: objectId,
    kind: z.enum(BOOK_ENTRY_KINDS),
    date: dateOnly,
    amount: money.min(1, 'Enter an amount'),
    mode: z.enum(BOOK_PAY_MODES).optional(),
    partyId: objectId.optional(),
    category: z.enum(BOOK_EXPENSE_CATEGORIES).optional(),
    items: z.array(bookItemSchema).min(1, 'Add at least one item').max(BOOK_ITEMS_MAX, `A bill can have at most ${BOOK_ITEMS_MAX} items`).optional(),
    // Bills only: a number for the printed bill, a discount off the items, the GST slab.
    billNo: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9/-]+$/, 'Invalid bill number').optional(),
    discount: money.optional(),
    gstRate: z.number().refine((r) => BOOK_GST_RATES.includes(r), 'Choose a GST rate').optional(),
    // Expenses only: the owner's own name for an "other" expense (Tea, Petrol).
    label: shortText(1, 30, 'Expense name').optional(),
    note,
    updatedAt: isoDateTime,
    deleted: z.boolean().default(false),
  })
  .strict()
  .superRefine((entry, ctx) => {
    const goods = BOOK_GOODS_KINDS.includes(entry.kind);
    if (entry.items && !goods) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'Only a bill, purchase or return has items' });
    if (entry.items && goods && itemsTotal(entry.items) - (entry.discount ?? 0) !== entry.amount) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: 'The amount must match the items total' });
    }
    if (entry.discount !== undefined && !entry.items) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discount'], message: 'Only a bill with items has a discount' });
    // A purchase's bill number is the supplier's own invoice number, kept for GST input credit.
    for (const field of ['billNo', 'gstRate']) {
      if (entry[field] !== undefined && !goods) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: 'Only a bill, purchase or return has this' });
    }
    if (entry.label !== undefined && entry.kind !== 'expense') ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['label'], message: 'Only an expense has a name' });
  })
  .superRefine((entry, ctx) => {
    const issue = (path, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    const goods = BOOK_GOODS_KINDS.includes(entry.kind);
    const needsParty = entry.kind === 'collection' || entry.kind === 'due' || (goods && entry.mode === 'credit');
    if (needsParty && !entry.partyId) issue('partyId', 'Choose the customer');
    if (!needsParty && entry.partyId && !goods && entry.kind !== 'expense') issue('partyId', 'Only bills, purchases, returns, payments, dues and supplier payments have a party');
    if ((goods || entry.kind === 'collection' || entry.kind === 'expense') && !entry.mode) issue('mode', 'Choose cash, UPI or credit');
    if (!goods && entry.mode === 'credit') issue('mode', 'Only a bill, purchase or return can be on credit');
    if ((entry.kind === 'opening' || entry.kind === 'due') && entry.mode) issue('mode', 'This entry has no payment mode');
    if (entry.kind === 'expense' && !entry.category) issue('category', 'Choose what the expense was for');
    if (entry.kind !== 'expense' && entry.category) issue('category', 'Only an expense has a category');
  });

export const bookPartySchema = z
  .object({
    partyId: objectId,
    name: shortText(1, 80, 'Name'),
    mobile: mobile.optional(),
    // Absent on parties made before suppliers existed: those are customers. Not `type`: the change
    // feed tags every record with its own `type` (entry, party…), which a party field would overwrite.
    partyType: z.enum(BOOK_PARTY_TYPES).optional(),
    // When the dues should be paid; the phone that set it reminds the owner that morning.
    dueDate: dateOnly.optional(),
    // Present while the customer's ledger link is on; removing it turns the link off.
    shareToken: bookShareToken.optional(),
    note,
    updatedAt: isoDateTime,
    deleted: z.boolean().default(false),
  })
  .strict();

/**
 * Staff attendance: the shop's own register of the people who work there. Staff here are
 * names on a list, not app accounts; the owner marks each day. How a status counts:
 *   present  a full day worked
 *   half     half a day worked
 *   absent   not worked; a monthly salary is cut for it
 *   leave    approved leave; paid on a monthly salary, unpaid on a daily wage
 */
export const STAFF_WAGE_TYPES = ['monthly', 'daily'];
export const ATTENDANCE_STATUSES = ['present', 'half', 'absent', 'leave'];

export const bookStaffSchema = z
  .object({
    staffId: objectId,
    name: shortText(1, 80, 'Name'),
    mobile: mobile.optional(),
    wageType: z.enum(STAFF_WAGE_TYPES),
    wage: money,
    note,
    updatedAt: isoDateTime,
    deleted: z.boolean().default(false),
  })
  .strict();

/**
 * One mark per person per day. The id is `<staffId>:<date>`, so two phones marking the same
 * day write the same record and the later mark wins, instead of leaving two marks.
 */
export const bookAttendanceSchema = z
  .object({
    attendanceId: z.string().max(40),
    staffId: objectId,
    date: dateOnly,
    status: z.enum(ATTENDANCE_STATUSES),
    updatedAt: isoDateTime,
    deleted: z.boolean().default(false),
  })
  .strict()
  .refine((a) => a.attendanceId === `${a.staffId}:${a.date}`, { path: ['attendanceId'], message: 'Invalid attendance id' });

export const bookSyncSchema = z
  .object({
    entries: z.array(bookEntrySchema).max(BOOK_SYNC_MAX).default([]),
    parties: z.array(bookPartySchema).max(BOOK_SYNC_MAX).default([]),
    staff: z.array(bookStaffSchema).max(BOOK_SYNC_MAX).default([]),
    attendance: z.array(bookAttendanceSchema).max(BOOK_SYNC_MAX).default([]),
  })
  .strict()
  .refine(
    (body) => body.entries.length + body.parties.length + body.staff.length + body.attendance.length <= BOOK_SYNC_MAX,
    `Send at most ${BOOK_SYNC_MAX} records at a time`,
  );

/** `<server time>#<record id>`: the position in the change feed a phone has read up to. */
export const bookChangesQuerySchema = z
  .object({
    since: z
      .string()
      .max(64)
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z#(?:[0-9A-HJKMNP-TV-Z]{26})?$/, 'Invalid sync position')
      .optional(),
    limit: pageLimit(500, 200),
    // Staff and attendance records only go to app versions that ask for them: an older app
    // would try to store them as bills.
    include: z.enum(['staff']).optional(),
  })
  .strict();
