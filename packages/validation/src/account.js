import { z } from 'zod';
import { storeSlug, prose } from './primitives.js';

/**
 * Deleting things for good.
 *
 * Both schemas demand more than a button press. A store delete carries the slug the
 * caller believes they are deleting, so a stale screen or a mistyped id cannot take out
 * the wrong store; an account deletion carries a reason and the merchant's own words,
 * because a human reads it before anything is erased.
 */

export const deleteBusinessSchema = z
  .object({
    slug: storeSlug,
    confirm: z.literal(true, { errorMap: () => ({ message: 'Confirm that this permanently deletes the store' }) }),
  })
  .strict();

export const DELETION_REASONS = Object.freeze([
  'not_using',
  'too_expensive',
  'missing_features',
  'switching',
  'privacy',
  'other',
]);

export const accountDeletionRequestSchema = z
  .object({
    reason: z.enum(DELETION_REASONS, { errorMap: () => ({ message: 'Choose a reason' }) }),
    details: prose(1000, { label: 'Details' }).refine((v) => v.trim().length >= 10, 'Tell us a little more — at least 10 characters'),
    confirm: z.literal(true, { errorMap: () => ({ message: 'Confirm that you want your account and data deleted' }) }),
  })
  .strict();

/**
 * Deleting the account itself, from the signed-in app. Nothing names the account: the
 * server deletes the one the access token belongs to, and this only proves the merchant
 * meant it.
 */
export const deleteAccountSchema = z
  .object({
    confirm: z.literal(true, { errorMap: () => ({ message: 'Confirm that this permanently deletes your account' }) }),
  })
  .strict();
