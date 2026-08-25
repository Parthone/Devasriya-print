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
import { Textarea } from '@/components/ui/textarea';
import type { Estimate } from '@/features/estimates/types';

interface DecisionDialogProps {
  estimate: Estimate | null;
  outcome: 'approved' | 'rejected';
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: (note: string | undefined) => void;
}

/**
 * Records what the customer said.
 *
 * Until the customer portal exists, a staff member enters this on their behalf,
 * so the record keeps who entered it, when, and any comment the customer gave.
 */
export function DecisionDialog({
  estimate,
  outcome,
  isSaving,
  onCancel,
  onConfirm,
}: DecisionDialogProps) {
  const [note, setNote] = useState('');

  useEffect(() => {
    setNote('');
  }, [estimate, outcome]);

  const approving = outcome === 'approved';

  return (
    <Dialog
      open={estimate !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {approving ? 'Record customer approval' : 'Record customer rejection'}
          </DialogTitle>
          <DialogDescription>
            {estimate
              ? `${estimate.estimateNumber} for ${estimate.customerName}. This is recorded against your name and cannot be undone.`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <FormField
          id="decision-note"
          label={approving ? 'What did the customer say?' : 'Why was it rejected?'}
          hint="Optional"
        >
          <Textarea
            id="decision-note"
            rows={3}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
        </FormField>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={approving ? 'default' : 'destructive'}
            disabled={isSaving}
            onClick={() => {
              onConfirm(note.trim() ? note : undefined);
            }}
          >
            {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {approving ? 'Record approval' : 'Record rejection'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
