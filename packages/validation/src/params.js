import { z } from 'zod';
import { cursor, objectId, pageSlug, productParam, storeSlug } from './primitives.js';
import { PLAN_ORDER } from '@storekit/shared';

/**
 * Path parameters.
 *
 * Every id in a URL goes straight into a database key, so it is validated like any other
 * input: a malformed id is a 400 at the edge, not a query for a key that cannot exist.
 * The registry is keyed by parameter name so a router registers all of them at once and
 * a new route with a familiar parameter is covered without anyone remembering to add it.
 */

/**
 * Notification ids are an inverted timestamp, a `#`, and a ULID — the prefix keeps the
 * newest first without a second index. Clients must URL-encode the `#`.
 */
const notificationId = z
  .string()
  .regex(/^\d{13}#[0-9A-HJKMNP-TV-Z]{26}$/, 'Invalid notification');

export const PARAM_SCHEMAS = Object.freeze({
  businessId: objectId,
  productId: objectId,
  variantId: objectId,
  categoryId: objectId,
  couponId: objectId,
  customerId: objectId,
  orderId: objectId,
  uploadId: objectId,
  sessionId: objectId,
  memberId: objectId,
  notificationId,
  slug: storeSlug,
  pageSlug,
  productParam,
});

export const changePlanSchema = z.object({ planId: z.enum(PLAN_ORDER) }).strict();

/** List endpoints that page with a cursor and take nothing else. */
export const cursorQuerySchema = z.object({ cursor }).strict();
