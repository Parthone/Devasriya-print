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
  EMPTY_PRODUCT_VALUES,
  normaliseProductValues,
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
  productFormSchema,
  toProductFormValues,
  type Product,
  type ProductFormValues,
  type ProductInput,
} from '@/features/products/types';
import {
  PRICING_METHODS,
  PRICING_METHOD_LABELS,
  RATE_UNIT_FOR_METHOD,
  RATE_UNIT_LABELS,
} from '@/lib/pricing';

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | undefined;
  isSaving: boolean;
  onSubmit: (input: ProductInput) => Promise<void>;
}

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  isSaving,
  onSubmit,
}: ProductFormDialogProps) {
  const isEdit = Boolean(product);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: EMPTY_PRODUCT_VALUES,
  });

  useEffect(() => {
    if (!open) return;
    reset(product ? toProductFormValues(product) : EMPTY_PRODUCT_VALUES);
  }, [open, product, reset]);

  const category = watch('category');
  const pricingMethod = watch('pricingMethod');
  const isActive = watch('isActive');

  const submit: SubmitHandler<ProductFormValues> = async (values) => {
    await onSubmit(normaliseProductValues(values));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit rate card item' : 'Add rate card item'}</DialogTitle>
          <DialogDescription>
            The default rate is a starting point. Changing it here never changes jobs that are
            already priced.
          </DialogDescription>
        </DialogHeader>

        <form
          id="product-form"
          noValidate
          onSubmit={(event) => void handleSubmit(submit)(event)}
          className="grid gap-4 sm:grid-cols-2"
        >
          <FormField
            id="product-name"
            label="Item name"
            error={errors.name?.message}
            required
            className="sm:col-span-2"
          >
            <Input id="product-name" {...register('name')} />
          </FormField>

          <FormField id="product-category" label="Category" error={errors.category?.message}>
            <Select
              value={category}
              onValueChange={(value) => {
                setValue('category', value as ProductFormValues['category'], {
                  shouldDirty: true,
                });
              }}
            >
              <SelectTrigger id="product-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_CATEGORIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {PRODUCT_CATEGORY_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            id="product-method"
            label="Pricing method"
            error={errors.pricingMethod?.message}
          >
            <Select
              value={pricingMethod}
              onValueChange={(value) => {
                setValue('pricingMethod', value as ProductFormValues['pricingMethod'], {
                  shouldDirty: true,
                });
              }}
            >
              <SelectTrigger id="product-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRICING_METHODS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {PRICING_METHOD_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            id="product-rate"
            label={`Default rate per ${RATE_UNIT_LABELS[RATE_UNIT_FOR_METHOD[pricingMethod]]}`}
            error={errors.defaultRate?.message}
            hint="In rupees"
            required
          >
            <Input id="product-rate" inputMode="decimal" {...register('defaultRate')} />
          </FormField>

          <FormField id="product-active" label="Available for new jobs">
            <Select
              value={isActive ? 'yes' : 'no'}
              onValueChange={(value) => {
                setValue('isActive', value === 'yes', { shouldDirty: true });
              }}
            >
              <SelectTrigger id="product-active">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            id="product-description"
            label="Description"
            error={errors.description?.message}
            hint="Optional"
            className="sm:col-span-2"
          >
            <Textarea id="product-description" rows={2} {...register('description')} />
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
          <Button type="submit" form="product-form" disabled={isSaving}>
            {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {isEdit ? 'Save changes' : 'Add item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
