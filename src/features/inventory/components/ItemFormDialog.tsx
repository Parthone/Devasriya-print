import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { FormField } from '@/components/common/FormField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { InventoryItemInput } from '@/features/inventory/services/inventory.service';
import {
  MATERIAL_CATEGORIES,
  MATERIAL_CATEGORY_LABELS,
  STOCK_UNIT_LABELS,
  STOCK_UNITS,
  toQuantity,
  type InventoryItem,
  type MaterialCategory,
  type StockUnit,
} from '@/features/inventory/types';

interface ItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing; absent when adding. */
  item?: InventoryItem | undefined;
  isSaving: boolean;
  onSubmit: (input: InventoryItemInput, opening: number) => void;
}

/**
 * Adds or edits a material.
 *
 * The stock figure is never typed here. A new material starts empty and its
 * opening balance is recorded as an ordinary movement, so the history explains
 * every unit that is there.
 */
export function ItemFormDialog({
  open,
  onOpenChange,
  item,
  isSaving,
  onSubmit,
}: ItemFormDialogProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<MaterialCategory>('media');
  const [unit, setUnit] = useState<StockUnit>('sq-ft');
  const [minimum, setMinimum] = useState('0');
  const [opening, setOpening] = useState('0');
  const [notes, setNotes] = useState('');
  const [isActive, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? '');
    setCategory(item?.category ?? 'media');
    setUnit(item?.unit ?? 'sq-ft');
    setMinimum(String(item?.minimumStock ?? 0));
    setOpening('0');
    setNotes(item?.notes ?? '');
    setActive(item?.isActive ?? true);
    setError(null);
  }, [open, item]);

  const submit = () => {
    if (name.trim().length < 2) {
      setError('Give the material a name');
      return;
    }
    if (!Number.isFinite(Number(minimum)) || Number(minimum) < 0) {
      setError('The minimum stock must be a number');
      return;
    }
    if (!item && (!Number.isFinite(Number(opening)) || Number(opening) < 0)) {
      setError('The opening stock must be a number');
      return;
    }

    onSubmit(
      {
        name: name.trim(),
        category,
        unit,
        minimumStock: toQuantity(minimum),
        isActive,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      },
      item ? 0 : toQuantity(opening),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit material' : 'Add material'}</DialogTitle>
          <DialogDescription>
            {item
              ? 'The stock figure is not edited here. Record a stock movement instead, so the reason is kept.'
              : 'A new material starts empty. Any opening balance is recorded as a stock-in movement.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <FormField id="item-name" label="Name" required error={error ?? undefined}>
            <Input
              id="item-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="item-category" label="Category" required>
              <Select
                value={category}
                onValueChange={(value) => {
                  setCategory(value as MaterialCategory);
                }}
              >
                <SelectTrigger id="item-category" aria-label="Category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATERIAL_CATEGORIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {MATERIAL_CATEGORY_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField id="item-unit" label="Unit" required>
              <Select
                value={unit}
                onValueChange={(value) => {
                  setUnit(value as StockUnit);
                }}
                disabled={Boolean(item)}
              >
                <SelectTrigger id="item-unit" aria-label="Unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STOCK_UNITS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {STOCK_UNIT_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="item-minimum"
              label="Minimum stock"
              hint="Flagged as low at or below this. 0 turns the warning off."
            >
              <Input
                id="item-minimum"
                inputMode="decimal"
                value={minimum}
                onChange={(event) => {
                  setMinimum(event.target.value);
                  setError(null);
                }}
              />
            </FormField>

            {item ? null : (
              <FormField id="item-opening" label="Opening stock" hint="Recorded as a stock-in.">
                <Input
                  id="item-opening"
                  inputMode="decimal"
                  value={opening}
                  onChange={(event) => {
                    setOpening(event.target.value);
                    setError(null);
                  }}
                />
              </FormField>
            )}
          </div>

          <FormField id="item-notes" label="Notes" hint="Optional.">
            <Textarea
              id="item-notes"
              rows={2}
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
              }}
            />
          </FormField>

          <FormField id="item-active" label="In use">
            <Select
              value={isActive ? 'yes' : 'no'}
              onValueChange={(value) => {
                setActive(value === 'yes');
              }}
            >
              <SelectTrigger id="item-active">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={isSaving}>
            {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {item ? 'Save changes' : 'Add material'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
