import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';

import type { ActorSnapshot } from '@/features/enquiries/services/enquiry.service';
import {
  createInventoryItem,
  listInventoryItems,
  listInventoryTransactions,
  recordStockMovement,
  updateInventoryItem,
  type InventoryItemInput,
  type StockMovementInput,
  type TransactionQuery,
} from '@/features/inventory/services/inventory.service';
import type { InventoryItem, InventoryTransaction } from '@/features/inventory/types';
import { queryKeys } from '@/lib/queryClient';
import { AppError, type Id } from '@/types/common';

export const INVENTORY_QUERY_KEY = queryKeys.scope('inventory-items');
export const STOCK_HISTORY_QUERY_KEY = queryKeys.scope('inventory-transactions');

function describe(error: unknown, fallback: string): string {
  return error instanceof AppError ? error.message : fallback;
}

export function useInventoryItems(
  options: { enabled?: boolean } = {},
): UseQueryResult<InventoryItem[], Error> {
  return useQuery({
    queryKey: INVENTORY_QUERY_KEY,
    queryFn: listInventoryItems,
    enabled: options.enabled ?? true,
  });
}

export function useStockHistory(
  spec: TransactionQuery = {},
  options: { enabled?: boolean } = {},
): UseQueryResult<InventoryTransaction[], Error> {
  return useQuery({
    queryKey: [...STOCK_HISTORY_QUERY_KEY, spec.itemId ?? null, spec.jobId ?? null],
    queryFn: () => listInventoryTransactions(spec),
    enabled: options.enabled ?? true,
  });
}

/** Material used on one job. The job detail page shows this. */
export function useJobMaterials(
  jobId: Id | undefined,
  options: { enabled?: boolean } = {},
): UseQueryResult<InventoryTransaction[], Error> {
  return useStockHistory({ jobId }, { enabled: Boolean(jobId) && (options.enabled ?? true) });
}

export function useSaveInventoryItem(actor: ActorSnapshot) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: {
      id?: Id | undefined;
      input: InventoryItemInput;
      opening: number;
    }): Promise<void> => {
      if (variables.id) {
        await updateInventoryItem(variables.id, variables.input, actor);
        return;
      }
      await createInventoryItem(variables.input, variables.opening, actor);
    },
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: INVENTORY_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: STOCK_HISTORY_QUERY_KEY });
      toast.success(variables.id ? 'Material updated' : 'Material added');
    },
    onError: (error) => {
      toast.error('Could not save the material', { description: describe(error, 'Try again.') });
    },
  });
}

export function useRecordStockMovement(actor: ActorSnapshot) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: Omit<StockMovementInput, 'actor'>) =>
      recordStockMovement({ ...variables, actor }),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: INVENTORY_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: STOCK_HISTORY_QUERY_KEY });
      toast.success(variables.direction === 'in' ? 'Stock added' : 'Stock issued');
    },
    onError: (error) => {
      toast.error('Could not record the movement', { description: describe(error, 'Try again.') });
    },
  });
}
