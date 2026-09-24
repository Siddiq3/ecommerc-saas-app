import { z } from 'zod';
import {
  ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES, addressLine, businessName, dateOnly, email, emptyable,
  hexColor, httpsUrl, imageFileName, mobile, money, objectId, objectKey, opaqueId, optionalProse,
  pageSlug, personName, pincode, placeName, prose, relativePath, shortText, siteUrl, storeSlug, upiId,
} from './primitives.js';

/**
 * Store configuration schemas. Every object is `.strict()`: unknown keys are rejected.
 *
 * Most of what is saved here is rendered on the public storefront, to shoppers who never
 * agreed to trust the merchant's input. Links are https-only, text cannot carry markup,
 * and image references must be keys this system generated.
 */

export const themeSchema = z
  .object({
    primaryColor: hexColor.default('#2563EB'),
    secondaryColor: hexColor.default('#0F172A'),
    buttonColor: hexColor.default('#2563EB'),
    buttonTextColor: hexColor.default('#FFFFFF'),
    backgroundColor: hexColor.default('#FFFFFF'),
    fontFamily: z.enum(['system', 'inter', 'poppins', 'dm-sans']).default('system'),
    layout: z.enum(['grid', 'list']).default('grid'),
    cornerRadius: z.enum(['none', 'small', 'medium', 'large']).default('medium'),
  })
  .strict();

const pincodePrefix = z.string().regex(/^[1-9]\d{0,5}$/, 'Use the first 1–6 digits of a pincode');

export const deliveryRulesSchema = z
  .object({
    mode: z.enum(['free', 'fixed', 'free_above', 'disabled']).default('free'),
    fixedFee: money.default(0),
    freeAboveSubtotal: money.default(0),
    pincodeRules: z
      .array(z.object({ pincodePrefix, fee: money, enabled: z.boolean().default(true) }).strict())
      .max(200)
      .default([]),
    estimatedDaysMin: z.number().int().min(0).max(60).default(2),
    estimatedDaysMax: z.number().int().min(0).max(90).default(7),
    servicablePincodePrefixes: z.array(pincodePrefix).max(500).default([]),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.mode === 'free_above' && d.freeAboveSubtotal <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['freeAboveSubtotal'], message: 'Set the order value that unlocks free delivery' });
    }
    if ((d.mode === 'fixed' || d.mode === 'free_above') && d.fixedFee <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fixedFee'], message: 'Set a delivery charge above zero' });
    }
    if (d.estimatedDaysMax < d.estimatedDaysMin) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['estimatedDaysMax'], message: 'Maximum days must be at least the minimum' });
    }
    const prefixes = d.pincodeRules.map((r) => r.pincodePrefix);
    if (new Set(prefixes).size !== prefixes.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pincodeRules'], message: 'Each pincode prefix can only have one rule' });
    }
  });

export const paymentSettingsSchema = z
  .object({
    codEnabled: z.boolean().default(true),
    codMaxOrderValue: money.default(0),
    upiEnabled: z.boolean().default(false),
    upiId: emptyable(upiId),
    upiPayeeName: personName.optional().or(businessName.optional()),
    upiQrImageKey: objectKey.optional(),
    upiRequireUtr: z.boolean().default(true),
    upiAllowScreenshot: z.boolean().default(true),
    upiPendingExpiryMinutes: z.number().int().min(0).max(4320).default(1440),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.upiEnabled && !d.upiId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['upiId'], message: 'Add your UPI ID before turning on UPI payments' });
    }
    if (!d.codEnabled && !d.upiEnabled) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['codEnabled'], message: 'Keep at least one payment method switched on' });
    }
  });

export const cancellationRulesSchema = z
  .object({
    customerCancellationEnabled: z.boolean().default(true),
    latestStage: z.enum(['NEW', 'CONFIRMED', 'PREPARING', 'READY_TO_SHIP']).default('CONFIRMED'),
    graceMinutes: z.number().int().min(0).max(1440).default(30),
    requireReason: z.boolean().default(false),
  })
  .strict();

export const storePageSchema = z
  .object({
    slug: pageSlug,
    title: shortText(2, 80, 'Title'),
    /**
     * Markdown. "<" is refused outright, so no page body can ever contain an HTML tag —
     * the renderer does not have to be trusted to strip one.
     */
    body: prose(20000, { label: 'Page content' }),
    published: z.boolean().default(true),
  })
  .strict();

export const updateStoreSettingsSchema = z
  .object({
    theme: themeSchema.partial().optional(),
    banners: z
      .array(
        z
          .object({
            imageKey: objectKey,
            link: emptyable(httpsUrl),
            alt: shortText(0, 120, 'Alt text').default(''),
            sortOrder: z.number().int().min(0).max(20).default(0),
          })
          .strict(),
      )
      .max(10)
      .optional(),
    announcement: z
      .object({ text: shortText(0, 200, 'Announcement'), enabled: z.boolean() })
      .strict()
      .refine((a) => !a.enabled || a.text.length > 0, { path: ['text'], message: 'Write the announcement before turning it on' })
      .optional(),
    featuredCategoryIds: z.array(objectId).max(12).optional(),
    featuredProductIds: z.array(objectId).max(24).optional(),
    sections: z
      .array(
        z
          .object({
            type: z.enum(['new_arrivals', 'best_sellers', 'sale', 'featured']),
            enabled: z.boolean(),
            title: shortText(1, 60, 'Section title'),
            sortOrder: z.number().int().min(0).max(20),
          })
          .strict(),
      )
      .max(8)
      .optional(),
    social: z
      .object({
        instagram: emptyable(siteUrl(['instagram.com'], 'Instagram')),
        facebook: emptyable(siteUrl(['facebook.com', 'fb.com'], 'Facebook')),
        youtube: emptyable(siteUrl(['youtube.com', 'youtu.be'], 'YouTube')),
        x: emptyable(siteUrl(['x.com', 'twitter.com'], 'X')),
        website: emptyable(httpsUrl),
      })
      .strict()
      .optional(),
    footerText: optionalProse(500, { label: 'Footer text' }),
    payments: paymentSettingsSchema.optional(),
    delivery: deliveryRulesSchema.optional(),
    cancellation: cancellationRulesSchema.optional(),
    pages: z
      .array(storePageSchema)
      .max(20)
      .refine((pages) => new Set(pages.map((p) => p.slug)).size === pages.length, 'Two pages share the same link')
      .optional(),
    orderingPaused: z.boolean().optional(),
    orderingPausedMessage: optionalProse(200, { multiline: false, label: 'Paused message' }),
  })
  .strict();

export const updateBusinessSchema = z
  .object({
    name: businessName.optional(),
    description: optionalProse(500, { label: 'Description' }),
    logoKey: objectKey.optional(),
    faviconKey: objectKey.optional(),
    contact: z
      .object({
        email: emptyable(email),
        phone: mobile.optional(),
        whatsapp: mobile.optional(),
        addressLine: addressLine(2, 200).optional().or(z.literal('')),
        city: placeName.optional().or(z.literal('')),
        state: placeName.optional().or(z.literal('')),
        pincode: emptyable(pincode),
      })
      .strict()
      .optional(),
  })
  .strict();

/** Changing a slug breaks every shared link, so it is separate and heavily rate limited. */
export const changeSlugSchema = z
  .object({
    slug: storeSlug,
    confirm: z.literal(true, { errorMap: () => ({ message: 'Confirm that existing links will stop working' }) }),
  })
  .strict();

/* ───────────── Uploads ───────────── */

export const uploadAuthorizationSchema = z
  .object({
    purpose: z.enum(['product', 'category', 'logo', 'banner', 'favicon', 'qr', 'payment_proof']),
    contentType: z.enum(ALLOWED_IMAGE_TYPES),
    sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES, 'Images must be 8MB or smaller'),
    /** Extension hint only. The storage key is always generated on the server. */
    originalName: imageFileName.optional(),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid checksum').optional(),
    productId: objectId.optional(),
  })
  .strict()
  .refine((v) => v.purpose === 'product' || !v.productId, {
    path: ['productId'],
    message: 'Only product images belong to a product',
  });

export const confirmUploadSchema = z
  .object({
    uploadId: objectId,
    width: z.number().int().positive().max(20000).optional(),
    height: z.number().int().positive().max(20000).optional(),
  })
  .strict();

/* ───────────── Analytics ───────────── */

export const trackEventSchema = z
  .object({
    event: z.enum([
      'store_view', 'page_view', 'product_view', 'category_view', 'search',
      'add_to_cart', 'remove_from_cart', 'checkout_started', 'checkout_failed', 'coupon_applied',
    ]),
    /** Rotating anonymous client id. Never linked to a customer record. */
    sessionId: opaqueId(8, 64, 'Session'),
    path: relativePath.optional(),
    productId: objectId.optional(),
    categoryId: objectId.optional(),
    searchTerm: shortText(0, 120, 'Search').optional(),
    quantity: z.number().int().min(1).max(99).optional(),
    /** Only the referring origin is useful, and only an http(s) one is real. */
    referrer: z.string().max(300).regex(/^https?:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?(?:\/[^\s<>"]*)?$/, 'Invalid referrer').optional(),
  })
  .strict();

export const trackEventBatchSchema = z
  .object({
    events: z.array(trackEventSchema).min(1).max(20),
  })
  .strict();

export const analyticsQuerySchema = z
  .object({
    from: dateOnly.optional(),
    to: dateOnly.optional(),
    preset: z.enum(['today', 'yesterday', '7d', '30d', '90d', 'custom']).default('7d'),
  })
  .strict()
  .refine((v) => v.preset !== 'custom' || (v.from && v.to), {
    path: ['from'],
    message: 'Choose both a start and an end date',
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    path: ['to'],
    message: 'The end date must be on or after the start date',
  });
