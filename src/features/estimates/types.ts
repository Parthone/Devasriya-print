import { z } from 'zod';

import { pricingLineSchema } from '@/features/jobs/pricing-schema';
import type { Money } from '@/lib/money';
import type { PricingAdjustment, PricingLine } from '@/lib/pricing';
import type { Entity, Id } from '@/types/common';
import { AppError } from '@/types/common';

export const ESTIMATE_STATUSES = [
  'draft',
  'sent',
  'approved',
  'rejected',
  'expired',
  'cancelled',
] as const;
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];

export const ESTIMATE_STATUS_LABELS: Record<EstimateStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  approved: 'Approved',
  rejected: 'Rejected',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

/**
 * Allowed moves.
 *
 * A quotation that has left the office cannot quietly go back to being a
 * draft, and a decision the customer has given is final. Anything not listed
 * here is refused by the service and by the security rules.
 */
export const ESTIMATE_TRANSITIONS: Record<EstimateStatus, EstimateStatus[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['approved', 'rejected', 'expired', 'cancelled'],
  approved: [],
  rejected: [],
  expired: [],
  cancelled: [],
};

export function canTransition(from: EstimateStatus, to: EstimateStatus): boolean {
  return ESTIMATE_TRANSITIONS[from].includes(to);
}

/** Only a draft may have its wording and validity changed. */
export function isEditable(status: EstimateStatus): boolean {
  return status === 'draft';
}

export function isFinished(status: EstimateStatus): boolean {
  return ESTIMATE_TRANSITIONS[status].length === 0;
}

export interface EstimateDecision {
  outcome: 'approved' | 'rejected';
  at: Date;
  /** The staff member who recorded what the customer said. */
  byId: Id;
  byName: string;
  note?: string | undefined;
}

/**
 * A quotation given to a customer.
 *
 * Everything on it is a snapshot taken when it was created: the priced lines,
 * the totals and the customer details. Nothing is read back from the job, the
 * job pricing or the rate card, so a later change to any of those cannot move a
 * quotation that has already gone out.
 */
export interface Estimate extends Entity {
  estimateNumber: string;
  jobId: Id;
  jobNumber: string;
  jobTitle: string;
  customerId: Id;
  customerName: string;
  customerMobile: string;
  customerBusinessName?: string | undefined;
  customerAddress?: string | undefined;
  customerGstin?: string | undefined;
  estimateDate: Date;
  validUntil: Date;
  /** Copied from jobPricing at creation, never linked. */
  lines: PricingLine[];
  subtotal: Money;
  adjustment: PricingAdjustment | null;
  total: Money;
  notes?: string | undefined;
  terms?: string | undefined;
  status: EstimateStatus;
  sentAt?: Date | null;
  decision?: EstimateDecision | null;
  cancelledAt?: Date | null;
}

/** What a person may type: wording and validity only. Money is never typed. */
export const estimateFormSchema = z.object({
  validUntil: z.string().min(1, 'Give the quotation a validity date'),
  notes: z.string().trim().max(1000, 'Notes are too long').optional(),
  terms: z.string().trim().max(2000, 'Terms are too long').optional(),
});

export type EstimateFormValues = z.infer<typeof estimateFormSchema>;

export const DEFAULT_VALIDITY_DAYS = 15;

export const DEFAULT_TERMS =
  '50% advance with the order, balance before delivery. Prices hold until the validity date above.';

const moneySchema = z.object({
  paise: z.number().int(),
  currency: z.literal('INR'),
});

const estimateSchema = z.object({
  id: z.string().min(1),
  estimateNumber: z.string().min(1),
  jobId: z.string().min(1),
  jobNumber: z.string(),
  jobTitle: z.string(),
  customerId: z.string().min(1),
  customerName: z.string(),
  customerMobile: z.string(),
  customerBusinessName: z.string().optional(),
  customerAddress: z.string().optional(),
  customerGstin: z.string().optional(),
  estimateDate: z.date(),
  validUntil: z.date(),
  lines: z.array(pricingLineSchema).max(50),
  subtotal: moneySchema,
  adjustment: z.object({ amount: moneySchema, reason: z.string() }).nullable().default(null),
  total: moneySchema,
  notes: z.string().optional(),
  terms: z.string().optional(),
  status: z.enum(ESTIMATE_STATUSES),
  sentAt: z.date().nullable().default(null),
  decision: z
    .object({
      outcome: z.enum(['approved', 'rejected']),
      at: z.date(),
      byId: z.string().min(1),
      byName: z.string(),
      note: z.string().optional(),
    })
    .nullable()
    .default(null),
  cancelledAt: z.date().nullable().default(null),
  createdAt: z.date(),
  createdBy: z.string(),
  updatedAt: z.date(),
  updatedBy: z.string(),
});

export function parseEstimate(data: unknown, id: string): Estimate {
  const result = estimateSchema.safeParse(data);
  if (!result.success) {
    throw new AppError('invalid-input', `Estimate "${id}" is malformed.`, result.error);
  }
  return result.data;
}
