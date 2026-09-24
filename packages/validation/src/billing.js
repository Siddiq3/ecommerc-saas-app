import { z } from 'zod';
import { BILLING_CYCLES } from '@storekit/shared';

/**
 * Billing schemas, shared by the API and the website so the browser rejects exactly what
 * the server would. Every object is `.strict()`.
 *
 * Order ids are ours, not the provider's: Cashfree stores the id we give it and echoes it
 * back on the webhook and on the browser's return. Matching the shape we mint means a
 * value that this system could not have produced never reaches a lookup at all.
 */

/** `sk_<businessId prefix>_<base36 timestamp>`, the id minted at checkout. */
export const cashfreeOrderId = z
  .string()
  .regex(/^sk_[A-Za-z0-9]{1,24}_[a-z0-9]{6,12}$/, 'Invalid order reference');

export const paidPlanIdSchema = z.enum(['starter', 'growth', 'pro']);

export const planSelectionSchema = z
  .object({
    planId: paidPlanIdSchema,
    cycle: z.enum(BILLING_CYCLES).default('monthly'),
  })
  .strict();

/** The opaque one-time code in the billing URL: 32 random bytes, base64url. */
export const handoffCode = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid billing link');

export const redeemHandoffSchema = z.object({ code: handoffCode }).strict();

/**
 * What the browser sends after checkout closes.
 *
 * Only an order id, deliberately: whether it was paid is decided by asking Cashfree over
 * the server's own credentials, never by anything the browser asserts. There is no
 * client-side signature to check because there is no client-side claim to trust.
 */
export const confirmCheckoutSchema = z.object({ order_id: cashfreeOrderId }).strict();

/** Query string on the website's success page, which is shareable and so untrusted. */
export const paymentSuccessQuerySchema = z
  .object({ plan: paidPlanIdSchema.optional() })
  .strict();
