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
import type { DecisionOutcome, Design } from '@/features/designs/types';

const TITLES: Record<DecisionOutcome, string> = {
  approved: 'Record customer approval',
  'changes-requested': 'Record a change request',
  rejected: 'Record customer rejection',
};

const HINTS: Record<DecisionOutcome, string> = {
  approved:
    'Write down anything they said alongside the approval, such as "approved, make the font bigger".',
  'changes-requested': 'What did they ask you to change?',
  rejected: 'Why did they turn it down?',
};

interface StaffDecisionDialogProps {
  design: Design | null;
  outcome: DecisionOutcome;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: (comment: string) => void;
}

/**
 * Records what the customer said, when they said it to a person rather than in
 * the portal. It is stored with `source: 'staff'` and the staff member's own
 * name - the security rules will not let it be filed as though the customer
 * had typed it themselves.
 */
export function StaffDecisionDialog({
  design,
  outcome,
  isSaving,
  onCancel,
  onConfirm,
}: StaffDecisionDialogProps) {
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setComment('');
    setError(null);
  }, [design, outcome]);

  const submit = () => {
    if (outcome !== 'approved' && !comment.trim()) {
      setError('Write down what they said.');
      return;
    }
    onConfirm(comment);
  };

  return (
    <Dialog
      open={design !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{TITLES[outcome]}</DialogTitle>
          <DialogDescription>
            {design
              ? `Version ${String(design.version)} of ${design.jobNumber}, for ${design.customerName}. Recorded against your name.`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <FormField
          id="staff-decision-comment"
          label="What the customer said"
          hint={HINTS[outcome]}
          error={error ?? undefined}
          required={outcome !== 'approved'}
        >
          <Textarea
            id="staff-decision-comment"
            rows={3}
            value={comment}
            onChange={(event) => {
              setComment(event.target.value);
              setError(null);
            }}
          />
        </FormField>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={outcome === 'rejected' ? 'destructive' : 'default'}
            disabled={isSaving}
            onClick={submit}
          >
            {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Record it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
