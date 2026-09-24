import { z } from 'zod';

/**
 * Custom-domain input.
 *
 * What is checked here is only the shape of the request: it is text, and it is a sane
 * length. Whether that text is a *usable domain* — no scheme, path or port; not an apex;
 * not one of ours — is decided in one place, by `normalizeHostname` and the claim rules on
 * the server, because those verdicts carry a stable `reason` and advice ("use
 * www.example.com") that a generic schema message cannot. Splitting the same decision across
 * two layers is how they end up disagreeing.
 */

export const addDomainSchema = z
  .object({
    hostname: z
      .string({ invalid_type_error: 'Domain must be text', required_error: 'Enter a domain name' })
      .trim()
      .min(1, 'Enter a domain name')
      .max(300, 'That domain name is too long'),
  })
  .strict();

/**
 * `enabled` turns serving off and on; `isPrimary` chooses the address the store redirects to.
 * At least one is required, so an empty patch is a mistake rather than a quiet no-op.
 */
export const updateDomainSchema = z
  .object({
    isPrimary: z.boolean().optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.isPrimary !== undefined || v.enabled !== undefined, 'Send isPrimary or enabled');

/** The public host-resolution lookup: a Host header value, and nothing else. */
export const hostResolveQuerySchema = z
  .object({
    host: z.string({ required_error: 'host is required' }).trim().min(1, 'host is required').max(300, 'host is too long'),
  })
  .strict();
