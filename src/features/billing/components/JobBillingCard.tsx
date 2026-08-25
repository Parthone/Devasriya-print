import { Plus, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-auth';
import {
  InvoiceFormDialog,
  type InvoiceFormPayload,
} from '@/features/billing/components/InvoiceFormDialog';
import { InvoiceStatusBadge } from '@/features/billing/components/InvoiceStatusBadge';
import { useCreateInvoice, useInvoicesForJob } from '@/features/billing/hooks/use-billing';
import { outstandingTotal } from '@/features/billing/services/billing-search';
import { useCustomer } from '@/features/customers/hooks/use-customers';
import type { JobPricingDocument } from '@/features/jobs/pricing-types';
import type { Job } from '@/features/jobs/types';
import { formatDate, formatMoney } from '@/lib/format';

interface JobBillingCardProps {
  job: Job;
  pricing: JobPricingDocument | null;
  canView: boolean;
  canCreate: boolean;
}

/**
 * The bills raised against one job, and what is still owed on them.
 *
 * A job may be billed more than once - part billing is normal - and each
 * invoice keeps its own discount, total and payment history.
 */
export function JobBillingCard({ job, pricing, canView, canCreate }: JobBillingCardProps) {
  const currentUser = useAuthenticatedUser();
  const invoices = useInvoicesForJob(job.id, { enabled: canView });
  // The customer record fills in the address and GSTIN that go on the bill;
  // only fetched when this user may actually raise one.
  const customerQuery = useCustomer(canCreate ? job.customerId : undefined);
  const createInvoice = useCreateInvoice({ uid: currentUser.uid, name: currentUser.name });
  const [isFormOpen, setFormOpen] = useState(false);

  const priced = (pricing?.lines.length ?? 0) > 0 && (pricing?.total.paise ?? 0) > 0;
  const outstanding = outstandingTotal(invoices);

  const handleCreate = (payload: InvoiceFormPayload) => {
    if (!pricing) return;
    createInvoice.mutate(
      {
        job,
        pricing,
        customer: customerQuery.data ?? null,
        discount: payload.discount,
        discountReason: payload.discountReason,
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
        <CardTitle>Billing</CardTitle>
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
            <Plus className="size-4" aria-hidden="true" /> Raise invoice
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {invoices.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
            <ReceiptText className="size-5" aria-hidden="true" />
            <p className="text-sm">
              {priced ? 'No invoice for this job yet.' : 'Price the job before billing it.'}
            </p>
          </div>
        ) : (
          <>
            <ul className="divide-y">
              {invoices.map((invoice) => (
                <li key={invoice.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link
                      to={`/billing/${invoice.id}`}
                      className="text-sm font-medium underline-offset-2 hover:underline"
                    >
                      {invoice.invoiceNumber}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(invoice.invoiceDate)} - {formatMoney(invoice.paid)} received
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-money text-sm">{formatMoney(invoice.total)}</span>
                    <InvoiceStatusBadge status={invoice.status} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex justify-between border-t pt-3 text-sm font-medium">
              <span>Outstanding on this job</span>
              <span className="tabular-money">{formatMoney(outstanding)}</span>
            </p>
          </>
        )}
      </CardContent>

      {pricing ? (
        <InvoiceFormDialog
          open={isFormOpen}
          onOpenChange={setFormOpen}
          jobTotal={pricing.total}
          isSaving={createInvoice.isPending}
          onSubmit={handleCreate}
        />
      ) : null}
    </Card>
  );
}
