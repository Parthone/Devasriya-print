import { Calculator, Percent, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AdjustmentDialog } from '@/features/jobs/components/AdjustmentDialog';
import { PricingLineDialog } from '@/features/jobs/components/PricingLineDialog';
import { PricingLineTable } from '@/features/jobs/components/PricingLineTable';
import { formatMoney } from '@/lib/format';
import {
  EMPTY_PRICING,
  MAX_PRICING_LINES,
  PRICING_SUMMARY_ERROR_MESSAGES,
  summarisePricing,
  type JobPricing,
  type PricingAdjustment,
  type PricingLine,
} from '@/lib/pricing';

interface JobPricingCardProps {
  /** Null when this job has not been priced yet. */
  pricing: JobPricing | null;
  isLoading: boolean;
  canEdit: boolean;
  isSaving: boolean;
  onSave: (pricing: JobPricing) => void;
}

function nextLineId(existing: PricingLine[]): string {
  const used = existing
    .map((line) => Number(line.id.replace('line-', '')))
    .filter((value) => Number.isFinite(value));
  return `line-${String((used.length > 0 ? Math.max(...used) : 0) + 1)}`;
}

/**
 * Measurements and money for a job.
 *
 * Shown to anyone who may see estimates; edited by anyone who may both change
 * jobs and create estimates. Every save rewrites lines and totals together, so
 * they cannot drift apart.
 */
export function JobPricingCard({
  pricing: stored,
  isLoading,
  canEdit,
  isSaving,
  onSave,
}: JobPricingCardProps) {
  const pricing = stored ?? EMPTY_PRICING;
  const [isLineOpen, setLineOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<PricingLine | undefined>(undefined);
  const [isAdjustmentOpen, setAdjustmentOpen] = useState(false);

  const commit = (lines: PricingLine[], adjustment: PricingAdjustment | null) => {
    const result = summarisePricing(lines, adjustment);
    if (!result.ok) {
      toast.error('Could not save the pricing', {
        description: PRICING_SUMMARY_ERROR_MESSAGES[result.code],
      });
      return;
    }
    onSave(result.pricing);
  };

  const saveLine = (line: PricingLine) => {
    const exists = pricing.lines.some((entry) => entry.id === line.id);
    const lines = exists
      ? pricing.lines.map((entry) => (entry.id === line.id ? line : entry))
      : [...pricing.lines, { ...line, id: nextLineId(pricing.lines) }];

    commit(lines, pricing.adjustment);
    setLineOpen(false);
    setEditingLine(undefined);
  };

  const removeLine = (id: string) => {
    commit(
      pricing.lines.filter((line) => line.id !== id),
      pricing.adjustment,
    );
  };

  const atLimit = pricing.lines.length >= MAX_PRICING_LINES;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Measurements & pricing</CardTitle>
            <CardDescription>
              Rates are saved with the job, so later rate card changes leave it alone.
            </CardDescription>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={isSaving || atLimit}
                onClick={() => {
                  setEditingLine(undefined);
                  setLineOpen(true);
                }}
              >
                <Plus className="size-4" aria-hidden="true" /> Add item
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={isSaving || pricing.lines.length === 0}
                onClick={() => {
                  setAdjustmentOpen(true);
                }}
              >
                <Percent className="size-4" aria-hidden="true" /> Adjust total
              </Button>
            </div>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : pricing.lines.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
            <Calculator className="size-5" aria-hidden="true" />
            <p className="text-sm">
              {canEdit
                ? 'Nothing priced yet. Add the first item to work out the cost.'
                : 'This job has not been priced yet.'}
            </p>
          </div>
        ) : (
          <>
            <PricingLineTable
              lines={pricing.lines}
              canEdit={canEdit}
              isSaving={isSaving}
              onEdit={(line) => {
                setEditingLine(line);
                setLineOpen(true);
              }}
              onRemove={removeLine}
            />

            <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-money">{formatMoney(pricing.subtotal)}</dd>
              </div>
              {pricing.adjustment ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{pricing.adjustment.reason}</dt>
                  <dd className="tabular-money">{formatMoney(pricing.adjustment.amount)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between border-t pt-1 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-money">{formatMoney(pricing.total)}</dd>
              </div>
            </dl>
          </>
        )}

        {atLimit ? (
          <p className="text-xs text-muted-foreground">
            {PRICING_SUMMARY_ERROR_MESSAGES['too-many-lines']}
          </p>
        ) : null}
      </CardContent>

      <PricingLineDialog
        open={isLineOpen}
        onOpenChange={(open) => {
          setLineOpen(open);
          if (!open) setEditingLine(undefined);
        }}
        line={editingLine}
        isSaving={isSaving}
        onSubmit={saveLine}
      />

      <AdjustmentDialog
        open={isAdjustmentOpen}
        onOpenChange={setAdjustmentOpen}
        adjustment={pricing.adjustment}
        subtotal={pricing.subtotal}
        onSubmit={(adjustment) => {
          commit(pricing.lines, adjustment);
          setAdjustmentOpen(false);
        }}
      />
    </Card>
  );
}
