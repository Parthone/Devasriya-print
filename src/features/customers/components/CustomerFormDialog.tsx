import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { Link } from 'react-router-dom';

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
import { INDIAN_STATES, LANGUAGES, LANGUAGE_LABELS } from '@/constants/india';
import { findDuplicateMobile } from '@/features/customers/services/customer-search';
import {
  CUSTOMER_TYPES,
  CUSTOMER_TYPE_LABELS,
  customerFormSchema,
  EMPTY_CUSTOMER_VALUES,
  normaliseCustomerValues,
  toCustomerFormValues,
  type Customer,
  type CustomerFormValues,
  type CustomerInput,
} from '@/features/customers/types';
import { formatMobile } from '@/lib/phone';

interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Provided when editing; absent when adding. */
  customer?: Customer | undefined;
  /** Cached directory, used to warn about a duplicate mobile number. */
  existingCustomers: readonly Customer[];
  isSaving: boolean;
  onSubmit: (values: CustomerInput) => Promise<void>;
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  existingCustomers,
  isSaving,
  onSubmit,
}: CustomerFormDialogProps) {
  const isEdit = Boolean(customer);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: EMPTY_CUSTOMER_VALUES,
  });

  useEffect(() => {
    if (!open) return;
    reset(customer ? toCustomerFormValues(customer) : EMPTY_CUSTOMER_VALUES);
  }, [open, customer, reset]);

  const type = watch('type');
  const state = watch('state');
  const preferredLanguage = watch('preferredLanguage');
  const mobile = watch('mobile');

  // Duplicates are allowed, but staff should see them before saving.
  const duplicates = findDuplicateMobile(existingCustomers, mobile ?? '', customer?.id);

  const submit: SubmitHandler<CustomerFormValues> = async (values) => {
    await onSubmit(normaliseCustomerValues(values));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit customer' : 'Add customer'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the customer record. Customers are archived, never deleted.'
              : 'Add a customer so enquiries, jobs and invoices can be linked to them.'}
          </DialogDescription>
        </DialogHeader>

        <form
          id="customer-form"
          noValidate
          onSubmit={(event) => void handleSubmit(submit)(event)}
          className="grid gap-4 sm:grid-cols-2"
        >
          <FormField id="name" label="Customer name" error={errors.name?.message} required>
            <Input id="name" autoComplete="off" {...register('name')} />
          </FormField>

          <FormField id="type" label="Customer type" error={errors.type?.message}>
            <Select
              value={type}
              onValueChange={(value) => {
                setValue('type', value as CustomerFormValues['type'], { shouldDirty: true });
              }}
            >
              <SelectTrigger id="type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {CUSTOMER_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {CUSTOMER_TYPE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            id="businessName"
            label="Business name"
            error={errors.businessName?.message}
            hint="Optional"
            className="sm:col-span-2"
          >
            <Input id="businessName" autoComplete="off" {...register('businessName')} />
          </FormField>

          <FormField id="mobile" label="Primary mobile" error={errors.mobile?.message} required>
            <Input id="mobile" inputMode="numeric" autoComplete="off" {...register('mobile')} />
          </FormField>

          <FormField
            id="alternateMobile"
            label="Alternate mobile"
            error={errors.alternateMobile?.message}
            hint="Optional"
          >
            <Input
              id="alternateMobile"
              inputMode="numeric"
              autoComplete="off"
              {...register('alternateMobile')}
            />
          </FormField>

          {duplicates.length > 0 ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm sm:col-span-2"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-medium">
                  {formatMobile(duplicates[0]?.mobile ?? '')} is already used by another customer.
                </p>
                <p className="text-muted-foreground">
                  {duplicates.map((duplicate, index) => (
                    <span key={duplicate.id}>
                      {index > 0 ? ', ' : ''}
                      <Link
                        to={`/customers/${duplicate.id}`}
                        className="underline underline-offset-2"
                        onClick={() => {
                          onOpenChange(false);
                        }}
                      >
                        {duplicate.name}
                      </Link>
                    </span>
                  ))}
                  . You can still save if this is correct.
                </p>
              </div>
            </div>
          ) : null}

          <FormField id="email" label="Email" error={errors.email?.message} hint="Optional">
            <Input id="email" type="email" autoComplete="off" {...register('email')} />
          </FormField>

          <FormField id="gstin" label="GSTIN" error={errors.gstin?.message} hint="Optional">
            <Input
              id="gstin"
              autoComplete="off"
              className="uppercase"
              {...register('gstin', {
                onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                  setValue('gstin', event.target.value.toUpperCase(), { shouldDirty: true });
                },
              })}
            />
          </FormField>

          <FormField
            id="address"
            label="Address"
            error={errors.address?.message}
            required
            className="sm:col-span-2"
          >
            <Textarea id="address" rows={2} {...register('address')} />
          </FormField>

          <FormField id="city" label="City" error={errors.city?.message} required>
            <Input id="city" autoComplete="off" {...register('city')} />
          </FormField>

          <FormField id="pincode" label="PIN code" error={errors.pincode?.message} required>
            <Input id="pincode" inputMode="numeric" autoComplete="off" {...register('pincode')} />
          </FormField>

          <FormField id="state" label="State" error={errors.state?.message}>
            <Select
              value={state}
              onValueChange={(value) => {
                setValue('state', value as CustomerFormValues['state'], { shouldDirty: true });
              }}
            >
              <SelectTrigger id="state">
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {INDIAN_STATES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            id="preferredLanguage"
            label="Preferred language"
            error={errors.preferredLanguage?.message}
            hint="Used by future customer facing screens"
          >
            <Select
              value={preferredLanguage}
              onValueChange={(value) => {
                setValue('preferredLanguage', value as CustomerFormValues['preferredLanguage'], {
                  shouldDirty: true,
                });
              }}
            >
              <SelectTrigger id="preferredLanguage">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {LANGUAGE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            id="notes"
            label="Notes"
            error={errors.notes?.message}
            hint="Optional. Design requests belong to enquiries and jobs, not here."
            className="sm:col-span-2"
          >
            <Textarea id="notes" rows={3} {...register('notes')} />
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
          <Button type="submit" form="customer-form" disabled={isSaving}>
            {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {isEdit ? 'Save changes' : 'Add customer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
