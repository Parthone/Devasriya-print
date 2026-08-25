import { Badge } from '@/components/ui/badge';
import {
  formatStock,
  isLowStock,
  isOutOfStock,
  type InventoryItem,
} from '@/features/inventory/types';

/**
 * How much is on hand, and whether that is a problem.
 *
 * "Low" means at or under the minimum the shop set for this material, which is
 * the point at which somebody should be reordering rather than the point at
 * which work stops.
 */
export function StockLevel({ item }: { item: InventoryItem }) {
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="tabular-money text-sm">{formatStock(item.currentStock, item.unit)}</span>
      {isOutOfStock(item) ? (
        <Badge variant="destructive">Out of stock</Badge>
      ) : isLowStock(item) ? (
        <Badge variant="warning">Low</Badge>
      ) : null}
    </span>
  );
}
