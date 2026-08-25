import { z } from 'zod';

import type { Entity, Id } from '@/types/common';
import { AppError } from '@/types/common';

export const MATERIAL_CATEGORIES = [
  'media',
  'ink',
  'laminate',
  'hardware',
  'consumable',
  'other',
] as const;
export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

export const MATERIAL_CATEGORY_LABELS: Record<MaterialCategory, string> = {
  media: 'Media',
  ink: 'Ink',
  laminate: 'Laminate',
  hardware: 'Hardware',
  consumable: 'Consumable',
  other: 'Other',
};

export const STOCK_UNITS = [
  'sq-ft',
  'sq-m',
  'running-ft',
  'running-m',
  'piece',
  'sheet',
  'roll',
  'litre',
  'kg',
] as const;
export type StockUnit = (typeof STOCK_UNITS)[number];

export const STOCK_UNIT_LABELS: Record<StockUnit, string> = {
  'sq-ft': 'sq. ft.',
  'sq-m': 'sq. m.',
  'running-ft': 'running ft.',
  'running-m': 'running m.',
  piece: 'pieces',
  sheet: 'sheets',
  roll: 'rolls',
  litre: 'litres',
  kg: 'kg',
};

export const STOCK_DIRECTIONS = ['in', 'out'] as const;
export type StockDirection = (typeof STOCK_DIRECTIONS)[number];

export const STOCK_DIRECTION_LABELS: Record<StockDirection, string> = {
  in: 'Stock in',
  out: 'Stock out',
};

/**
 * A material the shop keeps.
 *
 * `currentStock` is not a field anybody types into. The database recomputes it
 * from the transaction history on every movement and refuses to take it under
 * zero, so the figure and its history can never disagree.
 */
export interface InventoryItem extends Entity {
  name: string;
  category: MaterialCategory;
  unit: StockUnit;
  currentStock: number;
  minimumStock: number;
  notes?: string | undefined;
  isActive: boolean;
}

/** One movement. History is append-only: a correction is another movement. */
export interface InventoryTransaction {
  id: Id;
  itemId: Id;
  itemName: string;
  unit: StockUnit;
  direction: StockDirection;
  quantity: number;
  balanceAfter: number;
  jobId?: Id | undefined;
  jobNumber?: string | undefined;
  reason?: string | undefined;
  at: Date;
  byId: Id;
  byName: string;
}

/** Quantities read better without trailing zeros: 12 rather than 12.000. */
export function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

export function formatStock(quantity: number, unit: StockUnit): string {
  return `${formatQuantity(quantity)} ${STOCK_UNIT_LABELS[unit]}`;
}

/** A material worth reordering: at or under its minimum, and still in use. */
export function isLowStock(item: InventoryItem): boolean {
  return item.isActive && item.minimumStock > 0 && item.currentStock <= item.minimumStock;
}

export function isOutOfStock(item: InventoryItem): boolean {
  return item.isActive && item.currentStock <= 0;
}

/** What a movement would leave behind. Used to warn before the round trip. */
export function balanceAfter(
  item: InventoryItem,
  direction: StockDirection,
  quantity: number,
): number {
  return direction === 'in' ? item.currentStock + quantity : item.currentStock - quantity;
}

const quantityField = z
  .string()
  .trim()
  .refine(
    (value) => value === '' || (Number.isFinite(Number(value)) && Number(value) >= 0),
    'Enter a number',
  );

export const itemFormSchema = z.object({
  name: z.string().trim().min(2, 'Give the material a name').max(120, 'Name is too long'),
  category: z.enum(MATERIAL_CATEGORIES),
  unit: z.enum(STOCK_UNITS),
  minimumStock: quantityField,
  openingStock: quantityField,
  notes: z.string().trim().max(500, 'Notes are too long').optional(),
  isActive: z.boolean(),
});

export type ItemFormValues = z.infer<typeof itemFormSchema>;

export const movementFormSchema = z.object({
  direction: z.enum(STOCK_DIRECTIONS),
  quantity: z
    .string()
    .trim()
    .min(1, 'Enter how much is moving')
    .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, 'Enter a valid amount'),
  jobId: z.string().optional(),
  reason: z.string().trim().max(300, 'Reason is too long').optional(),
});

export type MovementFormValues = z.infer<typeof movementFormSchema>;

/** Quantities are kept to three decimals, matching numeric(14, 3) in the schema. */
export function toQuantity(value: string | number | undefined): number {
  const amount = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 1000) / 1000;
}

const itemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(MATERIAL_CATEGORIES),
  unit: z.enum(STOCK_UNITS),
  currentStock: z.number(),
  minimumStock: z.number(),
  notes: z.string().optional(),
  isActive: z.boolean(),
  createdAt: z.date(),
  createdBy: z.string(),
  updatedAt: z.date(),
  updatedBy: z.string(),
});

export function parseInventoryItem(data: unknown, id: string): InventoryItem {
  const result = itemSchema.safeParse(data);
  if (!result.success) {
    throw new AppError('invalid-input', `Material "${id}" is malformed.`, result.error);
  }
  return result.data;
}

const transactionSchema = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
  itemName: z.string(),
  unit: z.enum(STOCK_UNITS),
  direction: z.enum(STOCK_DIRECTIONS),
  quantity: z.number(),
  balanceAfter: z.number(),
  jobId: z.string().optional(),
  jobNumber: z.string().optional(),
  reason: z.string().optional(),
  at: z.date(),
  byId: z.string(),
  byName: z.string(),
});

export function parseInventoryTransaction(data: unknown, id: string): InventoryTransaction {
  const result = transactionSchema.safeParse(data);
  if (!result.success) {
    throw new AppError('invalid-input', `Stock movement "${id}" is malformed.`, result.error);
  }
  return result.data;
}
