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
import { moneyToRupeeInput, rupeesToMoney } from '@/features/products/types';
import { formatMoney } from '@/lib/format';
import { money, type Money } from '@/lib/money';
import type { PricingAdjustment } from '@/lib/pricing';

interface AdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adjustment: PricingAdjustment | null;
  subtotal: Money;
  onSubmit: (adjustment: PricingAdjustment | null) => void;
}

/**
 * A single signed adjustment on the job total.
 *
 * Negative takes money off, positive adds it. A reason is required for anything
 * other than zero, and the total is not allowed to fall below zero.
 */
export function AdjustmentDialog({
  open,
  onOpenChange,
  adjustment,
  subtotal,
  onSubmit,
}: AdjustmentDialogProps) {
  const [amount, setAmount] = useState('0.00');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount(adjustment ? moneyToRupeeInput(adjustment.amount) : '0.00');
    setReason(adjustment?.reason ?? '');
    setError(null);
  }, [open, adjustment]);

  const parsed = rupeesToMoney(amount || '0');
  const projected = money(subtotal.paise + parsed.paise);

  const submit = () => {
    if (parsed.paise === 0) {
      onSubmit(null);
      return;
    }
    if (!reason.trim()) {
      setError('Say why the adjustment is being made');
      return;
    }
    if (projected.paise < 0) {
      setError('That would make the total less than zero');
      return;
    }
    onSubmit({ amount: parsed, reason: reason.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust the total</DialogTitle>
          <DialogDescription>
            Use a negative amount for a discount and a positive amount for a surcharge.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <FormField id="adjustment-amount" label="Amount" hint="For example -200 for a discount">
            <Input
              id="adjustment-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setError(null);
              }}
            />
          </FormField>

          <FormField
            id="adjustment-reason"
            label="Reason"
            error={error ?? undefined}
            required={parsed.paise !== 0}
          >
            <Input
              id="adjustment-reason"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setError(null);
              }}
            />
          </FormField>

          <p className="text-sm text-muted-foreground" aria-live="polite">
            Subtotal {formatMoney(subtotal)} becomes{' '}
            <span className="font-medium text-foreground">{formatMoney(projected)}</span>
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button type="button" onClick={submit}>
            Save adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
