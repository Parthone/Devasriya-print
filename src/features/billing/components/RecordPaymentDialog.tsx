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
  outstandingOf,
  PAYMENT_MODE_LABELS,
  PAYMENT_MODES,
  rupeesToMoney,
  type Invoice,
  type PaymentMode,
} from '@/features/billing/types';
import { fromDateInputValue, toDateInputValue } from '@/features/enquiries/types';
import { formatMoney } from '@/lib/format';
import type { Money } from '@/lib/money';

export interface PaymentPayload {
  amount: Money;
  paidAt: Date;
  mode: PaymentMode;
  reference?: string | undefined;
  note?: string | undefined;
}

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice;
  isSaving: boolean;
  onSubmit: (payload: PaymentPayload) => void;
}

/**
 * Receives money against a bill.
 *
 * The amount is capped at the outstanding balance here, and refused again by
 * the database under a row lock. Nothing recorded through this dialog can ever
 * be edited or removed afterwards.
 */
export function RecordPaymentDialog({
  open,
  onOpenChange,
  invoice,
  isSaving,
  onSubmit,
}: RecordPaymentDialogProps) {
  const outstanding = outstandingOf(invoice);

  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState('');
  const [mode, setMode] = useState<PaymentMode>('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount(String(outstanding.paise / 100));
    setPaidOn(toDateInputValue(new Date()));
    setMode('cash');
    setReference('');
    setNote('');
    setError(null);
  }, [open, outstanding.paise]);

  const submit = () => {
    const value = rupeesToMoney(amount);
    if (!amount.trim() || !Number.isFinite(Number(amount)) || value.paise <= 0) {
      setError('Enter the amount received');
      return;
    }
    if (value.paise > outstanding.paise) {
      setError(`That is more than the ${formatMoney(outstanding)} outstanding on this invoice`);
      return;
    }
    const date = fromDateInputValue(paidOn);
    if (!date) {
      setError('Give the date it was received');
      return;
    }

    onSubmit({ amount: value, paidAt: date, mode, reference, note });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {formatMoney(outstanding)} outstanding on {invoice.invoiceNumber}. Payments cannot be
            edited or removed once recorded.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <FormField
            id="payment-amount"
            label="Amount received"
            required
            error={error ?? undefined}
          >
            <Input
              id="payment-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setError(null);
              }}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="payment-date" label="Received on" required>
              <Input
                id="payment-date"
                type="date"
                value={paidOn}
                onChange={(event) => {
                  setPaidOn(event.target.value);
                  setError(null);
                }}
              />
            </FormField>

            <FormField id="payment-mode" label="Mode" required>
              <Select
                value={mode}
                onValueChange={(value) => {
                  setMode(value as PaymentMode);
                }}
              >
                <SelectTrigger id="payment-mode" aria-label="Payment mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {PAYMENT_MODE_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <FormField
            id="payment-reference"
            label="Reference"
            hint="Cheque number, UPI reference or similar. Optional."
          >
            <Input
              id="payment-reference"
              value={reference}
              onChange={(event) => {
                setReference(event.target.value);
              }}
            />
          </FormField>

          <FormField id="payment-note" label="Note" hint="Optional.">
            <Textarea
              id="payment-note"
              rows={2}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
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
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
