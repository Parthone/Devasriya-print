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
import {
  balanceAfter,
  formatStock,
  STOCK_DIRECTION_LABELS,
  STOCK_DIRECTIONS,
  toQuantity,
  type InventoryItem,
  type StockDirection,
} from '@/features/inventory/types';
import type { Job } from '@/features/jobs/types';
import type { Id } from '@/types/common';

export interface MovementPayload {
  direction: StockDirection;
  quantity: number;
  jobId?: Id | undefined;
  reason?: string | undefined;
}

interface StockMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItem;
  /** Open jobs the material can be issued against. */
  jobs: Job[];
  isSaving: boolean;
  onSubmit: (payload: MovementPayload) => void;
}

const NO_JOB = 'none';

/**
 * Stock in or stock out, optionally against a job.
 *
 * Stock is never allowed below zero. The warning here saves a round trip; the
 * database refuses it under a row lock regardless of what this dialog thinks.
 */
export function StockMovementDialog({
  open,
  onOpenChange,
  item,
  jobs,
  isSaving,
  onSubmit,
}: StockMovementDialogProps) {
  const [direction, setDirection] = useState<StockDirection>('out');
  const [quantity, setQuantity] = useState('');
  const [jobId, setJobId] = useState<string>(NO_JOB);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDirection('out');
    setQuantity('');
    setJobId(NO_JOB);
    setReason('');
    setError(null);
  }, [open]);

  const amount = toQuantity(quantity);
  const projected = balanceAfter(item, direction, amount);

  const submit = () => {
    if (!quantity.trim() || !Number.isFinite(Number(quantity)) || amount <= 0) {
      setError('Enter how much is moving');
      return;
    }
    if (projected < 0) {
      setError(`There is only ${formatStock(item.currentStock, item.unit)} in stock`);
      return;
    }

    onSubmit({
      direction,
      quantity: amount,
      ...(jobId !== NO_JOB ? { jobId } : {}),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription>
            {formatStock(item.currentStock, item.unit)} in stock. Movements cannot be edited or
            removed once recorded.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="movement-direction" label="Movement" required>
              <Select
                value={direction}
                onValueChange={(value) => {
                  setDirection(value as StockDirection);
                  setError(null);
                }}
              >
                <SelectTrigger id="movement-direction" aria-label="Movement">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STOCK_DIRECTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {STOCK_DIRECTION_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField id="movement-quantity" label="Quantity" required error={error ?? undefined}>
              <Input
                id="movement-quantity"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => {
                  setQuantity(event.target.value);
                  setError(null);
                }}
              />
            </FormField>
          </div>

          {amount > 0 && projected >= 0 ? (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              This leaves {formatStock(projected, item.unit)}.
            </p>
          ) : null}

          <FormField id="movement-job" label="Job" hint="Which job this is for. Optional.">
            <Select value={jobId} onValueChange={setJobId}>
              <SelectTrigger id="movement-job" aria-label="Job">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_JOB}>Not for a specific job</SelectItem>
                {jobs.map((job) => (
                  <SelectItem key={job.id} value={job.id}>
                    {job.jobNumber} - {job.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField id="movement-reason" label="Reason" hint="Why the stock moved. Optional.">
            <Textarea
              id="movement-reason"
              rows={2}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
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
            Record movement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
