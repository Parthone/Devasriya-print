import { z } from 'zod';

import { MEASUREMENT_UNITS } from '@/lib/measurement';
import { RATE_UNITS } from '@/lib/pricing';

const moneySchema = z.object({
  paise: z.number().int(),
  currency: z.literal('INR'),
});

const lineCommon = {
  id: z.string().min(1),
  productId: z.string().nullable().default(null),
  productName: z.string().min(1),
  rate: moneySchema,
  rateUnit: z.enum(RATE_UNITS),
  quantity: z.number().int().min(1),
  lineAmount: moneySchema,
  notes: z.string().optional(),
};

const areaLine = {
  ...lineCommon,
  width: z.number().positive(),
  height: z.number().positive(),
  measurementUnit: z.enum(MEASUREMENT_UNITS),
  calculatedArea: z.number(),
};

const lengthLine = {
  ...lineCommon,
  length: z.number().positive(),
  measurementUnit: z.enum(MEASUREMENT_UNITS),
  calculatedLength: z.number(),
};

/** Each method keeps only the fields it actually uses. */
export const pricingLineSchema = z.discriminatedUnion('pricingMethod', [
  z.object({ ...areaLine, pricingMethod: z.literal('per-square-foot') }),
  z.object({ ...areaLine, pricingMethod: z.literal('per-square-meter') }),
  z.object({ ...lengthLine, pricingMethod: z.literal('per-running-foot') }),
  z.object({ ...lengthLine, pricingMethod: z.literal('per-running-meter') }),
  z.object({ ...lineCommon, pricingMethod: z.literal('per-piece') }),
  z.object({ ...lineCommon, pricingMethod: z.literal('flat-rate') }),
]);

export const jobPricingSchema = z.object({
  lines: z.array(pricingLineSchema).max(50),
  subtotal: moneySchema,
  adjustment: z.object({ amount: moneySchema, reason: z.string() }).nullable().default(null),
  total: moneySchema,
});
