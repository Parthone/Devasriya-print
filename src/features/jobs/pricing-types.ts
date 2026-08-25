import { z } from 'zod';

import { pricingLineSchema } from '@/features/jobs/pricing-schema';
import type { JobPricing } from '@/lib/pricing';
import type { Entity, Id } from '@/types/common';
import { AppError } from '@/types/common';

/**
 * Pricing for one job, stored as its own document at `jobPricing/{jobId}`.
 *
 * It lives apart from the job on purpose. A row level security policy gates a
 * rules, so money kept on the job document would be readable by anyone who may
 * read jobs - including designers and production, who deliberately have no
 * estimates:view. A separate document lets the rules gate the money itself.
 *
 * The document id is always the job id, so there is exactly one pricing record
 * per job and no query is needed to find it.
 */
export interface JobPricingDocument extends Entity, JobPricing {
  jobId: Id;
}

const moneySchema = z.object({
  paise: z.number().int(),
  currency: z.literal('INR'),
});

const jobPricingDocumentSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  lines: z.array(pricingLineSchema).max(50),
  subtotal: moneySchema,
  adjustment: z.object({ amount: moneySchema, reason: z.string() }).nullable().default(null),
  total: moneySchema,
  createdAt: z.date(),
  createdBy: z.string(),
  updatedAt: z.date(),
  updatedBy: z.string(),
});

export function parseJobPricing(data: unknown, id: string): JobPricingDocument {
  const result = jobPricingDocumentSchema.safeParse(data);
  if (!result.success) {
    throw new AppError('invalid-input', `Pricing for job "${id}" is malformed.`, result.error);
  }
  return result.data;
}

/** The calculation state, without the storage bookkeeping. */
export function toJobPricing(document: JobPricingDocument | null): JobPricing | null {
  if (!document) return null;
  return {
    lines: document.lines,
    subtotal: document.subtotal,
    adjustment: document.adjustment,
    total: document.total,
  };
}
