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

const note = optionalProse(200, { multiline: false, label: 'Note' });

export const bookEntrySchema = z
  .object({
    entryId: objectId,
    kind: z.enum(BOOK_ENTRY_KINDS),
    date: dateOnly,
    amount: money.min(1, 'Enter an amount'),
    mode: z.enum(BOOK_PAY_MODES).optional(),
    partyId: objectId.optional(),
    category: z.enum(BOOK_EXPENSE_CATEGORIES).optional(),
    note,
    updatedAt: isoDateTime,
    deleted: z.boolean().default(false),
  })
  .strict()
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

export const bookSyncSchema = z
  .object({
    entries: z.array(bookEntrySchema).max(BOOK_SYNC_MAX).default([]),
    parties: z.array(bookPartySchema).max(BOOK_SYNC_MAX).default([]),
  })
  .strict()
  .refine((body) => body.entries.length + body.parties.length <= BOOK_SYNC_MAX, `Send at most ${BOOK_SYNC_MAX} records at a time`);

/** `<server time>#<record id>`: the position in the change feed a phone has read up to. */
export const bookChangesQuerySchema = z
  .object({
    since: z
      .string()
      .max(64)
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z#(?:[0-9A-HJKMNP-TV-Z]{26})?$/, 'Invalid sync position')
      .optional(),
    limit: pageLimit(500, 200),
  })
  .strict();
