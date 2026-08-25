import {
  MICROMETRES_PER_UNIT,
  isValidMeasurement,
  toMicrometres,
  type MeasurementUnit,
} from '@/lib/measurement';
import { money, type Money } from '@/lib/money';
import type { Id } from '@/types/common';

export const PRICING_METHODS = [
  'per-square-foot',
  'per-square-meter',
  'per-running-foot',
  'per-running-meter',
  'per-piece',
  'flat-rate',
] as const;
export type PricingMethod = (typeof PRICING_METHODS)[number];

export const PRICING_METHOD_LABELS: Record<PricingMethod, string> = {
  'per-square-foot': 'Per square foot',
  'per-square-meter': 'Per square metre',
  'per-running-foot': 'Per running foot',
  'per-running-meter': 'Per running metre',
  'per-piece': 'Per piece',
  'flat-rate': 'Flat rate',
};

export const RATE_UNITS = ['sq-ft', 'sq-m', 'running-ft', 'running-m', 'piece', 'flat'] as const;
export type RateUnit = (typeof RATE_UNITS)[number];

export const RATE_UNIT_LABELS: Record<RateUnit, string> = {
  'sq-ft': 'sq ft',
  'sq-m': 'sq m',
  'running-ft': 'running ft',
  'running-m': 'running m',
  piece: 'piece',
  flat: 'job',
};

/** The rate unit is decided by the method; it is never chosen separately. */
export const RATE_UNIT_FOR_METHOD: Record<PricingMethod, RateUnit> = {
  'per-square-foot': 'sq-ft',
  'per-square-meter': 'sq-m',
  'per-running-foot': 'running-ft',
  'per-running-meter': 'running-m',
  'per-piece': 'piece',
  'flat-rate': 'flat',
};

export type AreaMethod = 'per-square-foot' | 'per-square-meter';
export type LengthMethod = 'per-running-foot' | 'per-running-meter';

export function isAreaMethod(method: PricingMethod): method is AreaMethod {
  return method === 'per-square-foot' || method === 'per-square-meter';
}

export function isLengthMethod(method: PricingMethod): method is LengthMethod {
  return method === 'per-running-foot' || method === 'per-running-meter';
}

export function needsQuantity(method: PricingMethod): boolean {
  return method !== 'flat-rate';
}

/** Micrometres in one unit of the rate: the exact divisor for each method. */
const AREA_DIVISOR: Record<AreaMethod, bigint> = {
  'per-square-foot': MICROMETRES_PER_UNIT.foot * MICROMETRES_PER_UNIT.foot,
  'per-square-meter': MICROMETRES_PER_UNIT.meter * MICROMETRES_PER_UNIT.meter,
};

const LENGTH_DIVISOR: Record<LengthMethod, bigint> = {
  'per-running-foot': MICROMETRES_PER_UNIT.foot,
  'per-running-meter': MICROMETRES_PER_UNIT.meter,
};

/** Rounds a rational to whole paise, half away from zero. Exact throughout. */
function roundToPaise(numerator: bigint, denominator: bigint): number {
  const half = denominator / 2n;
  const rounded =
    numerator >= 0n ? (numerator + half) / denominator : -((-numerator + half) / denominator);
  return Number(rounded);
}

/** How many decimals a stored area or length keeps. */
const MEASURE_DECIMALS = 4n;
const MEASURE_SCALE = 10n ** MEASURE_DECIMALS;

function toMeasureNumber(numerator: bigint, denominator: bigint): number {
  const scaled = (numerator * MEASURE_SCALE + denominator / 2n) / denominator;
  return Number(scaled) / Number(MEASURE_SCALE);
}

/**
 * A priced item on a job.
 *
 * Everything needed to reproduce the calculation later is stored on the line:
 * the entered dimensions and their unit, the quantity, the rate actually used
 * and the resulting amount. Nothing is ever read back from the rate card, so a
 * price change tomorrow cannot move an old job.
 */
interface PricingLineCommon {
  id: string;
  productId: Id | null;
  productName: string;
  rate: Money;
  rateUnit: RateUnit;
  quantity: number;
  lineAmount: Money;
  notes?: string | undefined;
}

export interface AreaPricingLine extends PricingLineCommon {
  pricingMethod: 'per-square-foot' | 'per-square-meter';
  width: number;
  height: number;
  measurementUnit: MeasurementUnit;
  /** Area in the rate unit, e.g. square feet. */
  calculatedArea: number;
}

export interface LengthPricingLine extends PricingLineCommon {
  pricingMethod: 'per-running-foot' | 'per-running-meter';
  length: number;
  measurementUnit: MeasurementUnit;
  /** Length in the rate unit, e.g. running feet. */
  calculatedLength: number;
}

export interface PiecePricingLine extends PricingLineCommon {
  pricingMethod: 'per-piece';
}

export interface FlatPricingLine extends PricingLineCommon {
  pricingMethod: 'flat-rate';
}

export type PricingLine = AreaPricingLine | LengthPricingLine | PiecePricingLine | FlatPricingLine;

export interface PricingLineInput {
  id: string;
  productId: Id | null;
  productName: string;
  pricingMethod: PricingMethod;
  measurementUnit: MeasurementUnit;
  width?: number | undefined;
  height?: number | undefined;
  length?: number | undefined;
  quantity: number;
  /** Rate in paise, for the unit the method implies. */
  rate: Money;
  notes?: string | undefined;
}

export type PricingErrorCode =
  | 'missing-width'
  | 'missing-height'
  | 'missing-length'
  | 'invalid-measurement'
  | 'invalid-quantity'
  | 'invalid-rate'
  | 'missing-product-name';

export const PRICING_ERROR_MESSAGES: Record<PricingErrorCode, string> = {
  'missing-width': 'Enter a width.',
  'missing-height': 'Enter a height.',
  'missing-length': 'Enter a length.',
  'invalid-measurement': 'Measurements must be greater than zero.',
  'invalid-quantity': 'Quantity must be a whole number of at least 1.',
  'invalid-rate': 'Rate cannot be negative.',
  'missing-product-name': 'Give the line a description.',
};

export type PricingResult = { ok: true; line: PricingLine } | { ok: false; code: PricingErrorCode };

function validateCommon(input: PricingLineInput): PricingErrorCode | null {
  if (!input.productName.trim()) return 'missing-product-name';
  if (!Number.isFinite(input.rate.paise) || input.rate.paise < 0) return 'invalid-rate';

  if (needsQuantity(input.pricingMethod)) {
    if (!Number.isInteger(input.quantity) || input.quantity < 1) return 'invalid-quantity';
  }

  return null;
}

/**
 * Turns entered values into a priced line.
 *
 * The same function drives the live preview in the form and the value that is
 * saved, so what somebody sees before saving is exactly what is stored. All the
 * arithmetic happens in BigInt over exact integers, and the result is rounded
 * once, half away from zero, to whole paise.
 */
export function calculateLine(input: PricingLineInput): PricingResult {
  const invalid = validateCommon(input);
  if (invalid) return { ok: false, code: invalid };

  const method = input.pricingMethod;
  const ratePaise = BigInt(input.rate.paise);
  const quantity = BigInt(needsQuantity(method) ? input.quantity : 1);
  const common: PricingLineCommon = {
    id: input.id,
    productId: input.productId,
    productName: input.productName.trim(),
    rate: input.rate,
    rateUnit: RATE_UNIT_FOR_METHOD[method],
    quantity: needsQuantity(method) ? input.quantity : 1,
    lineAmount: money(0),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  };

  if (isAreaMethod(method)) {
    if (input.width === undefined) return { ok: false, code: 'missing-width' };
    if (input.height === undefined) return { ok: false, code: 'missing-height' };
    if (!isValidMeasurement(input.width) || !isValidMeasurement(input.height)) {
      return { ok: false, code: 'invalid-measurement' };
    }

    const widthUm = toMicrometres(input.width, input.measurementUnit);
    const heightUm = toMicrometres(input.height, input.measurementUnit);
    const divisor = AREA_DIVISOR[method];
    const areaUm2 = widthUm * heightUm;

    return {
      ok: true,
      line: {
        ...common,
        pricingMethod: method,
        width: input.width,
        height: input.height,
        measurementUnit: input.measurementUnit,
        calculatedArea: toMeasureNumber(areaUm2, divisor),
        lineAmount: money(roundToPaise(ratePaise * areaUm2 * quantity, divisor)),
      },
    };
  }

  if (isLengthMethod(method)) {
    if (input.length === undefined) return { ok: false, code: 'missing-length' };
    if (!isValidMeasurement(input.length)) return { ok: false, code: 'invalid-measurement' };

    const lengthUm = toMicrometres(input.length, input.measurementUnit);
    const divisor = LENGTH_DIVISOR[method];

    return {
      ok: true,
      line: {
        ...common,
        pricingMethod: method,
        length: input.length,
        measurementUnit: input.measurementUnit,
        calculatedLength: toMeasureNumber(lengthUm, divisor),
        lineAmount: money(roundToPaise(ratePaise * lengthUm * quantity, divisor)),
      },
    };
  }

  if (method === 'per-piece') {
    return {
      ok: true,
      line: {
        ...common,
        pricingMethod: 'per-piece',
        lineAmount: money(Number(ratePaise * quantity)),
      },
    };
  }

  return {
    ok: true,
    line: { ...common, pricingMethod: 'flat-rate', lineAmount: input.rate },
  };
}

export interface PricingAdjustment {
  /** Signed: negative for a discount, positive for a surcharge. */
  amount: Money;
  reason: string;
}

export interface JobPricing {
  lines: PricingLine[];
  subtotal: Money;
  adjustment: PricingAdjustment | null;
  total: Money;
}

export const MAX_PRICING_LINES = 50;

export const EMPTY_PRICING: JobPricing = {
  lines: [],
  subtotal: money(0),
  adjustment: null,
  total: money(0),
};

export type PricingSummaryErrorCode =
  'too-many-lines' | 'missing-adjustment-reason' | 'negative-total';

export const PRICING_SUMMARY_ERROR_MESSAGES: Record<PricingSummaryErrorCode, string> = {
  'too-many-lines': `A job can hold at most ${String(MAX_PRICING_LINES)} priced lines.`,
  'missing-adjustment-reason': 'Say why the adjustment is being made.',
  'negative-total': 'The total cannot be less than zero.',
};

export type PricingSummaryResult =
  { ok: true; pricing: JobPricing } | { ok: false; code: PricingSummaryErrorCode };

/**
 * Builds the stored pricing summary.
 *
 * The subtotal is the exact integer sum of the line amounts, so the total on
 * screen always equals the lines above it. An adjustment may take money off,
 * but never past zero.
 */
export function summarisePricing(
  lines: readonly PricingLine[],
  adjustment: PricingAdjustment | null = null,
): PricingSummaryResult {
  if (lines.length > MAX_PRICING_LINES) {
    return { ok: false, code: 'too-many-lines' };
  }

  const subtotalPaise = lines.reduce((sum, line) => sum + line.lineAmount.paise, 0);

  if (adjustment && adjustment.amount.paise !== 0 && !adjustment.reason.trim()) {
    return { ok: false, code: 'missing-adjustment-reason' };
  }

  const applied =
    adjustment && adjustment.amount.paise !== 0
      ? { amount: adjustment.amount, reason: adjustment.reason.trim() }
      : null;

  const totalPaise = subtotalPaise + (applied?.amount.paise ?? 0);
  if (totalPaise < 0) {
    return { ok: false, code: 'negative-total' };
  }

  return {
    ok: true,
    pricing: {
      lines: [...lines],
      subtotal: money(subtotalPaise),
      adjustment: applied,
      total: money(totalPaise),
    },
  };
}

/** Human readable working, e.g. "6 ft x 4 ft x 2 @ Rs 25.00/sq ft". */
export function describeLineCalculation(
  line: PricingLine,
  formatRate: (rate: Money) => string,
): string {
  const rateText = `${formatRate(line.rate)}/${RATE_UNIT_LABELS[line.rateUnit]}`;

  if (line.pricingMethod === 'per-square-foot' || line.pricingMethod === 'per-square-meter') {
    const dimensions = `${String(line.width)} x ${String(line.height)} ${line.measurementUnit}`;
    const quantity = line.quantity > 1 ? ` x ${String(line.quantity)}` : '';
    return `${dimensions}${quantity} @ ${rateText}`;
  }

  if (line.pricingMethod === 'per-running-foot' || line.pricingMethod === 'per-running-meter') {
    const quantity = line.quantity > 1 ? ` x ${String(line.quantity)}` : '';
    return `${String(line.length)} ${line.measurementUnit}${quantity} @ ${rateText}`;
  }

  if (line.pricingMethod === 'per-piece') {
    return `${String(line.quantity)} x ${rateText}`;
  }

  return `Flat ${formatRate(line.rate)}`;
}
