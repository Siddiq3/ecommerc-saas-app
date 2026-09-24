import { z } from 'zod';
import {
  addressLine, businessName, couponCode, cursor, dateOnly, email, emptyable, isoDateTime, mobile,
  money, objectId, objectKey, opaqueId, optionalProse, orderNumber, pageLimit, personName, pincode,
  placeName, searchQuery, trackingReference, trackingToken, utr,
} from './primitives.js';
import { CANCELLATION_REASONS, ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES } from '@storekit/shared';

/**
 * Checkout and order schemas. Every object is `.strict()`: unknown keys are rejected.
 *
 * The public checkout is the most exposed surface in the system — anonymous, and holding
 * a delivery address that is later printed on a parcel and read aloud by a courier — so
 * every address field has a format, not just a length.
 */

/* ───────────── Cart & checkout ───────────── */

export const cartLineSchema = z
  .object({
    productId: objectId,
    variantId: objectId.nullable().optional(),
    quantity: z.number().int('Quantity must be a whole number').min(1).max(99),
  })
  .strict();

const lines = z
  .array(cartLineSchema)
  .min(1, 'Your cart is empty')
  .max(50, 'Too many items in one order')
  .refine(
    (items) => new Set(items.map((l) => `${l.productId}:${l.variantId ?? ''}`)).size === items.length,
    'The same item appears twice — change its quantity instead',
  );

export const addressSchema = z
  .object({
    fullName: personName,
    mobile,
    altMobile: mobile.optional(),
    email: emptyable(email),
    houseNo: addressLine(1, 60, 'House / flat number'),
    street: addressLine(2, 120, 'Street'),
    area: addressLine(2, 120, 'Area'),
    landmark: addressLine(2, 120, 'Landmark').optional().or(z.literal('')),
    city: placeName,
    district: placeName,
    state: placeName,
    pincode,
    instructions: optionalProse(300, { label: 'Delivery instructions' }),
  })
  .strict()
  .refine((a) => !a.altMobile || a.altMobile !== a.mobile, {
    path: ['altMobile'],
    message: 'Use a different number from the main one',
  });

export const paymentMethodSchema = z.enum(PAYMENT_METHODS);

/** Anonymous analytics session: a random id the storefront generates, nothing more. */
const sessionId = opaqueId(8, 64, 'Session');

export const quoteSchema = z
  .object({
    lines,
    couponCode: emptyable(couponCode),
    pincode: pincode.optional(),
    paymentMethod: paymentMethodSchema.optional(),
  })
  .strict();

export const createOrderSchema = z
  .object({
    lines,
    address: addressSchema,
    couponCode: emptyable(couponCode),
    paymentMethod: paymentMethodSchema,
    /**
     * The total the customer saw. The server recomputes the real total and refuses the
     * order on mismatch, so a stale price is never silently charged in either direction.
     */
    expectedTotal: money,
    note: optionalProse(500, { label: 'Note' }),
    sessionId: sessionId.optional(),
  })
  .strict();

/* ───────────── Tracking, cancellation, UPI ───────────── */

/** Tracking accepts the one-time token, or order number plus the mobile on the order. */
export const orderLookupSchema = z
  .object({
    orderNumber: orderNumber.optional(),
    mobile: mobile.optional(),
    token: trackingToken.optional(),
  })
  .strict()
  .refine((v) => Boolean(v.token) || (Boolean(v.orderNumber) && Boolean(v.mobile)), {
    message: 'Enter your order number and mobile number, or open your tracking link',
  });

export const customerCancelSchema = z
  .object({
    token: trackingToken,
    reason: z.enum(['customer_request', 'duplicate_order', 'other']).default('customer_request'),
    note: optionalProse(300, { label: 'Note' }),
  })
  .strict();

export const upiSubmissionSchema = z
  .object({
    token: trackingToken,
    utr,
    screenshotKey: objectKey.optional(),
    note: optionalProse(200, { multiline: false, label: 'Note' }),
  })
  .strict();

/* ───────────── Owner order management ───────────── */

export const orderStatusSchema = z.enum(ORDER_STATUSES);

export const updateOrderStatusSchema = z
  .object({
    status: orderStatusSchema,
    note: optionalProse(300, { label: 'Note' }),
    trackingReference: trackingReference.optional(),
    courierName: businessName.optional(),
  })
  .strict()
  // Tracking details describe a shipment, so they only make sense when shipping one.
  .refine((v) => v.status === 'SHIPPED' || (!v.trackingReference && !v.courierName), {
    path: ['trackingReference'],
    message: 'Tracking details can only be added when marking an order shipped',
  });

export const ownerCancelOrderSchema = z
  .object({
    reason: z.enum(CANCELLATION_REASONS),
    note: optionalProse(300, { label: 'Note' }),
    restock: z.boolean().default(true),
  })
  .strict();

export const verifyPaymentSchema = z
  .object({
    note: optionalProse(300, { label: 'Note' }),
    /** The owner attests they matched the reference against their own bank record. */
    confirmedAmountMatches: z.literal(true, {
      errorMap: () => ({ message: 'Confirm that you received this amount before verifying' }),
    }),
  })
  .strict();

export const rejectPaymentSchema = z
  .object({
    reason: z.enum(['not_received', 'amount_mismatch', 'invalid_reference', 'duplicate', 'other']),
    note: optionalProse(300, { label: 'Note' }),
    cancelOrder: z.boolean().default(false),
  })
  .strict();

const dateRange = (v) => !v.from || !v.to || v.from <= v.to;

export const orderQuerySchema = z
  .object({
    status: z.union([orderStatusSchema, z.literal('all')]).default('all'),
    paymentStatus: z.union([z.enum(PAYMENT_STATUSES), z.literal('all')]).default('all'),
    q: searchQuery,
    from: dateOnly.optional(),
    to: dateOnly.optional(),
    cursor,
    limit: pageLimit(100, 20),
  })
  .strict()
  .refine(dateRange, { path: ['to'], message: 'The end date must be on or after the start date' });

export const customerQuerySchema = z
  .object({
    q: searchQuery,
    sort: z.enum(['recent', 'spend', 'orders']).default('recent'),
    cursor,
    limit: pageLimit(100, 20),
  })
  .strict();

/* ───────────── Coupons ───────────── */

export const createCouponSchema = z
  .object({
    code: couponCode,
    description: optionalProse(200, { multiline: false, label: 'Description' }),
    type: z.enum(['percentage', 'fixed']),
    value: z.number().min(1),
    scope: z.enum(['all', 'products', 'categories']).default('all'),
    productIds: z.array(objectId).max(200).default([]),
    categoryIds: z.array(objectId).max(50).default([]),
    minOrderValue: money.default(0),
    maxDiscount: money.default(0),
    usageLimit: z.number().int().min(0).max(1_000_000).default(0),
    usageLimitPerCustomer: z.number().int().min(0).max(100).default(0),
    startAt: isoDateTime.optional(),
    expiresAt: isoDateTime.nullable().optional(),
    allowedPaymentMethods: z.array(paymentMethodSchema).max(2).default([]),
    active: z.boolean().default(true),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.type === 'percentage' && (data.value < 1 || data.value > 90 || !Number.isInteger(data.value))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Percentage discount must be a whole number between 1 and 90' });
    }
    if (data.type === 'fixed' && !Number.isInteger(data.value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Fixed discount must be a whole amount' });
    }
    if (data.scope === 'products' && data.productIds.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['productIds'], message: 'Select at least one product' });
    }
    if (data.scope === 'categories' && data.categoryIds.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['categoryIds'], message: 'Select at least one category' });
    }
    if (data.startAt && data.expiresAt && new Date(data.expiresAt) <= new Date(data.startAt)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'Expiry must be after the start date' });
    }
    if (new Set(data.allowedPaymentMethods).size !== data.allowedPaymentMethods.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['allowedPaymentMethods'], message: 'Each payment method can only be listed once' });
    }
  });

export const updateCouponSchema = z
  .object({
    description: optionalProse(200, { multiline: false, label: 'Description' }),
    minOrderValue: money.optional(),
    maxDiscount: money.optional(),
    usageLimit: z.number().int().min(0).max(1_000_000).optional(),
    usageLimitPerCustomer: z.number().int().min(0).max(100).optional(),
    startAt: isoDateTime.optional(),
    expiresAt: isoDateTime.nullable().optional(),
    allowedPaymentMethods: z.array(paymentMethodSchema).max(2).optional(),
    active: z.boolean().optional(),
    productIds: z.array(objectId).max(200).optional(),
    categoryIds: z.array(objectId).max(50).optional(),
  })
  .strict();
