import { z } from 'zod';

/** Sales pipeline for following up sellers (platform admin only). */
export const LEAD_STAGES = ['new', 'contacted', 'interested', 'follow_up', 'converted', 'not_interested'];

export const adminLeadSchema = z
  .object({
    stage: z.enum(LEAD_STAGES).optional(),
    note: z.string().trim().max(1000).optional(),
    followUpAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullable().optional(),
  })
  .strict();
