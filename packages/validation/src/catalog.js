import { z } from 'zod';
import {
  businessName, categoryName, cursor, money, objectId, objectKey, optionLabel, optionalProse,
  pageLimit, productName, queryInt, searchQuery, shortText, sku, tag,
} from './primitives.js';

/**
 * Catalogue schemas. Every object is `.strict()`: unknown keys are rejected, not dropped.
 */

export const productImageSchema = z
  .object({
    imageKey: objectKey,
    thumbKey: objectKey.optional(),
    alt: shortText(0, 200, 'Alt text').optional(),
    sortOrder: z.number().int().min(0).max(50).default(0),
    width: z.number().int().positive().max(10000).optional(),
    height: z.number().int().positive().max(10000).optional(),
  })
  .strict();

export const variantInputSchema = z
  .object({
    variantId: objectId.optional(),
    attributes: z
      .record(optionLabel(40), optionLabel(60))
      .refine((v) => Object.keys(v).length > 0 && Object.keys(v).length <= 4, 'Use between 1 and 4 options'),
    sku: sku.optional(),
    price: money,
    mrp: money.optional(),
    stock: z.number().int().min(0).max(1_000_000).default(0),
    imageKey: objectKey.optional(),
    active: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(200).default(0),
  })
  .strict();

const productFields = {
  name: productName,
  description: optionalProse(8000, { label: 'Description' }),
  summary: optionalProse(200, { multiline: false, label: 'Summary' }),
  price: money.refine((v) => v > 0, 'Set a price above zero'),
  mrp: money.optional(),
  sku: sku.optional(),
  categoryId: objectId.nullable().optional(),
  tags: z.array(tag).max(20).default([]),
  brand: businessName.optional(),
  images: z.array(productImageSchema).max(12).default([]),
  stock: z.number().int().min(0).max(1_000_000).default(0),
  trackInventory: z.boolean().default(true),
  allowBackorder: z.boolean().default(false),
  lowStockThreshold: z.number().int().min(0).max(10_000).default(5),
  variantOptions: z
    .array(z.object({ name: optionLabel(40), values: z.array(optionLabel(60)).min(1).max(30) }).strict())
    .max(4)
    .default([]),
  variants: z.array(variantInputSchema).max(100).default([]),
  active: z.boolean().default(true),
  featured: z.boolean().default(false),
  isNew: z.boolean().default(false),
  onSale: z.boolean().default(false),
};

/** MRP below selling price would render a negative discount on the storefront. */
const checkPricing = (data, ctx) => {
  if (data.mrp !== undefined && data.mrp > 0 && data.price !== undefined && data.mrp < data.price) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mrp'], message: 'MRP cannot be lower than the selling price' });
  }
  if (Array.isArray(data.variants) && data.variants.length > 0) {
    const seen = new Set();
    data.variants.forEach((v, i) => {
      const fingerprint = JSON.stringify(Object.entries(v.attributes ?? {}).sort());
      if (seen.has(fingerprint)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['variants', i], message: 'Duplicate variant combination' });
      }
      seen.add(fingerprint);
    });
  }
  if (Array.isArray(data.tags) && new Set(data.tags.map((t) => t.toLowerCase())).size !== data.tags.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tags'], message: 'Each tag can only be added once' });
  }
};

export const createProductSchema = z.object(productFields).strict().superRefine(checkPricing);

export const updateProductSchema = z.object(productFields).strict().partial().superRefine(checkPricing);

export const productQuerySchema = z
  .object({
    q: searchQuery,
    categoryId: objectId.optional(),
    active: z.enum(['true', 'false', 'all']).default('all'),
    stock: z.enum(['in', 'low', 'out', 'all']).default('all'),
    sort: z.enum(['newest', 'oldest', 'price_asc', 'price_desc', 'name', 'stock_asc', 'popular']).default('newest'),
    cursor,
    limit: pageLimit(100, 20),
  })
  .strict();

export const updateStockSchema = z
  .object({
    variantId: objectId.nullable().optional(),
    /** `set` replaces the value, `adjust` applies a signed delta via a conditional write. */
    operation: z.enum(['set', 'adjust']).default('set'),
    value: z.number().int().min(-1_000_000).max(1_000_000),
    reason: z.enum(['manual', 'restock', 'damage', 'correction', 'return']).default('manual'),
    note: optionalProse(200, { multiline: false, label: 'Note' }),
  })
  .strict()
  // A stock level is never negative. A negative delta is fine; a negative absolute is not.
  .refine((v) => v.operation === 'adjust' || v.value >= 0, {
    path: ['value'],
    message: 'Stock cannot be set below zero',
  });

export const bulkStockSchema = z
  .object({
    updates: z
      .array(
        z
          .object({
            productId: objectId,
            variantId: objectId.nullable().optional(),
            stock: z.number().int().min(0).max(1_000_000),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();

export const createCategorySchema = z
  .object({
    name: categoryName,
    description: optionalProse(500, { label: 'Description' }),
    parentId: objectId.nullable().optional(),
    imageKey: objectKey.optional(),
    sortOrder: z.number().int().min(0).max(1000).default(0),
    active: z.boolean().default(true),
  })
  .strict();

export const updateCategorySchema = createCategorySchema.partial();

export const reorderCategoriesSchema = z
  .object({
    order: z
      .array(z.object({ categoryId: objectId, sortOrder: z.number().int().min(0).max(1000) }).strict())
      .min(1)
      .max(200)
      .refine((items) => new Set(items.map((i) => i.categoryId)).size === items.length, 'Each category can appear once'),
  })
  .strict();

export const publicProductQuerySchema = z
  .object({
    q: searchQuery,
    /** A category is addressed on the storefront by its slug. */
    category: z.string().trim().regex(/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/, 'Unknown category').optional(),
    minPrice: queryInt({ min: 0, max: 100_000_000 }),
    maxPrice: queryInt({ min: 0, max: 100_000_000 }),
    inStock: z.enum(['true', 'false']).optional(),
    tag: z.string().trim().max(30).regex(/^[\p{L}\p{M}\p{N} -]*$/u, 'Unknown tag').optional(),
    sort: z.enum(['newest', 'price_asc', 'price_desc', 'popular', 'discount']).default('newest'),
    cursor,
    limit: pageLimit(48, 24),
  })
  .strict()
  .refine((v) => v.minPrice === undefined || v.maxPrice === undefined || v.minPrice <= v.maxPrice, {
    path: ['maxPrice'],
    message: 'The maximum price must be at least the minimum',
  });
