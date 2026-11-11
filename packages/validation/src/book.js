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
 */
export const BOOK_ENTRY_KINDS = ['sale', 'expense', 'collection', 'opening', 'due'];
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
  })
  .strict();

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
    note,
    updatedAt: isoDateTime,
    deleted: z.boolean().default(false),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (entry.items && entry.kind !== 'sale') ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'Only a bill has items' });
    if (entry.items && entry.kind === 'sale' && itemsTotal(entry.items) !== entry.amount) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: 'The amount must match the items total' });
    }
  })
  .superRefine((entry, ctx) => {
    const issue = (path, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    const needsParty = entry.kind === 'collection' || entry.kind === 'due' || (entry.kind === 'sale' && entry.mode === 'credit');
    if (needsParty && !entry.partyId) issue('partyId', 'Choose the customer');
    if (!needsParty && entry.partyId && entry.kind !== 'sale') issue('partyId', 'Only bills, payments and dues have a customer');
    if ((entry.kind === 'sale' || entry.kind === 'collection' || entry.kind === 'expense') && !entry.mode) issue('mode', 'Choose cash, UPI or credit');
    if (entry.kind !== 'sale' && entry.mode === 'credit') issue('mode', 'Only a bill can be on credit');
    if ((entry.kind === 'opening' || entry.kind === 'due') && entry.mode) issue('mode', 'This entry has no payment mode');
    if (entry.kind === 'expense' && !entry.category) issue('category', 'Choose what the expense was for');
    if (entry.kind !== 'expense' && entry.category) issue('category', 'Only an expense has a category');
  });

export const bookPartySchema = z
  .object({
    partyId: objectId,
    name: shortText(1, 80, 'Name'),
    mobile: mobile.optional(),
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
