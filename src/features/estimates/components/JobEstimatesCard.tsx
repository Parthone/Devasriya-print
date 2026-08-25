import { FileText, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-auth';
import { useCustomer } from '@/features/customers/hooks/use-customers';
import { EstimateStatusBadge } from '@/features/estimates/components/EstimateStatusBadge';
import {
  EstimateFormDialog,
  type EstimateFormPayload,
} from '@/features/estimates/components/EstimateFormDialog';
import { useCreateEstimate, useEstimatesForJob } from '@/features/estimates/hooks/use-estimates';
import type { JobPricingDocument } from '@/features/jobs/pricing-types';
import type { Job } from '@/features/jobs/types';
import { formatDate, formatMoney } from '@/lib/format';

interface JobEstimatesCardProps {
  job: Job;
  pricing: JobPricingDocument | null;
  canCreate: boolean;
}

/**
 * The quotations raised against one job.
 *
 * Creating one copies the job pricing as it stands at that moment; a job can
 * carry several quotations over time and each keeps its own prices.
 */
export function JobEstimatesCard({ job, pricing, canCreate }: JobEstimatesCardProps) {
  const currentUser = useAuthenticatedUser();
  const estimates = useEstimatesForJob(job.id);
  // The customer record fills in the address and GSTIN that go on the
  // quotation; only fetched when this user may actually raise one.
  const customerQuery = useCustomer(canCreate ? job.customerId : undefined);
  const createEstimate = useCreateEstimate({ uid: currentUser.uid, name: currentUser.name });
  const [isFormOpen, setFormOpen] = useState(false);

  const priced = (pricing?.lines.length ?? 0) > 0;

  const handleCreate = (payload: EstimateFormPayload) => {
    if (!pricing) return;
    createEstimate.mutate(
      {
        job,
        pricing,
        customer: customerQuery.data ?? null,
        validUntil: payload.validUntil,
        notes: payload.notes,
        terms: payload.terms,
      },
      {
        onSuccess: () => {
          setFormOpen(false);
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Quotations</CardTitle>
        {canCreate ? (
          <Button
            size="sm"
            variant="outline"
            disabled={!priced}
            title={priced ? undefined : 'Price the job first'}
            onClick={() => {
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" aria-hidden="true" /> Create quotation
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {estimates.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
            <FileText className="size-5" aria-hidden="true" />
            <p className="text-sm">
              {priced
                ? 'No quotation for this job yet.'
                : 'Price the job before making a quotation for it.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {estimates.map((estimate) => (
              <li key={estimate.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <Link
                    to={`/estimates/${estimate.id}`}
                    className="text-sm font-medium underline-offset-2 hover:underline"
                  >
                    {estimate.estimateNumber}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(estimate.estimateDate)} - valid until{' '}
                    {formatDate(estimate.validUntil)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-money text-sm">{formatMoney(estimate.total)}</span>
                  <EstimateStatusBadge status={estimate.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <EstimateFormDialog
        open={isFormOpen}
        onOpenChange={setFormOpen}
        isSaving={createEstimate.isPending}
        onSubmit={handleCreate}
      />
    </Card>
  );
}
