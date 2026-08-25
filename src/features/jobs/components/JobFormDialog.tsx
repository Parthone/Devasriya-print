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
import { toDateInputValue } from '@/features/enquiries/types';
import { useActiveLocations } from '@/features/locations/hooks/use-locations';
import { pickupSnapshotFor } from '@/features/locations/types';
import {
  EMPTY_JOB_VALUES,
  JOB_PRIORITIES,
  JOB_PRIORITY_LABELS,
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  jobFormSchema,
  normaliseJobValues,
  toJobFormValues,
  type Job,
  type JobFormValues,
  type JobInput,
} from '@/features/jobs/types';
import type { LocalRecording } from '@/lib/audio/use-audio-recorder';

export interface JobSubmitPayload {
  input: JobInput;
  customer: Customer;
  recording: LocalRecording | null;
  change: RecordingChange;
}

interface JobFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job?: Job | undefined;
  isSaving: boolean;
  onSubmit: (payload: JobSubmitPayload) => Promise<void>;
}

export function JobFormDialog({ open, onOpenChange, job, isSaving, onSubmit }: JobFormDialogProps) {
  const isEdit = Boolean(job);
  const locations = useActiveLocations();
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
  } = useForm<JobFormValues>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: EMPTY_JOB_VALUES,
  });

  useEffect(() => {
    if (!open) return;
    setRecording(null);
    setRemoveAudio(false);
    setCustomer(null);
    setCustomerError(null);
    reset(
      job ? toJobFormValues(job) : { ...EMPTY_JOB_VALUES, jobDate: toDateInputValue(new Date()) },
    );
  }, [open, job, reset]);

  const priority = watch('priority');
  const status = watch('status');
  const customerId = watch('customerId');
  const pickupLocationId = watch('pickupLocationId');

  const submit: SubmitHandler<JobFormValues> = async (values) => {
    const chosen =
      customer ??
      (job && job.customerId === values.customerId
        ? ({ id: job.customerId, name: job.customerName, mobile: job.customerMobile } as Customer)
        : null);

    if (!chosen) {
      setCustomerError('Choose a customer');
      return;
    }

    const location = locations.find((entry) => entry.id === values.pickupLocationId) ?? null;
    const change: RecordingChange = recording
      ? { type: 'replace', recording }
      : removeAudio
        ? { type: 'remove' }
        : { type: 'keep' };

    await onSubmit({
      input: normaliseJobValues(values, pickupSnapshotFor(location)),
      customer: chosen,
      recording,
      change,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit job' : 'New job'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the job details. Pricing, designs and production come from their own modules.'
              : 'Create a job directly, for a repeat or walk-in order with no enquiry.'}
          </DialogDescription>
        </DialogHeader>

        <form
          id="job-form"
          noValidate
          onSubmit={(event) => void handleSubmit(submit)(event)}
          className="grid gap-4 sm:grid-cols-2"
        >
          <FormField
            id="job-customer"
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
            id="job-title"
            label="Job title"
            error={errors.title?.message}
            required
            className="sm:col-span-2"
          >
            <Input id="job-title" {...register('title')} />
          </FormField>

          <FormField id="jobDate" label="Job date" error={errors.jobDate?.message} required>
            <Input id="jobDate" type="date" {...register('jobDate')} />
          </FormField>

          <FormField
            id="job-delivery"
            label="Expected delivery"
            error={errors.expectedDeliveryDate?.message}
            hint="Optional"
          >
            <Input id="job-delivery" type="date" {...register('expectedDeliveryDate')} />
          </FormField>

          <FormField
            id="job-requirement"
            label="Requirement"
            error={errors.requirementText?.message}
            required
            className="sm:col-span-2"
          >
            <Textarea id="job-requirement" rows={3} {...register('requirementText')} />
          </FormField>

          <div className="sm:col-span-2">
            <p className="mb-1.5 text-sm font-medium">Voice requirement</p>
            <AudioRecorderField
              existing={removeAudio ? null : job?.requirementAudio}
              disabled={isSaving}
              onChange={(take, removeExisting) => {
                setRecording(take);
                setRemoveAudio(removeExisting);
              }}
            />
          </div>

          <FormField id="job-priority" label="Priority" error={errors.priority?.message}>
            <Select
              value={priority}
              onValueChange={(value) => {
                setValue('priority', value as JobFormValues['priority'], { shouldDirty: true });
              }}
            >
              <SelectTrigger id="job-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JOB_PRIORITIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {JOB_PRIORITY_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField id="job-status" label="Status" error={errors.status?.message}>
            <Select
              value={status}
              onValueChange={(value) => {
                setValue('status', value as JobFormValues['status'], { shouldDirty: true });
              }}
            >
              <SelectTrigger id="job-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JOB_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {JOB_STATUS_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            id="job-pickup"
            label="Pickup office"
            hint={
              locations.length === 0 ? 'No offices configured yet' : 'Where the customer collects'
            }
            className="sm:col-span-2"
          >
            <Select
              value={pickupLocationId ?? ''}
              disabled={locations.length === 0}
              onValueChange={(value) => {
                setValue('pickupLocationId', value, { shouldDirty: true });
              }}
            >
              <SelectTrigger id="job-pickup">
                <SelectValue placeholder="Select office" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            id="job-notes"
            label="Internal notes"
            error={errors.internalNotes?.message}
            hint="Optional"
            className="sm:col-span-2"
          >
            <Textarea id="job-notes" rows={2} {...register('internalNotes')} />
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
          <Button type="submit" form="job-form" disabled={isSaving}>
            {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {isEdit ? 'Save changes' : 'Create job'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
