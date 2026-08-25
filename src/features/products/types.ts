import { z } from 'zod';

import { money, type Money } from '@/lib/money';
import {
  PRICING_METHODS,
  RATE_UNIT_FOR_METHOD,
  RATE_UNITS,
  type PricingMethod,
  type RateUnit,
} from '@/lib/pricing';
import type { Entity } from '@/types/common';
import { AppError } from '@/types/common';

export const PRODUCT_CATEGORIES = [
  'printing',
  'material',
  'finishing',
  'service',
  'other',
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  printing: 'Printing',
  material: 'Material',
  finishing: 'Finishing',
  service: 'Service',
  other: 'Other',
};

/**
 * A rate card entry.
 *
 * These are defaults for new pricing lines only. A job line snapshots the rate
 * it used, so editing a product here never changes work that is already priced.
 */
export interface Product extends Entity {
  name: string;
  category: ProductCategory;
  pricingMethod: PricingMethod;
  defaultRate: Money;
  defaultRateUnit: RateUnit;
  description?: string | undefined;
  isActive: boolean;
}

export const productFormSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120, 'Name is too long'),
  category: z.enum(PRODUCT_CATEGORIES),
  pricingMethod: z.enum(PRICING_METHODS),
  /** Entered in rupees; stored as paise. */
  defaultRate: z
    .string()
    .trim()
    .min(1, 'Enter a rate')
    .refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0, {
      message: 'Rate cannot be negative',
    }),
  description: z.string().trim().max(400, 'Description is too long').optional(),
  isActive: z.boolean(),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;

export const EMPTY_PRODUCT_VALUES: ProductFormValues = {
  name: '',
  category: 'printing',
  pricingMethod: 'per-square-foot',
  defaultRate: '',
  description: '',
  isActive: true,
};

export interface ProductInput {
  name: string;
  category: ProductCategory;
  pricingMethod: PricingMethod;
  defaultRate: Money;
  defaultRateUnit: RateUnit;
  description?: string | undefined;
  isActive: boolean;
}

/** Rupees typed into the form become whole paise. */
export function rupeesToMoney(value: string): Money {
  const rupees = Number(value);
  if (!Number.isFinite(rupees)) return money(0);
  return money(Math.round(rupees * 100));
}

export function moneyToRupeeInput(value: Money): string {
  return (value.paise / 100).toFixed(2);
}

export function normaliseProductValues(values: ProductFormValues): ProductInput {
  const description = values.description?.trim();

  return {
    name: values.name.trim(),
    category: values.category,
    pricingMethod: values.pricingMethod,
    defaultRate: rupeesToMoney(values.defaultRate),
    // The unit always follows the method; it is never chosen separately.
    defaultRateUnit: RATE_UNIT_FOR_METHOD[values.pricingMethod],
    isActive: values.isActive,
    ...(description ? { description } : {}),
  };
}

export function toProductFormValues(product: Product): ProductFormValues {
  return {
    name: product.name,
    category: product.category,
    pricingMethod: product.pricingMethod,
    defaultRate: moneyToRupeeInput(product.defaultRate),
    description: product.description ?? '',
    isActive: product.isActive,
  };
}

const moneySchema = z.object({
  paise: z.number().int(),
  currency: z.literal('INR'),
});

const productSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(PRODUCT_CATEGORIES),
  pricingMethod: z.enum(PRICING_METHODS),
  defaultRate: moneySchema,
  defaultRateUnit: z.enum(RATE_UNITS),
  description: z.string().optional(),
  isActive: z.boolean(),
  createdAt: z.date(),
  createdBy: z.string(),
  updatedAt: z.date(),
  updatedBy: z.string(),
});

export function parseProduct(data: unknown, id: string): Product {
  const result = productSchema.safeParse(data);
  if (!result.success) {
    throw new AppError('invalid-input', `Product "${id}" is malformed.`, result.error);
  }
  return result.data;
}
