import { z } from 'zod';

import { pricingLineSchema } from '@/features/jobs/pricing-schema';
import { money, subtractMoney, type Money } from '@/lib/money';
import type { PricingAdjustment, PricingLine } from '@/lib/pricing';
import type { Entity, Id } from '@/types/common';
import { AppError } from '@/types/common';

export const PAYMENT_STATUSES = ['unpaid', 'partial', 'paid'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  partial: 'Partly paid',
  paid: 'Paid',
};

export const PAYMENT_MODES = ['cash', 'upi', 'bank-transfer', 'cheque', 'card', 'other'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  cash: 'Cash',
  upi: 'UPI',
  'bank-transfer': 'Bank transfer',
  cheque: 'Cheque',
  card: 'Card',
  other: 'Other',
};

/**
 * A bill raised against a job.
 *
 * Like a quotation, everything on it is a snapshot taken when it was created:
 * the priced lines, the totals and the customer details. Re-pricing the job
 * afterwards cannot move a bill that has already gone to the customer.
 *
 * `paid` and `status` are the one exception, and they are not written by this
 * application at all - the database recomputes both from the payment history
 * whenever a payment is recorded.
 */
export interface Invoice extends Entity {
  invoiceNumber: string;
  jobId: Id;
  jobNumber: string;
  jobTitle: string;
  customerId: Id;
  customerName: string;
  customerMobile: string;
  customerBusinessName?: string | undefined;
  customerAddress?: string | undefined;
  customerGstin?: string | undefined;
  invoiceDate: Date;
  /** Copied from jobPricing at creation, never linked. */
  lines: PricingLine[];
  subtotal: Money;
  discount: PricingAdjustment | null;
  total: Money;
  paid: Money;
  status: PaymentStatus;
  notes?: string | undefined;
  terms?: string | undefined;
}

/** One receipt against one invoice. Payment history is append-only. */
export interface Payment {
  id: Id;
  invoiceId: Id;
  invoiceNumber: string;
  jobId: Id;
  customerId: Id;
  amount: Money;
  paidAt: Date;
  mode: PaymentMode;
  reference?: string | undefined;
  note?: string | undefined;
  recordedById: Id;
  recordedBy: string;
}

/** What is still owed on an invoice. Never negative: overpayment is refused. */
export function outstandingOf(invoice: Invoice): Money {
  return subtractMoney(invoice.total, invoice.paid);
}

export function isSettled(invoice: Invoice): boolean {
  return invoice.status === 'paid';
}

/**
 * The status an invoice should carry for a given amount received.
 *
 * The database is the authority - this exists so demo mode and the browser
 * agree with it without a round trip.
 */
export function paymentStatusFor(total: Money, paid: Money): PaymentStatus {
  if (paid.paise <= 0) return 'unpaid';
  if (paid.paise >= total.paise) return 'paid';
  return 'partial';
}

export const DEFAULT_INVOICE_TERMS = 'Payment due on delivery. Goods once sold are not taken back.';

/** What a person may type when raising a bill. The priced lines are never typed. */
export const invoiceFormSchema = z
  .object({
    discountRupees: z
      .string()
      .trim()
      .optional()
      .refine(
        (value) => !value || (Number.isFinite(Number(value)) && Number(value) >= 0),
        'Enter the discount as a number',
      ),
    discountReason: z.string().trim().max(200, 'Reason is too long').optional(),
    notes: z.string().trim().max(1000, 'Notes are too long').optional(),
    terms: z.string().trim().max(2000, 'Terms are too long').optional(),
  })
  .refine((value) => !Number(value.discountRupees ?? 0) || Boolean(value.discountReason?.trim()), {
    message: 'Say why the discount is being given',
    path: ['discountReason'],
  });

export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

export const paymentFormSchema = z.object({
  amountRupees: z
    .string()
    .trim()
    .min(1, 'Enter the amount received')
    .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, 'Enter a valid amount'),
  paidOn: z.string().min(1, 'Give the date it was received'),
  mode: z.enum(PAYMENT_MODES),
  reference: z.string().trim().max(120, 'Reference is too long').optional(),
  note: z.string().trim().max(500, 'Note is too long').optional(),
});

export type PaymentFormValues = z.infer<typeof paymentFormSchema>;

const moneySchema = z.object({ paise: z.number().int(), currency: z.literal('INR') });

const invoiceSchema = z.object({
  id: z.string().min(1),
  invoiceNumber: z.string().min(1),
  jobId: z.string().min(1),
  jobNumber: z.string(),
  jobTitle: z.string(),
  customerId: z.string().min(1),
  customerName: z.string(),
  customerMobile: z.string(),
  customerBusinessName: z.string().optional(),
  customerAddress: z.string().optional(),
  customerGstin: z.string().optional(),
  invoiceDate: z.date(),
  lines: z.array(pricingLineSchema).max(50),
  subtotal: moneySchema,
  discount: z.object({ amount: moneySchema, reason: z.string() }).nullable().default(null),
  total: moneySchema,
  paid: moneySchema,
  status: z.enum(PAYMENT_STATUSES),
  notes: z.string().optional(),
  terms: z.string().optional(),
  createdAt: z.date(),
  createdBy: z.string(),
  updatedAt: z.date(),
  updatedBy: z.string(),
});

export function parseInvoice(data: unknown, id: string): Invoice {
  const result = invoiceSchema.safeParse(data);
  if (!result.success) {
    throw new AppError('invalid-input', `Invoice "${id}" is malformed.`, result.error);
  }
  return result.data;
}

const paymentSchema = z.object({
  id: z.string().min(1),
  invoiceId: z.string().min(1),
  invoiceNumber: z.string(),
  jobId: z.string().min(1),
  customerId: z.string().min(1),
  amount: moneySchema,
  paidAt: z.date(),
  mode: z.enum(PAYMENT_MODES),
  reference: z.string().optional(),
  note: z.string().optional(),
  recordedById: z.string(),
  recordedBy: z.string(),
});

export function parsePayment(data: unknown, id: string): Payment {
  const result = paymentSchema.safeParse(data);
  if (!result.success) {
    throw new AppError('invalid-input', `Payment "${id}" is malformed.`, result.error);
  }
  return result.data;
}

/** Rupee text from a form turned into paise, rounded once. */
export function rupeesToMoney(value: string | undefined): Money {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return money(0);
  return money(Math.round(amount * 100));
}
