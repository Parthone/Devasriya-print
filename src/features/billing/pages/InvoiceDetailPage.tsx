import { ArrowLeft, IndianRupee, Printer } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES } from '@/constants/routes';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-auth';
import { InvoiceView } from '@/features/billing/components/InvoiceView';
import { PaymentHistory } from '@/features/billing/components/PaymentHistory';
import {
  RecordPaymentDialog,
  type PaymentPayload,
} from '@/features/billing/components/RecordPaymentDialog';
import { useInvoice, usePayments, useRecordPayment } from '@/features/billing/hooks/use-billing';
import { isSettled, outstandingOf } from '@/features/billing/types';
import { usePermissions } from '@/features/permissions/hooks/use-permissions';
import { formatMoney } from '@/lib/format';
import { AppError } from '@/types/common';

export function InvoiceDetailPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const currentUser = useAuthenticatedUser();
  const { can } = usePermissions();

  const invoiceQuery = useInvoice(invoiceId);
  const paymentsQuery = usePayments(invoiceId);
  const record = useRecordPayment({ uid: currentUser.uid, name: currentUser.name });

  const [isPaymentOpen, setPaymentOpen] = useState(false);

  if (invoiceQuery.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (invoiceQuery.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {invoiceQuery.error instanceof AppError
          ? invoiceQuery.error.message
          : 'Could not load this invoice.'}
      </p>
    );
  }

  const invoice = invoiceQuery.data;

  if (!invoice) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
        <h1 className="text-xl font-semibold">Invoice not found</h1>
        <Button asChild>
          <Link to={ROUTES.billing}>Back to billing</Link>
        </Button>
      </div>
    );
  }

  const outstanding = outstandingOf(invoice);
  const canReceive = can('billing:create') && !isSettled(invoice);

  const handlePayment = (payload: PaymentPayload) => {
    record.mutate(
      { invoice, ...payload },
      {
        onSuccess: () => {
          setPaymentOpen(false);
        },
      },
    );
  };

  return (
    <>
      <div className="no-print space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
          <Link to={ROUTES.billing}>
            <ArrowLeft className="size-4" aria-hidden="true" /> All invoices
          </Link>
        </Button>

        <PageHeader
          title={invoice.invoiceNumber}
          description={`${invoice.jobNumber} - ${invoice.customerName}`}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  window.print();
                }}
              >
                <Printer className="size-4" aria-hidden="true" /> Print
              </Button>
              {canReceive ? (
                <Button
                  onClick={() => {
                    setPaymentOpen(true);
                  }}
                >
                  <IndianRupee className="size-4" aria-hidden="true" /> Record payment
                </Button>
              ) : null}
            </div>
          }
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Invoice total</p>
              <p className="tabular-money text-2xl font-semibold">{formatMoney(invoice.total)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Received</p>
              <p className="tabular-money text-2xl font-semibold">{formatMoney(invoice.paid)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Outstanding</p>
              <p className="tabular-money text-2xl font-semibold">{formatMoney(outstanding)}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-4">
        <InvoiceView invoice={invoice} />
      </div>

      <div className="no-print mt-4">
        <PaymentHistory
          payments={paymentsQuery.data ?? []}
          isPending={paymentsQuery.isPending}
          error={paymentsQuery.isError ? paymentsQuery.error : null}
        />
      </div>

      <RecordPaymentDialog
        open={isPaymentOpen}
        onOpenChange={setPaymentOpen}
        invoice={invoice}
        isSaving={record.isPending}
        onSubmit={handlePayment}
      />
    </>
  );
}
