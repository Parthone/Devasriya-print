import { Loader2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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
import { checkDesignFile, humanFileSize } from '@/services/storage/design-storage.service';
import { DESIGN_MIME_TYPES, MAX_DESIGN_BYTES, type DesignMimeType } from '@/types/attachments';

export interface DesignUploadPayload {
  file: File;
  mimeType: DesignMimeType;
  originalFileName: string;
  designerNote?: string | undefined;
  submitNow: boolean;
}

interface DesignUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The version number this upload will become, for the heading. */
  nextVersion: number;
  isSaving: boolean;
  onSubmit: (payload: DesignUploadPayload) => void;
}

export function DesignUploadDialog({
  open,
  onOpenChange,
  nextVersion,
  isSaving,
  onSubmit,
}: DesignUploadDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mimeType, setMimeType] = useState<DesignMimeType | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setFile(null);
    setMimeType(null);
    setNote('');
    setError(null);
  }, [open]);

  const choose = (chosen: File | undefined) => {
    if (!chosen) return;
    const check = checkDesignFile(chosen);
    if (!check.ok) {
      setFile(null);
      setMimeType(null);
      setError(check.message);
      return;
    }
    setFile(chosen);
    setMimeType(check.mimeType);
    setError(null);
  };

  const submit = (submitNow: boolean) => {
    if (!file || !mimeType) {
      setError('Choose a design file first.');
      return;
    }
    onSubmit({
      file,
      mimeType,
      originalFileName: file.name,
      designerNote: note,
      submitNow,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload version {nextVersion}</DialogTitle>
          <DialogDescription>
            {nextVersion === 1
              ? 'The first design for this job.'
              : 'A new version. Earlier versions stay exactly as they are, with whatever the customer said about them.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <FormField
            id="design-file"
            label="Design file"
            hint={`JPG, PNG, WEBP or PDF, up to ${humanFileSize(MAX_DESIGN_BYTES)}.`}
            error={error ?? undefined}
            required
          >
            <Input
              id="design-file"
              ref={inputRef}
              type="file"
              accept={DESIGN_MIME_TYPES.join(',')}
              onChange={(event) => {
                choose(event.target.files?.[0]);
              }}
            />
          </FormField>

          {file ? (
            <p className="text-sm text-muted-foreground">
              {file.name} - {humanFileSize(file.size)}
            </p>
          ) : null}

          <FormField
            id="designer-note"
            label="Note for the customer"
            hint="Shown on their review screen. Optional."
          >
            <Textarea
              id="designer-note"
              rows={3}
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
          <Button
            type="button"
            variant="outline"
            disabled={isSaving}
            onClick={() => {
              submit(false);
            }}
          >
            Save as draft
          </Button>
          <Button
            type="button"
            disabled={isSaving}
            onClick={() => {
              submit(true);
            }}
          >
            {isSaving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="size-4" aria-hidden="true" />
            )}
            Upload and send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
