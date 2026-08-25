import { ArrowDownLeft, ArrowUpRight, History } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Skeleton } from '@/components/ui/skeleton';
import {
  formatQuantity,
  formatStock,
  STOCK_UNIT_LABELS,
  type InventoryTransaction,
} from '@/features/inventory/types';
import { formatDateTime } from '@/lib/format';
import { AppError } from '@/types/common';

interface StockHistoryProps {
  transactions: InventoryTransaction[];
  isPending: boolean;
  error: unknown;
  emptyMessage?: string;
  /** Hidden when the list is already for one material. */
  showItemName?: boolean;
}

/**
 * The movement ledger.
 *
 * Every row carries the balance it left behind, so the running figure can be
 * checked against the history without recomputing anything. Nothing here is
 * editable: a correction is another movement.
 */
export function StockHistory({
  transactions,
  isPending,
  error,
  emptyMessage = 'No stock movements recorded yet.',
  showItemName = true,
}: StockHistoryProps) {
  if (isPending) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error instanceof AppError ? error.message : 'Could not load the stock history.'}
      </p>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
        <History className="size-5" aria-hidden="true" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ol className="divide-y">
      {transactions.map((entry) => (
        <li key={entry.id} className="flex items-start justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium">
              {entry.direction === 'in' ? (
                <ArrowDownLeft className="size-4 text-emerald-600" aria-hidden="true" />
              ) : (
                <ArrowUpRight className="size-4 text-amber-600" aria-hidden="true" />
              )}
              {entry.direction === 'in' ? '+' : '-'}
              {formatQuantity(entry.quantity)} {STOCK_UNIT_LABELS[entry.unit]}
              {showItemName ? (
                <span className="font-normal text-muted-foreground">{entry.itemName}</span>
              ) : null}
            </p>
            {entry.jobId && entry.jobNumber ? (
              <p className="text-xs">
                <Link to={`/jobs/${entry.jobId}`} className="underline-offset-2 hover:underline">
                  {entry.jobNumber}
                </Link>
              </p>
            ) : null}
            {entry.reason ? <p className="mt-1 text-sm">{entry.reason}</p> : null}
            <p className="text-xs text-muted-foreground">
              {formatDateTime(entry.at)} by {entry.byName}
            </p>
          </div>
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            Balance {formatStock(entry.balanceAfter, entry.unit)}
          </span>
        </li>
      ))}
    </ol>
  );
}
