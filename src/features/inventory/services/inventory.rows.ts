import {
  parseInventoryItem,
  parseInventoryTransaction,
  type InventoryItem,
  type InventoryTransaction,
  type MaterialCategory,
  type StockDirection,
  type StockUnit,
} from '@/features/inventory/types';
import { toAudit, toDate, toNumber, toOptional, type AuditRow } from '@/lib/supabase/rows';

export interface InventoryItemRow extends AuditRow {
  id: string;
  name: string;
  category: MaterialCategory;
  unit: StockUnit;
  current_stock: number | string;
  minimum_stock: number | string;
  notes: string | null;
  is_active: boolean;
}

export const ITEM_COLUMNS =
  'id, name, category, unit, current_stock, minimum_stock, notes, is_active,' +
  ' created_at, created_by, updated_at, updated_by';

export function toInventoryItem(row: InventoryItemRow): InventoryItem {
  return parseInventoryItem(
    {
      id: row.id,
      name: row.name,
      category: row.category,
      unit: row.unit,
      currentStock: toNumber(row.current_stock),
      minimumStock: toNumber(row.minimum_stock),
      notes: toOptional(row.notes),
      isActive: row.is_active,
      ...toAudit(row),
    },
    row.id,
  );
}

export interface InventoryTransactionRow {
  id: string;
  item_id: string;
  item_name: string;
  unit: StockUnit;
  direction: StockDirection;
  quantity: number | string;
  balance_after: number | string;
  job_id: string | null;
  job_number: string | null;
  reason: string | null;
  at: string;
  by_id: string;
  by_name: string;
}

export const TRANSACTION_COLUMNS =
  'id, item_id, item_name, unit, direction, quantity, balance_after, job_id, job_number,' +
  ' reason, at, by_id, by_name';

export function toInventoryTransaction(row: InventoryTransactionRow): InventoryTransaction {
  return parseInventoryTransaction(
    {
      id: row.id,
      itemId: row.item_id,
      itemName: row.item_name,
      unit: row.unit,
      direction: row.direction,
      quantity: toNumber(row.quantity),
      balanceAfter: toNumber(row.balance_after),
      jobId: toOptional(row.job_id),
      jobNumber: toOptional(row.job_number),
      reason: toOptional(row.reason),
      at: toDate(row.at),
      byId: row.by_id,
      byName: row.by_name,
    },
    row.id,
  );
}
