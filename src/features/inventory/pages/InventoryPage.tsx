import { Boxes, PencilLine, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-auth';
import { ItemFormDialog } from '@/features/inventory/components/ItemFormDialog';
import { StockHistory } from '@/features/inventory/components/StockHistory';
import { StockLevel } from '@/features/inventory/components/StockLevel';
import {
  StockMovementDialog,
  type MovementPayload,
} from '@/features/inventory/components/StockMovementDialog';
import {
  useInventoryItems,
  useRecordStockMovement,
  useSaveInventoryItem,
  useStockHistory,
} from '@/features/inventory/hooks/use-inventory';
import type { InventoryItemInput } from '@/features/inventory/services/inventory.service';
import {
  isLowStock,
  MATERIAL_CATEGORIES,
  MATERIAL_CATEGORY_LABELS,
  type InventoryItem,
} from '@/features/inventory/types';
import { useJobDirectory } from '@/features/jobs/hooks/use-jobs';
import { isJobFinished } from '@/features/jobs/types';
import { usePermissions } from '@/features/permissions/hooks/use-permissions';
import { AppError } from '@/types/common';

const ALL = 'all';

export function InventoryPage() {
  const currentUser = useAuthenticatedUser();
  const actor = { uid: currentUser.uid, name: currentUser.name };
  const { can } = usePermissions();
  const canManage = can('inventory:manage');

  const itemsQuery = useInventoryItems();
  const historyQuery = useStockHistory();
  // Only jobs a movement could sensibly be booked against, and only when this
  // user can record one.
  const jobsQuery = useJobDirectory({ enabled: canManage });

  const [term, setTerm] = useState('');
  const [category, setCategory] = useState<string>(ALL);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [isFormOpen, setFormOpen] = useState(false);
  const [moving, setMoving] = useState<InventoryItem | null>(null);

  const save = useSaveInventoryItem(actor);
  const record = useRecordStockMovement(actor);

  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const shown = useMemo(() => {
    const search = term.trim().toLowerCase();
    return items.filter(
      (item) =>
        (category === ALL || item.category === category) &&
        (!search || item.name.toLowerCase().includes(search)),
    );
  }, [items, term, category]);

  const lowCount = useMemo(() => items.filter(isLowStock).length, [items]);
  const openJobs = useMemo(
    () => (jobsQuery.data?.jobs ?? []).filter((job) => !isJobFinished(job.status)),
    [jobsQuery.data],
  );

  const handleSave = (input: InventoryItemInput, opening: number) => {
    save.mutate(
      { ...(editing ? { id: editing.id } : {}), input, opening },
      {
        onSuccess: () => {
          setFormOpen(false);
          setEditing(null);
        },
      },
    );
  };

  const handleMovement = (payload: MovementPayload) => {
    if (!moving) return;
    record.mutate(
      { itemId: moving.id, ...payload },
      {
        onSuccess: () => {
          setMoving(null);
        },
      },
    );
  };

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Materials the shop keeps, what is on hand, and every movement in or out."
        actions={
          canManage ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden="true" /> Add material
            </Button>
          ) : null
        }
      />

      {lowCount > 0 ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {lowCount} {lowCount === 1 ? 'material is' : 'materials are'} at or below the minimum
          stock level.
        </p>
      ) : null}

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={term}
                onChange={(event) => {
                  setTerm(event.target.value);
                }}
                placeholder="Search materials"
                aria-label="Search materials"
                className="pl-8"
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="sm:w-48" aria-label="Filter by category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All categories</SelectItem>
                {MATERIAL_CATEGORIES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {MATERIAL_CATEGORY_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {itemsQuery.isPending ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : itemsQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {itemsQuery.error instanceof AppError
                ? itemsQuery.error.message
                : 'Could not load the materials.'}
            </p>
          ) : shown.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <Boxes className="size-6" aria-hidden="true" />
              <p className="text-sm">
                {term || category !== ALL
                  ? 'No materials match this search.'
                  : 'No materials yet. Add the ones the shop keeps.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">In stock</TableHead>
                  <TableHead className="text-right">Minimum</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="text-sm font-medium">{item.name}</div>
                      {item.isActive ? null : (
                        <div className="text-xs text-muted-foreground">No longer in use</div>
                      )}
                      {item.notes ? (
                        <p className="truncate text-xs text-muted-foreground">{item.notes}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">
                      {MATERIAL_CATEGORY_LABELS[item.category]}
                    </TableCell>
                    <TableCell className="text-right">
                      <StockLevel item={item} />
                    </TableCell>
                    <TableCell className="tabular-money text-right text-sm text-muted-foreground">
                      {item.minimumStock}
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!item.isActive}
                            title={item.isActive ? undefined : 'This material is no longer in use'}
                            onClick={() => {
                              setMoving(item);
                            }}
                          >
                            Stock in / out
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Edit ${item.name}`}
                            onClick={() => {
                              setEditing(item);
                              setFormOpen(true);
                            }}
                          >
                            <PencilLine className="size-4" aria-hidden="true" />
                          </Button>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent stock movements</CardTitle>
        </CardHeader>
        <CardContent>
          <StockHistory
            transactions={historyQuery.data ?? []}
            isPending={historyQuery.isPending}
            error={historyQuery.isError ? historyQuery.error : null}
          />
        </CardContent>
      </Card>

      <ItemFormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        item={editing ?? undefined}
        isSaving={save.isPending}
        onSubmit={handleSave}
      />

      {moving ? (
        <StockMovementDialog
          open
          onOpenChange={(open) => {
            if (!open) setMoving(null);
          }}
          item={moving}
          jobs={openJobs}
          isSaving={record.isPending}
          onSubmit={handleMovement}
        />
      ) : null}
    </>
  );
}
