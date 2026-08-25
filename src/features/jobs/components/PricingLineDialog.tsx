import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

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
import { useActiveProducts } from '@/features/products/hooks/use-products';
import { moneyToRupeeInput, rupeesToMoney } from '@/features/products/types';
import { formatMoney } from '@/lib/format';
import {
  MEASUREMENT_UNITS,
  MEASUREMENT_UNIT_LABELS,
  type MeasurementUnit,
} from '@/lib/measurement';
import {
  calculateLine,
  describeLineCalculation,
  isAreaMethod,
  isLengthMethod,
  needsQuantity,
  PRICING_ERROR_MESSAGES,
  PRICING_METHODS,
  PRICING_METHOD_LABELS,
  RATE_UNIT_FOR_METHOD,
  RATE_UNIT_LABELS,
  type PricingLine,
  type PricingMethod,
} from '@/lib/pricing';

const NO_PRODUCT = 'custom';

interface PricingLineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Provided when editing an existing line. */
  line?: PricingLine | undefined;
  isSaving: boolean;
  onSubmit: (line: PricingLine) => void;
}

interface FormState {
  productId: string;
  productName: string;
  pricingMethod: PricingMethod;
  measurementUnit: MeasurementUnit;
  width: string;
  height: string;
  length: string;
  quantity: string;
  rate: string;
  notes: string;
}

const EMPTY: FormState = {
  productId: NO_PRODUCT,
  productName: '',
  pricingMethod: 'per-square-foot',
  measurementUnit: 'foot',
  width: '',
  height: '',
  length: '',
  quantity: '1',
  rate: '',
  notes: '',
};

function toNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function lineToState(line: PricingLine): FormState {
  return {
    productId: line.productId ?? NO_PRODUCT,
    productName: line.productName,
    pricingMethod: line.pricingMethod,
    measurementUnit: 'measurementUnit' in line ? line.measurementUnit : EMPTY.measurementUnit,
    width: 'width' in line ? String(line.width) : '',
    height: 'height' in line ? String(line.height) : '',
    length: 'length' in line ? String(line.length) : '',
    quantity: String(line.quantity),
    rate: moneyToRupeeInput(line.rate),
    notes: line.notes ?? '',
  };
}

/**
 * Adds or edits one priced item.
 *
 * The preview under the form is produced by the same calculation that will be
 * saved, so what somebody reads before saving is exactly what is stored.
 */
export function PricingLineDialog({
  open,
  onOpenChange,
  line,
  isSaving,
  onSubmit,
}: PricingLineDialogProps) {
  const products = useActiveProducts(open);
  const [state, setState] = useState<FormState>(EMPTY);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShowErrors(false);
    setState(line ? lineToState(line) : EMPTY);
  }, [open, line]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((current) => ({ ...current, [key]: value }));
  };

  const chooseProduct = (productId: string) => {
    if (productId === NO_PRODUCT) {
      set('productId', NO_PRODUCT);
      return;
    }
    const product = products.find((entry) => entry.id === productId);
    if (!product) return;

    setState((current) => ({
      ...current,
      productId,
      productName: product.name,
      pricingMethod: product.pricingMethod,
      // Prefilled from the rate card, but the person pricing can change it.
      rate: moneyToRupeeInput(product.defaultRate),
    }));
  };

  const result = useMemo(
    () =>
      calculateLine({
        id: line?.id ?? 'preview',
        productId: state.productId === NO_PRODUCT ? null : state.productId,
        productName: state.productName,
        pricingMethod: state.pricingMethod,
        measurementUnit: state.measurementUnit,
        width: toNumber(state.width),
        height: toNumber(state.height),
        length: toNumber(state.length),
        quantity: Number(state.quantity),
        rate: rupeesToMoney(state.rate || '0'),
        notes: state.notes,
      }),
    [line, state],
  );

  const method = state.pricingMethod;
  const rateUnitLabel = RATE_UNIT_LABELS[RATE_UNIT_FOR_METHOD[method]];

  const submit = () => {
    if (!result.ok) {
      setShowErrors(true);
      return;
    }
    onSubmit(result.line);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{line ? 'Edit priced item' : 'Add priced item'}</DialogTitle>
          <DialogDescription>
            Pick an item from the rate card, or describe one yourself. The rate can be changed for
            this job without touching the rate card.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="pricing-product" label="Rate card item" className="sm:col-span-2">
            <Select value={state.productId} onValueChange={chooseProduct}>
              <SelectTrigger id="pricing-product">
                <SelectValue placeholder="Choose an item" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PRODUCT}>Custom item (not on the rate card)</SelectItem>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            id="pricing-name"
            label="Description"
            required
            className="sm:col-span-2"
            error={
              showErrors && !result.ok && result.code === 'missing-product-name'
                ? PRICING_ERROR_MESSAGES[result.code]
                : undefined
            }
          >
            <Input
              id="pricing-name"
              value={state.productName}
              onChange={(event) => {
                set('productName', event.target.value);
              }}
            />
          </FormField>

          <FormField id="pricing-method" label="Pricing method">
            <Select
              value={method}
              onValueChange={(value) => {
                set('pricingMethod', value as PricingMethod);
              }}
            >
              <SelectTrigger id="pricing-method">
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
            id="pricing-rate"
            label={`Rate per ${rateUnitLabel}`}
            required
            error={
              showErrors && !result.ok && result.code === 'invalid-rate'
                ? PRICING_ERROR_MESSAGES[result.code]
                : undefined
            }
          >
            <Input
              id="pricing-rate"
              inputMode="decimal"
              value={state.rate}
              onChange={(event) => {
                set('rate', event.target.value);
              }}
            />
          </FormField>

          {isAreaMethod(method) || isLengthMethod(method) ? (
            <FormField id="pricing-unit" label="Measured in">
              <Select
                value={state.measurementUnit}
                onValueChange={(value) => {
                  set('measurementUnit', value as MeasurementUnit);
                }}
              >
                <SelectTrigger id="pricing-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEASUREMENT_UNITS.map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {MEASUREMENT_UNIT_LABELS[unit]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          ) : null}

          {isAreaMethod(method) ? (
            <>
              <FormField
                id="pricing-width"
                label="Width"
                required
                error={
                  showErrors &&
                  !result.ok &&
                  ['missing-width', 'invalid-measurement'].includes(result.code)
                    ? PRICING_ERROR_MESSAGES[result.code]
                    : undefined
                }
              >
                <Input
                  id="pricing-width"
                  inputMode="decimal"
                  value={state.width}
                  onChange={(event) => {
                    set('width', event.target.value);
                  }}
                />
              </FormField>

              <FormField
                id="pricing-height"
                label="Height"
                required
                error={
                  showErrors && !result.ok && result.code === 'missing-height'
                    ? PRICING_ERROR_MESSAGES[result.code]
                    : undefined
                }
              >
                <Input
                  id="pricing-height"
                  inputMode="decimal"
                  value={state.height}
                  onChange={(event) => {
                    set('height', event.target.value);
                  }}
                />
              </FormField>
            </>
          ) : null}

          {isLengthMethod(method) ? (
            <FormField
              id="pricing-length"
              label="Length"
              required
              error={
                showErrors &&
                !result.ok &&
                ['missing-length', 'invalid-measurement'].includes(result.code)
                  ? PRICING_ERROR_MESSAGES[result.code]
                  : undefined
              }
            >
              <Input
                id="pricing-length"
                inputMode="decimal"
                value={state.length}
                onChange={(event) => {
                  set('length', event.target.value);
                }}
              />
            </FormField>
          ) : null}

          {needsQuantity(method) ? (
            <FormField
              id="pricing-quantity"
              label="Quantity"
              required
              error={
                showErrors && !result.ok && result.code === 'invalid-quantity'
                  ? PRICING_ERROR_MESSAGES[result.code]
                  : undefined
              }
            >
              <Input
                id="pricing-quantity"
                inputMode="numeric"
                value={state.quantity}
                onChange={(event) => {
                  set('quantity', event.target.value);
                }}
              />
            </FormField>
          ) : null}

          <FormField id="pricing-notes" label="Notes" hint="Optional" className="sm:col-span-2">
            <Textarea
              id="pricing-notes"
              rows={2}
              value={state.notes}
              onChange={(event) => {
                set('notes', event.target.value);
              }}
            />
          </FormField>

          <div className="rounded-md border bg-muted/40 p-3 sm:col-span-2" aria-live="polite">
            {result.ok ? (
              <p className="text-sm">
                <span className="text-muted-foreground">
                  {describeLineCalculation(result.line, formatMoney)}
                </span>{' '}
                <span className="font-semibold">= {formatMoney(result.line.lineAmount)}</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{PRICING_ERROR_MESSAGES[result.code]}</p>
            )}
          </div>
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
          <Button type="button" onClick={submit} disabled={isSaving}>
            {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {line ? 'Save item' : 'Add item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
