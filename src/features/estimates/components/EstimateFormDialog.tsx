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
import { fromDateInputValue, toDateInputValue } from '@/features/enquiries/types';
import { DEFAULT_TERMS, type Estimate } from '@/features/estimates/types';
import { defaultValidUntil } from '@/features/estimates/services/estimate.service';

export interface EstimateFormPayload {
  validUntil: Date;
  notes?: string | undefined;
  terms?: string | undefined;
}

interface EstimateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing a draft; absent when creating from a job. */
  estimate?: Estimate | undefined;
  isSaving: boolean;
  onSubmit: (payload: EstimateFormPayload) => void;
}

/**
 * Wording and validity only.
 *
 * The priced lines come from the job pricing snapshot and are never typed or
 * edited here - that is what keeps a quotation a true record of what was
 * offered.
 */
export function EstimateFormDialog({
  open,
  onOpenChange,
  estimate,
  isSaving,
  onSubmit,
}: EstimateFormDialogProps) {
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValidUntil(toDateInputValue(estimate?.validUntil ?? defaultValidUntil()));
    setNotes(estimate?.notes ?? '');
    setTerms(estimate?.terms ?? DEFAULT_TERMS);
    setError(null);
  }, [open, estimate]);

  const submit = () => {
    const parsed = fromDateInputValue(validUntil);
    if (!parsed) {
      setError('Give the quotation a validity date');
      return;
    }
    onSubmit({ validUntil: parsed, notes, terms });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{estimate ? 'Edit quotation' : 'Create quotation'}</DialogTitle>
          <DialogDescription>
            {estimate
              ? 'Only the wording and validity can change. The prices are the snapshot taken when this quotation was made.'
              : 'The priced items are copied from the job as they stand now. Later price changes will not affect this quotation.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <FormField
            id="estimate-valid-until"
            label="Valid until"
            error={error ?? undefined}
            required
          >
            <Input
              id="estimate-valid-until"
              type="date"
              value={validUntil}
              onChange={(event) => {
                setValidUntil(event.target.value);
                setError(null);
              }}
            />
          </FormField>

          <FormField id="estimate-notes" label="Notes" hint="Shown on the quotation. Optional.">
            <Textarea
              id="estimate-notes"
              rows={2}
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
              }}
            />
          </FormField>

          <FormField id="estimate-terms" label="Terms">
            <Textarea
              id="estimate-terms"
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
            {estimate ? 'Save changes' : 'Create quotation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
