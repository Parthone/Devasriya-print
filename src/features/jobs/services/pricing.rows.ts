import type { JobPricingDocument } from '@/features/jobs/pricing-types';
import { parseJobPricing } from '@/features/jobs/pricing-types';
import type { MeasurementUnit } from '@/lib/measurement';
import type { PricingLine, PricingMethod, RateUnit } from '@/lib/pricing';
import { toAudit, toMoney, toNumber, toOptional, type AuditRow } from '@/lib/supabase/rows';

export interface PricingLineRow {
  id: string;
  position: number;
  product_id: string | null;
  product_name: string;
  pricing_method: PricingMethod;
  measurement_unit: MeasurementUnit | null;
  width: number | string | null;
  height: number | string | null;
  length: number | string | null;
  quantity: number | string;
  rate_paise: number | string;
  rate_unit: RateUnit;
  calculated_area: number | string | null;
  calculated_length: number | string | null;
  line_amount_paise: number | string;
  notes: string | null;
}

export interface JobPricingRow extends AuditRow {
  job_id: string;
  subtotal_paise: number | string;
  adjustment_paise: number | string | null;
  adjustment_reason: string | null;
  total_paise: number | string;
  job_pricing_lines?: PricingLineRow[];
}

export const PRICING_COLUMNS =
  'job_id, subtotal_paise, adjustment_paise, adjustment_reason, total_paise,' +
  ' created_at, created_by, updated_at, updated_by,' +
  ' job_pricing_lines(id, position, product_id, product_name, pricing_method,' +
  ' measurement_unit, width, height, length, quantity, rate_paise, rate_unit,' +
  ' calculated_area, calculated_length, line_amount_paise, notes)';

/**
 * One priced line as the discriminated union the calculator produces.
 *
 * The method decides which measurement fields are present, so the row is
 * reassembled into exactly the shape the zod schema and the UI expect rather
 * than a bag of nullable numbers.
 */
export function toPricingLine(row: PricingLineRow): PricingLine {
  const common = {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    quantity: Number(row.quantity),
    rate: toMoney(row.rate_paise),
    rateUnit: row.rate_unit,
    lineAmount: toMoney(row.line_amount_paise),
    ...(row.notes ? { notes: row.notes } : {}),
  };

  switch (row.pricing_method) {
    case 'per-square-foot':
    case 'per-square-meter':
      return {
        ...common,
        pricingMethod: row.pricing_method,
        width: toNumber(row.width) ?? 0,
        height: toNumber(row.height) ?? 0,
        measurementUnit: row.measurement_unit ?? 'foot',
        calculatedArea: toNumber(row.calculated_area) ?? 0,
      };
    case 'per-running-foot':
    case 'per-running-meter':
      return {
        ...common,
        pricingMethod: row.pricing_method,
        length: toNumber(row.length) ?? 0,
        measurementUnit: row.measurement_unit ?? 'foot',
        calculatedLength: toNumber(row.calculated_length) ?? 0,
      };
    default:
      return { ...common, pricingMethod: row.pricing_method };
  }
}

/** A priced line as the columns it is stored in. */
export function fromPricingLine(line: PricingLine) {
  const area = 'calculatedArea' in line ? line.calculatedArea : null;
  const length = 'calculatedLength' in line ? line.calculatedLength : null;
  return {
    product_id: line.productId,
    product_name: line.productName,
    pricing_method: line.pricingMethod,
    measurement_unit: 'measurementUnit' in line ? line.measurementUnit : null,
    width: 'width' in line ? line.width : null,
    height: 'height' in line ? line.height : null,
    length: 'length' in line ? line.length : null,
    quantity: line.quantity,
    rate_paise: line.rate.paise,
    rate_unit: line.rateUnit,
    calculated_area: area,
    calculated_length: length,
    line_amount_paise: line.lineAmount.paise,
    notes: line.notes ?? null,
  };
}

export function toJobPricingDocument(row: JobPricingRow): JobPricingDocument {
  const lines = [...(row.job_pricing_lines ?? [])]
    .sort((a, b) => a.position - b.position)
    .map(toPricingLine);

  const adjustmentPaise = row.adjustment_paise;
  return parseJobPricing(
    {
      id: row.job_id,
      jobId: row.job_id,
      lines,
      subtotal: toMoney(row.subtotal_paise),
      adjustment:
        adjustmentPaise === null || adjustmentPaise === undefined
          ? null
          : { amount: toMoney(adjustmentPaise), reason: toOptional(row.adjustment_reason) ?? '' },
      total: toMoney(row.total_paise),
      ...toAudit(row),
    },
    row.job_id,
  );
}
