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
import {
  EMPTY_LOCATION_VALUES,
  locationFormSchema,
  normaliseLocationValues,
  toLocationFormValues,
  type Location,
  type LocationFormValues,
  type LocationInput,
} from '@/features/locations/types';

interface LocationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location?: Location | undefined;
  isSaving: boolean;
  onSubmit: (input: LocationInput) => Promise<void>;
}

export function LocationFormDialog({
  open,
  onOpenChange,
  location,
  isSaving,
  onSubmit,
}: LocationFormDialogProps) {
  const isEdit = Boolean(location);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<LocationFormValues>({
    resolver: zodResolver(locationFormSchema),
    defaultValues: EMPTY_LOCATION_VALUES,
  });

  useEffect(() => {
    if (!open) return;
    reset(location ? toLocationFormValues(location) : EMPTY_LOCATION_VALUES);
  }, [open, location, reset]);

  const isActive = watch('isActive');

  const submit: SubmitHandler<LocationFormValues> = async (values) => {
    await onSubmit(normaliseLocationValues(values));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit office' : 'Add pickup office'}</DialogTitle>
          <DialogDescription>
            Customers collect finished work here, and contact this person about status or payment.
          </DialogDescription>
        </DialogHeader>

        <form
          id="location-form"
          noValidate
          onSubmit={(event) => void handleSubmit(submit)(event)}
          className="grid gap-4 sm:grid-cols-2"
        >
          <FormField
            id="loc-name"
            label="Office name"
            error={errors.name?.message}
            required
            className="sm:col-span-2"
          >
            <Input id="loc-name" {...register('name')} />
          </FormField>

          <FormField
            id="loc-address"
            label="Address"
            error={errors.address?.message}
            required
            className="sm:col-span-2"
          >
            <Textarea id="loc-address" rows={2} {...register('address')} />
          </FormField>

          <FormField
            id="loc-phone"
            label="Office phone"
            error={errors.phone?.message}
            hint="Optional"
          >
            <Input id="loc-phone" inputMode="numeric" {...register('phone')} />
          </FormField>

          <FormField id="loc-active" label="Available for pickup">
            <Select
              value={isActive ? 'yes' : 'no'}
              onValueChange={(value) => {
                setValue('isActive', value === 'yes', { shouldDirty: true });
              }}
            >
              <SelectTrigger id="loc-active">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            id="loc-contact-name"
            label="Contact person"
            error={errors.contactName?.message}
            hint="Who the customer should ask for"
          >
            <Input id="loc-contact-name" {...register('contactName')} />
          </FormField>

          <FormField
            id="loc-contact-mobile"
            label="Contact mobile"
            error={errors.contactMobile?.message}
            hint="Optional"
          >
            <Input id="loc-contact-mobile" inputMode="numeric" {...register('contactMobile')} />
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
          <Button type="submit" form="location-form" disabled={isSaving}>
            {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {isEdit ? 'Save changes' : 'Add office'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
