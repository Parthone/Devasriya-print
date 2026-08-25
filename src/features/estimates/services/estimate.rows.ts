import { parseEstimate, type Estimate, type EstimateStatus } from '@/features/estimates/types';
import { toPricingLine, type PricingLineRow } from '@/features/jobs/services/pricing.rows';
import {
  toAudit,
  toDate,
  toDateOrNull,
  toMoney,
  toOptional,
  type AuditRow,
} from '@/lib/supabase/rows';

export interface EstimateRow extends AuditRow {
  id: string;
  estimate_number: string;
  job_id: string;
  job_number: string;
  job_title: string;
  customer_id: string;
  customer_name: string;
  customer_mobile: string;
  customer_business_name: string | null;
  customer_address: string | null;
  customer_gstin: string | null;
  estimate_date: string;
  valid_until: string;
  subtotal_paise: number | string;
  adjustment_paise: number | string | null;
  adjustment_reason: string | null;
  total_paise: number | string;
  notes: string | null;
  terms: string | null;
  status: EstimateStatus;
  sent_at: string | null;
  decision_outcome: 'approved' | 'rejected' | null;
  decision_at: string | null;
  decision_by_id: string | null;
  decision_by_name: string | null;
  decision_note: string | null;
  cancelled_at: string | null;
  estimate_lines?: PricingLineRow[];
}

export const ESTIMATE_COLUMNS =
  'id, estimate_number, job_id, job_number, job_title, customer_id, customer_name,' +
  ' customer_mobile, customer_business_name, customer_address, customer_gstin, estimate_date,' +
  ' valid_until, subtotal_paise, adjustment_paise, adjustment_reason, total_paise, notes, terms,' +
  ' status, sent_at, decision_outcome, decision_at, decision_by_id, decision_by_name,' +
  ' decision_note, cancelled_at, created_at, created_by, updated_at, updated_by,' +
  ' estimate_lines(id, position, product_id, product_name, pricing_method, measurement_unit,' +
  ' width, height, length, quantity, rate_paise, rate_unit, calculated_area, calculated_length,' +
  ' line_amount_paise, notes)';

export function toEstimate(row: EstimateRow): Estimate {
  const lines = [...(row.estimate_lines ?? [])]
    .sort((a, b) => a.position - b.position)
    .map(toPricingLine);

  const adjustmentPaise = row.adjustment_paise;

  return parseEstimate(
    {
      id: row.id,
      estimateNumber: row.estimate_number,
      jobId: row.job_id,
      jobNumber: row.job_number,
      jobTitle: row.job_title,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerMobile: row.customer_mobile,
      customerBusinessName: toOptional(row.customer_business_name),
      customerAddress: toOptional(row.customer_address),
      customerGstin: toOptional(row.customer_gstin),
      estimateDate: toDate(row.estimate_date),
      validUntil: toDate(row.valid_until),
      lines,
      subtotal: toMoney(row.subtotal_paise),
      adjustment:
        adjustmentPaise === null || adjustmentPaise === undefined
          ? null
          : { amount: toMoney(adjustmentPaise), reason: toOptional(row.adjustment_reason) ?? '' },
      total: toMoney(row.total_paise),
      notes: toOptional(row.notes),
      terms: toOptional(row.terms),
      status: row.status,
      sentAt: toDateOrNull(row.sent_at),
      decision: row.decision_outcome
        ? {
            outcome: row.decision_outcome,
            at: toDate(row.decision_at),
            byId: row.decision_by_id ?? '',
            byName: row.decision_by_name ?? '',
            ...(row.decision_note ? { note: row.decision_note } : {}),
          }
        : null,
      cancelledAt: toDateOrNull(row.cancelled_at),
      ...toAudit(row),
    },
    row.id,
  );
}
