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
import { Textarea } from '@/components/ui/textarea';
import { DEFAULT_INVOICE_TERMS, rupeesToMoney } from '@/features/billing/types';
import { formatMoney } from '@/lib/format';
import { money, type Money } from '@/lib/money';

export interface InvoiceFormPayload {
  discount?: Money | undefined;
  discountReason?: string | undefined;
  notes?: string | undefined;
  terms?: string | undefined;
}

interface InvoiceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The job total the bill will be raised against. */
  jobTotal: Money;
  isSaving: boolean;
  onSubmit: (payload: InvoiceFormPayload) => void;
}

/**
 * Discount and wording only.
 *
 * The priced lines come from the job pricing snapshot and are never typed
 * here - that is what keeps a bill a true record of what was charged.
 */
export function InvoiceFormDialog({
  open,
  onOpenChange,
  jobTotal,
  isSaving,
  onSubmit,
}: InvoiceFormDialogProps) {
  const [discount, setDiscount] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDiscount('');
    setReason('');
    setNotes('');
    setTerms(DEFAULT_INVOICE_TERMS);
    setError(null);
  }, [open]);

  const discountMoney = discount.trim() ? rupeesToMoney(discount) : money(0);
  const total = money(jobTotal.paise - Math.max(discountMoney.paise, 0));

  const submit = () => {
    if (discount.trim() && !Number.isFinite(Number(discount))) {
      setError('Enter the discount as a number');
      return;
    }
    if (discountMoney.paise < 0) {
      setError('A discount cannot be negative');
      return;
    }
    if (discountMoney.paise >= jobTotal.paise) {
      setError('The discount cannot be the whole bill');
      return;
    }
    if (discountMoney.paise > 0 && !reason.trim()) {
      setError('Say why the discount is being given');
      return;
    }

    onSubmit({
      ...(discountMoney.paise > 0 ? { discount: discountMoney, discountReason: reason } : {}),
      notes,
      terms,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Raise invoice</DialogTitle>
          <DialogDescription>
            The priced items are copied from the job as they stand now. Later price changes will not
            affect this invoice.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Job total</span>
              <span className="tabular-money">{formatMoney(jobTotal)}</span>
            </div>
            <div className="mt-1 flex justify-between font-medium">
              <span>Invoice total</span>
              <span className="tabular-money">{formatMoney(total)}</span>
            </div>
          </div>

          <FormField
            id="invoice-discount"
            label="Discount"
            hint="In rupees. Leave blank for no discount."
            error={error ?? undefined}
          >
            <Input
              id="invoice-discount"
              inputMode="decimal"
              value={discount}
              onChange={(event) => {
                setDiscount(event.target.value);
                setError(null);
              }}
            />
          </FormField>

          {discountMoney.paise > 0 ? (
            <FormField id="invoice-discount-reason" label="Reason for the discount" required>
              <Input
                id="invoice-discount-reason"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setError(null);
                }}
              />
            </FormField>
          ) : null}

          <FormField id="invoice-notes" label="Notes" hint="Shown on the invoice. Optional.">
            <Textarea
              id="invoice-notes"
              rows={2}
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
              }}
            />
          </FormField>

          <FormField id="invoice-terms" label="Terms">
            <Textarea
              id="invoice-terms"
              rows={3}
              value={terms}
              onChange={(event) => {
                setTerms(event.target.value);
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
            Raise invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
