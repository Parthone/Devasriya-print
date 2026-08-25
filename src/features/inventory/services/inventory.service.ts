import { isDemoMode } from '@/config/demo';
import {
  addDemoInventoryItem,
  addDemoStockMovement,
  demoInventoryItem,
  demoInventoryItems,
  demoInventoryTransactions,
  demoJob,
  updateDemoInventoryItem,
} from '@/features/demo/demo-store';
import type { ActorSnapshot } from '@/features/enquiries/services/enquiry.service';
import {
  ITEM_COLUMNS,
  TRANSACTION_COLUMNS,
  toInventoryItem,
  toInventoryTransaction,
  type InventoryItemRow,
  type InventoryTransactionRow,
} from '@/features/inventory/services/inventory.rows';
import {
  toQuantity,
  type InventoryItem,
  type InventoryTransaction,
  type MaterialCategory,
  type StockDirection,
  type StockUnit,
} from '@/features/inventory/types';
import { getSupabase } from '@/lib/supabase/client';
import { toAppError, unwrap, unwrapMaybe } from '@/lib/supabase/errors';
import { TABLES } from '@/services/base/tables';
import { AppError, type Id } from '@/types/common';

export const ITEM_FETCH_CAP = 500;
export const TRANSACTION_FETCH_CAP = 500;

export async function listInventoryItems(): Promise<InventoryItem[]> {
  if (isDemoMode()) return demoInventoryItems();

  const rows = unwrap(
    await getSupabase()
      .from(TABLES.inventoryItems)
      .select(ITEM_COLUMNS)
      .order('name', { ascending: true })
      .limit(ITEM_FETCH_CAP)
      .returns<InventoryItemRow[]>(),
  );
  return rows.map(toInventoryItem);
}

export async function findInventoryItem(id: Id): Promise<InventoryItem | null> {
  if (isDemoMode()) return demoInventoryItem(id);

  const row = unwrapMaybe(
    await getSupabase()
      .from(TABLES.inventoryItems)
      .select(ITEM_COLUMNS)
      .eq('id', id)
      .maybeSingle<InventoryItemRow>(),
  );
  return row ? toInventoryItem(row) : null;
}

export interface TransactionQuery {
  itemId?: Id | undefined;
  jobId?: Id | undefined;
}

/** Movements, newest first. Optionally for one material or one job. */
export async function listInventoryTransactions(
  spec: TransactionQuery = {},
): Promise<InventoryTransaction[]> {
  if (isDemoMode()) return demoInventoryTransactions(spec);

  let request = getSupabase()
    .from(TABLES.inventoryTransactions)
    .select(TRANSACTION_COLUMNS)
    .order('at', { ascending: false })
    .limit(TRANSACTION_FETCH_CAP);

  if (spec.itemId) request = request.eq('item_id', spec.itemId);
  if (spec.jobId) request = request.eq('job_id', spec.jobId);

  const rows = unwrap(await request.returns<InventoryTransactionRow[]>());
  return rows.map(toInventoryTransaction);
}

export interface InventoryItemInput {
  name: string;
  category: MaterialCategory;
  unit: StockUnit;
  minimumStock: number;
  notes?: string | undefined;
  isActive: boolean;
}

export const OPENING_STOCK_REASON = 'Opening stock';

/**
 * Adds a material.
 *
 * A new material always starts empty: the database forces it. Any opening
 * balance is recorded as an ordinary "stock in" movement straight afterwards,
 * so the history explains every unit that is there rather than starting with
 * a figure nobody can account for.
 */
export async function createInventoryItem(
  input: InventoryItemInput,
  openingStock: number,
  actor: ActorSnapshot,
): Promise<InventoryItem> {
  const opening = toQuantity(openingStock);

  if (isDemoMode()) {
    const created = addDemoInventoryItem(input, actor.uid);
    if (opening > 0) {
      addDemoStockMovement({
        itemId: created.id,
        direction: 'in',
        quantity: opening,
        reason: OPENING_STOCK_REASON,
        actor,
      });
      return demoInventoryItem(created.id) ?? created;
    }
    return created;
  }

  try {
    const row = unwrap(
      await getSupabase()
        .from(TABLES.inventoryItems)
        .insert({
          name: input.name.trim(),
          category: input.category,
          unit: input.unit,
          minimum_stock: toQuantity(input.minimumStock),
          notes: input.notes?.trim() ? input.notes.trim() : null,
          is_active: input.isActive,
          created_by: actor.uid,
          updated_by: actor.uid,
        })
        .select(ITEM_COLUMNS)
        .single<InventoryItemRow>(),
    );

    if (opening > 0) {
      await recordStockMovement({
        itemId: row.id,
        direction: 'in',
        quantity: opening,
        reason: OPENING_STOCK_REASON,
        actor,
      });
      return (await findInventoryItem(row.id)) ?? toInventoryItem(row);
    }

    return toInventoryItem(row);
  } catch (error) {
    throw toAppError(error);
  }
}

/**
 * Edits a material.
 *
 * The stock figure is not among the fields that can be changed here - it has
 * no update grant at all. Correcting it means recording a movement, which is
 * what leaves the reason behind.
 */
export async function updateInventoryItem(
  id: Id,
  input: InventoryItemInput,
  actor: ActorSnapshot,
): Promise<void> {
  if (isDemoMode()) {
    updateDemoInventoryItem(id, input, actor.uid);
    return;
  }

  try {
    const { error } = await getSupabase()
      .from(TABLES.inventoryItems)
      .update({
        name: input.name.trim(),
        category: input.category,
        unit: input.unit,
        minimum_stock: toQuantity(input.minimumStock),
        notes: input.notes?.trim() ? input.notes.trim() : null,
        is_active: input.isActive,
        updated_by: actor.uid,
      })
      .eq('id', id);
    if (error) throw error;
  } catch (error) {
    throw toAppError(error);
  }
}

export interface StockMovementInput {
  itemId: Id;
  direction: StockDirection;
  quantity: number;
  jobId?: Id | undefined;
  reason?: string | undefined;
  actor: ActorSnapshot;
}

/**
 * Records stock coming in or going out, optionally against a job.
 *
 * Stock is never allowed below zero. That refusal lives in the database, under
 * a row lock taken before the arithmetic, so two people issuing the last of a
 * roll at the same moment cannot both be told there was enough. The check here
 * exists to give a useful message without a round trip, not to be the rule.
 */
export async function recordStockMovement({
  itemId,
  direction,
  quantity,
  jobId,
  reason,
  actor,
}: StockMovementInput): Promise<InventoryTransaction> {
  const amount = toQuantity(quantity);
  if (amount <= 0) {
    throw new AppError('invalid-input', 'Enter how much is moving.');
  }

  if (isDemoMode()) {
    return addDemoStockMovement({
      itemId,
      direction,
      quantity: amount,
      ...(jobId ? { jobId, jobNumber: demoJob(jobId)?.jobNumber } : {}),
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
      actor,
    });
  }

  try {
    const row = unwrap(
      await getSupabase()
        .rpc('record_stock_movement', {
          p_item_id: itemId,
          p_direction: direction,
          p_quantity: amount,
          p_job_id: jobId ?? null,
          p_reason: reason?.trim() ?? null,
        })
        .single<InventoryTransactionRow>(),
    );
    return toInventoryTransaction(row);
  } catch (error) {
    throw toAppError(error);
  }
}
