import { z } from 'zod';
import {
  businessName, email, mobile, opaqueId, optionalProse, otpCode, password,
  personName, placeName, refreshToken, shortText, storeSlug,
} from './primitives.js';
import { BUSINESS_CATEGORIES } from '@storekit/shared';

/**
 * Every object here is `.strict()`: a key the schema does not name is a 400, not a
 * silently dropped field. A client sending `role: "owner"` on signup is either buggy or
 * probing, and in both cases the right answer is to say no.
 */

/** Stable per-install id used for session listing and new-device alerts. */
const deviceId = opaqueId(8, 128, 'Device id');
const deviceName = shortText(1, 120, 'Device name');

export const signupSchema = z
  .object({
    name: personName,
    email,
    password,
    /**
     * Required, because login authenticates on email + mobile + password. An account
     * created without a number could never sign in again.
     */
    phone: mobile,
    /** Consent captured at signup and stored with a timestamp for DPDP compliance. */
    acceptedTerms: z.literal(true, { errorMap: () => ({ message: 'Accept the terms to continue' }) }),
    marketingOptIn: z.boolean().default(false),
  })
  .strict();

export const loginSchema = z
  .object({
    email,
    mobile,
    // Not the full password rules: an existing password predates any rule change, and a
    // login form must never tell someone their stored password is now "invalid".
    password: z.string().min(1, 'Enter your password').max(128, 'Password is too long'),
    deviceId: deviceId.optional(),
    deviceName: deviceName.optional(),
  })
  .strict();

export const otpPurposeSchema = z.enum(['email_verification', 'login', 'password_reset']);

export const requestOtpSchema = z.object({ email, purpose: otpPurposeSchema }).strict();

export const verifyOtpSchema = z
  .object({
    email,
    purpose: otpPurposeSchema,
    code: otpCode,
    deviceId: deviceId.optional(),
    deviceName: deviceName.optional(),
  })
  .strict();

/** The refresh token arrives in the body (the app) or in an httpOnly cookie (the web). */
export const refreshSchema = z.object({ refreshToken: refreshToken.optional() }).strict();

export const forgotPasswordSchema = z.object({ email }).strict();

export const resetPasswordSchema = z.object({ email, code: otpCode, newPassword: password }).strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(128),
    newPassword: password,
  })
  .strict()
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'Choose a password you have not used here before',
  });

export const updateProfileSchema = z
  .object({
    name: personName.optional(),
    phone: mobile.optional(),
    marketingOptIn: z.boolean().optional(),
  })
  .strict();

export const createBusinessSchema = z
  .object({
    name: businessName,
    slug: storeSlug,
    description: optionalProse(500, { label: 'Description' }),
    category: z.enum(BUSINESS_CATEGORIES).default('other'),
    contactPhone: mobile.optional(),
    whatsapp: mobile.optional(),
    city: placeName.optional(),
    state: placeName.optional(),
  })
  .strict();

export const slugAvailabilitySchema = z.object({ slug: storeSlug }).strict();

export const inviteMemberSchema = z
  .object({
    email,
    role: z.enum(['manager', 'staff']),
  })
  .strict();
