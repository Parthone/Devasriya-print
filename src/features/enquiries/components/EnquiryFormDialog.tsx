import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';

import { AudioRecorderField } from '@/components/audio/AudioRecorderField';
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
import { CustomerPicker } from '@/features/customers/components/CustomerPicker';
import type { Customer } from '@/features/customers/types';
import type { RecordingChange } from '@/features/enquiries/services/enquiry-workflow';
import {
  EMPTY_ENQUIRY_VALUES,
  ENQUIRY_SOURCES,
  ENQUIRY_SOURCE_LABELS,
  ENQUIRY_STATUS_LABELS,
  SELECTABLE_ENQUIRY_STATUSES,
  enquiryFormSchema,
  normaliseEnquiryValues,
  toDateInputValue,
  toEnquiryFormValues,
  type Enquiry,
  type EnquiryFormValues,
  type EnquiryInput,
} from '@/features/enquiries/types';
import type { LocalRecording } from '@/lib/audio/use-audio-recorder';

export interface EnquirySubmitPayload {
  input: EnquiryInput;
  customer: Customer;
  recording: LocalRecording | null;
  change: RecordingChange;
}

interface EnquiryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enquiry?: Enquiry | undefined;
  isSaving: boolean;
  onSubmit: (payload: EnquirySubmitPayload) => Promise<void>;
}

export function EnquiryFormDialog({
  open,
  onOpenChange,
  enquiry,
  isSaving,
  onSubmit,
}: EnquiryFormDialogProps) {
  const isEdit = Boolean(enquiry);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [recording, setRecording] = useState<LocalRecording | null>(null);
  const [removeAudio, setRemoveAudio] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<EnquiryFormValues>({
    resolver: zodResolver(enquiryFormSchema),
    defaultValues: EMPTY_ENQUIRY_VALUES,
  });

  useEffect(() => {
    if (!open) return;
    setRecording(null);
    setRemoveAudio(false);
    setCustomerError(null);
    setCustomer(null);
    reset(
      enquiry
        ? toEnquiryFormValues(enquiry)
        : { ...EMPTY_ENQUIRY_VALUES, enquiryDate: toDateInputValue(new Date()) },
    );
  }, [open, enquiry, reset]);

  const source = watch('source');
  const status = watch('status');
  const customerId = watch('customerId');

  const submit: SubmitHandler<EnquiryFormValues> = async (values) => {
    const chosen =
      customer ??
      (enquiry && enquiry.customerId === values.customerId
        ? ({
            id: enquiry.customerId,
            name: enquiry.customerName,
            mobile: enquiry.customerMobile,
          } as Customer)
        : null);

    if (!chosen) {
      setCustomerError('Choose a customer');
      return;
    }

    const change: RecordingChange = recording
      ? { type: 'replace', recording }
      : removeAudio
        ? { type: 'remove' }
        : { type: 'keep' };

    await onSubmit({
      input: normaliseEnquiryValues(values),
      customer: chosen,
      recording,
      change,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit enquiry' : 'New enquiry'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update what the customer asked for and where the enquiry stands.'
              : 'Record what a customer needs. Convert it to a job when the work is confirmed.'}
          </DialogDescription>
        </DialogHeader>

        <form
          id="enquiry-form"
          noValidate
          onSubmit={(event) => void handleSubmit(submit)(event)}
          className="grid gap-4 sm:grid-cols-2"
        >
          <FormField
            id="customerId"
            label="Customer"
            error={errors.customerId?.message ?? customerError ?? undefined}
            required
            className="sm:col-span-2"
          >
            <CustomerPicker
              value={customerId}
              onSelect={(chosen) => {
                setCustomer(chosen);
                setCustomerError(null);
                setValue('customerId', chosen?.id ?? '', { shouldDirty: true });
              }}
            />
          </FormField>

          <FormField
            id="enquiryDate"
            label="Enquiry date"
            error={errors.enquiryDate?.message}
            required
          >
            <Input id="enquiryDate" type="date" {...register('enquiryDate')} />
          </FormField>

          <FormField id="source" label="Source" error={errors.source?.message}>
            <Select
              value={source}
              onValueChange={(value) => {
                setValue('source', value as EnquiryFormValues['source'], { shouldDirty: true });
              }}
            >
              <SelectTrigger id="source">
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                {ENQUIRY_SOURCES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {ENQUIRY_SOURCE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            id="requirementText"
            label="Requirement"
            error={errors.requirementText?.message}
            hint="What does the customer want printed or made?"
            required
            className="sm:col-span-2"
          >
            <Textarea id="requirementText" rows={3} {...register('requirementText')} />
          </FormField>

          <div className="sm:col-span-2">
            <p className="mb-1.5 text-sm font-medium">Voice requirement</p>
            <AudioRecorderField
              existing={removeAudio ? null : enquiry?.requirementAudio}
              disabled={isSaving}
              onChange={(take, removeExisting) => {
                setRecording(take);
                setRemoveAudio(removeExisting);
              }}
            />
          </div>

          <FormField
            id="nextFollowUpAt"
            label="Next follow-up"
            error={errors.nextFollowUpAt?.message}
            hint="Optional"
          >
            <Input id="nextFollowUpAt" type="date" {...register('nextFollowUpAt')} />
          </FormField>

          <FormField id="status" label="Status" error={errors.status?.message}>
            <Select
              value={status}
              disabled={enquiry?.status === 'converted'}
              onValueChange={(value) => {
                setValue('status', value as EnquiryFormValues['status'], { shouldDirty: true });
              }}
            >
              <SelectTrigger id="status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {SELECTABLE_ENQUIRY_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {ENQUIRY_STATUS_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {status === 'lost' ? (
            <FormField
              id="lostReason"
              label="Why was it lost?"
              error={errors.lostReason?.message}
              required
              className="sm:col-span-2"
            >
              <Input id="lostReason" {...register('lostReason')} />
            </FormField>
          ) : null}

          <FormField
            id="notes"
            label="Notes"
            error={errors.notes?.message}
            hint="Optional, internal"
            className="sm:col-span-2"
          >
            <Textarea id="notes" rows={2} {...register('notes')} />
          </FormField>
        </form>

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
          <Button type="submit" form="enquiry-form" disabled={isSaving}>
            {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {isEdit ? 'Save changes' : 'Create enquiry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
