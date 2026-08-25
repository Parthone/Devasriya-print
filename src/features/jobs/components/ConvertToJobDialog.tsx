import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';

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
import { fromDateInputValue, toDateInputValue, type Enquiry } from '@/features/enquiries/types';
import { useActiveLocations } from '@/features/locations/hooks/use-locations';
import { pickupSnapshotFor, type PickupSnapshot } from '@/features/locations/types';
import {
  conversionFormSchema,
  JOB_PRIORITIES,
  JOB_PRIORITY_LABELS,
  type ConversionFormValues,
  type JobPriority,
} from '@/features/jobs/types';

export interface ConversionPayload {
  title: string;
  jobDate: Date;
  priority: JobPriority;
  expectedDeliveryDate: Date | null;
  internalNotes?: string | undefined;
  pickup: PickupSnapshot;
}

interface ConvertToJobDialogProps {
  enquiry: Enquiry | null;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: (payload: ConversionPayload) => void;
}

/**
 * Turns an enquiry into a job.
 *
 * The customer, requirement text and any recording come straight from the
 * enquiry, so this only asks for what a job adds.
 */
export function ConvertToJobDialog({
  enquiry,
  isSaving,
  onCancel,
  onConfirm,
}: ConvertToJobDialogProps) {
  const locations = useActiveLocations();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ConversionFormValues>({
    resolver: zodResolver(conversionFormSchema),
    defaultValues: {
      title: '',
      jobDate: '',
      priority: 'normal',
      expectedDeliveryDate: '',
      pickupLocationId: '',
      internalNotes: '',
    },
  });

  useEffect(() => {
    if (!enquiry) return;
    reset({
      title: enquiry.requirementText.slice(0, 60),
      jobDate: toDateInputValue(new Date()),
      priority: 'normal',
      expectedDeliveryDate: '',
      pickupLocationId: '',
      internalNotes: '',
    });
  }, [enquiry, reset]);

  const priority = watch('priority');
  const pickupLocationId = watch('pickupLocationId');

  const submit: SubmitHandler<ConversionFormValues> = (values) => {
    const location = locations.find((entry) => entry.id === values.pickupLocationId) ?? null;
    onConfirm({
      title: values.title,
      jobDate: fromDateInputValue(values.jobDate) ?? new Date(),
      priority: values.priority,
      expectedDeliveryDate: fromDateInputValue(values.expectedDeliveryDate),
      internalNotes: values.internalNotes,
      pickup: pickupSnapshotFor(location),
    });
  };

  return (
    <Dialog
      open={enquiry !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Convert to job</DialogTitle>
          <DialogDescription>
            {enquiry
              ? `${enquiry.enquiryNumber} for ${enquiry.customerName}. The requirement and any recording are carried over.`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <form
          id="convert-form"
          noValidate
          onSubmit={(event) => void handleSubmit(submit)(event)}
          className="grid gap-4 sm:grid-cols-2"
        >
          <FormField
            id="title"
            label="Job title"
            error={errors.title?.message}
            required
            className="sm:col-span-2"
          >
            <Input id="title" {...register('title')} />
          </FormField>

          <FormField id="jobDate" label="Job date" error={errors.jobDate?.message} required>
            <Input id="jobDate" type="date" {...register('jobDate')} />
          </FormField>

          <FormField
            id="expectedDeliveryDate"
            label="Expected delivery"
            error={errors.expectedDeliveryDate?.message}
            hint="Optional"
          >
            <Input id="expectedDeliveryDate" type="date" {...register('expectedDeliveryDate')} />
          </FormField>

          <FormField id="priority" label="Priority" error={errors.priority?.message}>
            <Select
              value={priority}
              onValueChange={(value) => {
                setValue('priority', value as JobPriority, { shouldDirty: true });
              }}
            >
              <SelectTrigger id="priority">
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

          <FormField
            id="pickupLocationId"
            label="Pickup office"
            hint={
              locations.length === 0 ? 'No offices configured yet' : 'Where the customer collects'
            }
          >
            <Select
              value={pickupLocationId ?? ''}
              disabled={locations.length === 0}
              onValueChange={(value) => {
                setValue('pickupLocationId', value, { shouldDirty: true });
              }}
            >
              <SelectTrigger id="pickupLocationId">
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
            id="internalNotes"
            label="Internal notes"
            error={errors.internalNotes?.message}
            hint="Optional"
            className="sm:col-span-2"
          >
            <Textarea id="internalNotes" rows={2} {...register('internalNotes')} />
          </FormField>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" form="convert-form" disabled={isSaving}>
            {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Create job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
