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
import { fromDateInputValue, toDateInputValue, type Enquiry } from '@/features/enquiries/types';

interface FollowUpDialogProps {
  enquiry: Enquiry | null;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (note: string, nextFollowUpAt: Date | null) => void;
}

/** Records what was said, and when to chase next. */
export function FollowUpDialog({ enquiry, isSaving, onCancel, onSubmit }: FollowUpDialogProps) {
  const [note, setNote] = useState('');
  const [nextAt, setNextAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enquiry) return;
    setNote('');
    setNextAt(toDateInputValue(enquiry.nextFollowUpAt));
    setError(null);
  }, [enquiry]);

  return (
    <Dialog
      open={enquiry !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a follow-up</DialogTitle>
          <DialogDescription>
            {enquiry ? `${enquiry.enquiryNumber} - ${enquiry.customerName}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <FormField id="follow-up-note" label="What happened?" error={error ?? undefined} required>
            <Textarea
              id="follow-up-note"
              rows={3}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setError(null);
              }}
            />
          </FormField>

          <FormField
            id="follow-up-next"
            label="Next follow-up"
            hint="Leave empty if none is needed"
          >
            <Input
              id="follow-up-next"
              type="date"
              value={nextAt}
              onChange={(event) => {
                setNextAt(event.target.value);
              }}
            />
          </FormField>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isSaving}
            onClick={() => {
              if (!note.trim()) {
                setError('Write what happened');
                return;
              }
              onSubmit(note, fromDateInputValue(nextAt));
            }}
          >
            {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Save follow-up
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
