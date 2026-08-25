import {
  parseInvoice,
  parsePayment,
  type Invoice,
  type Payment,
  type PaymentMode,
  type PaymentStatus,
} from '@/features/billing/types';
import { toPricingLine, type PricingLineRow } from '@/features/jobs/services/pricing.rows';
import { toAudit, toDate, toMoney, toOptional, type AuditRow } from '@/lib/supabase/rows';

export interface InvoiceRow extends AuditRow {
  id: string;
  invoice_number: string;
  job_id: string;
  job_number: string;
  job_title: string;
  customer_id: string;
  customer_name: string;
  customer_mobile: string;
  customer_business_name: string | null;
  customer_address: string | null;
  customer_gstin: string | null;
  invoice_date: string;
  subtotal_paise: number | string;
  discount_paise: number | string | null;
  discount_reason: string | null;
  total_paise: number | string;
  paid_paise: number | string;
  status: PaymentStatus;
  notes: string | null;
  terms: string | null;
  invoice_lines?: PricingLineRow[];
}

export const INVOICE_COLUMNS =
  'id, invoice_number, job_id, job_number, job_title, customer_id, customer_name,' +
  ' customer_mobile, customer_business_name, customer_address, customer_gstin, invoice_date,' +
  ' subtotal_paise, discount_paise, discount_reason, total_paise, paid_paise, status, notes,' +
  ' terms, created_at, created_by, updated_at, updated_by,' +
  ' invoice_lines(id, position, product_id, product_name, pricing_method, measurement_unit,' +
  ' width, height, length, quantity, rate_paise, rate_unit, calculated_area, calculated_length,' +
  ' line_amount_paise, notes)';

export function toInvoice(row: InvoiceRow): Invoice {
  const lines = [...(row.invoice_lines ?? [])]
    .sort((a, b) => a.position - b.position)
    .map(toPricingLine);
  const discountPaise = row.discount_paise;

  return parseInvoice(
    {
      id: row.id,
      invoiceNumber: row.invoice_number,
      jobId: row.job_id,
      jobNumber: row.job_number,
      jobTitle: row.job_title,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerMobile: row.customer_mobile,
      customerBusinessName: toOptional(row.customer_business_name),
      customerAddress: toOptional(row.customer_address),
      customerGstin: toOptional(row.customer_gstin),
      invoiceDate: toDate(row.invoice_date),
      lines,
      subtotal: toMoney(row.subtotal_paise),
      discount:
        discountPaise === null || discountPaise === undefined
          ? null
          : { amount: toMoney(discountPaise), reason: toOptional(row.discount_reason) ?? '' },
      total: toMoney(row.total_paise),
      paid: toMoney(row.paid_paise),
      status: row.status,
      notes: toOptional(row.notes),
      terms: toOptional(row.terms),
      ...toAudit(row),
    },
    row.id,
  );
}

export interface PaymentRow {
  id: string;
  invoice_id: string;
  invoice_number: string;
  job_id: string;
  customer_id: string;
  amount_paise: number | string;
  paid_at: string;
  mode: PaymentMode;
  reference: string | null;
  note: string | null;
  recorded_by_id: string;
  recorded_by: string;
}

export const PAYMENT_COLUMNS =
  'id, invoice_id, invoice_number, job_id, customer_id, amount_paise, paid_at, mode, reference,' +
  ' note, recorded_by_id, recorded_by';

export function toPayment(row: PaymentRow): Payment {
  return parsePayment(
    {
      id: row.id,
      invoiceId: row.invoice_id,
      invoiceNumber: row.invoice_number,
      jobId: row.job_id,
      customerId: row.customer_id,
      amount: toMoney(row.amount_paise),
      paidAt: toDate(row.paid_at),
      mode: row.mode,
      reference: toOptional(row.reference),
      note: toOptional(row.note),
      recordedById: row.recorded_by_id,
      recordedBy: row.recorded_by,
    },
    row.id,
  );
}
