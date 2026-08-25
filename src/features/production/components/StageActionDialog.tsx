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
import {
  requiresReason,
  type ProductionStatus,
  type ProductionTask,
} from '@/features/production/types';

const TITLES: Partial<Record<ProductionStatus, string>> = {
  'on-hold': 'Put this stage on hold',
  skipped: 'Skip this stage',
};

const HINTS: Partial<Record<ProductionStatus, string>> = {
  'on-hold': 'What is it waiting for? Whoever picks this up next needs to know.',
  skipped: 'Why is this stage not needed for this job?',
};

interface StageActionDialogProps {
  task: ProductionTask | null;
  toStatus: ProductionStatus;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/**
 * Asks why, when a stage stops or is passed over.
 *
 * Holding and skipping are the two moves that need an explanation: a job that
 * stalled for a reason nobody wrote down is exactly what this module exists to
 * prevent. The database requires it too, so this is the polite version of a
 * rule that holds either way.
 */
export function StageActionDialog({
  task,
  toStatus,
  isSaving,
  onCancel,
  onConfirm,
}: StageActionDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReason('');
    setError(null);
  }, [task, toStatus]);

  const submit = () => {
    if (requiresReason(toStatus) && !reason.trim()) {
      setError(toStatus === 'on-hold' ? 'Say what it is waiting for.' : 'Say why it is skipped.');
      return;
    }
    onConfirm(reason);
  };

  return (
    <Dialog
      open={task !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{TITLES[toStatus] ?? 'Update this stage'}</DialogTitle>
          <DialogDescription>
            {task ? `${task.stageName}. This is recorded against your name.` : ''}
          </DialogDescription>
        </DialogHeader>

        <FormField
          id="stage-reason"
          label="Reason"
          hint={HINTS[toStatus] ?? undefined}
          error={error ?? undefined}
          required
        >
          <Textarea
            id="stage-reason"
            rows={3}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
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
            variant={toStatus === 'on-hold' ? 'destructive' : 'default'}
            disabled={isSaving}
            onClick={submit}
          >
            {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {toStatus === 'on-hold' ? 'Put on hold' : 'Skip stage'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
