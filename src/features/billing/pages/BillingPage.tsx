import { ReceiptText, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { InvoiceCardList, InvoiceTable } from '@/features/billing/components/InvoiceTable';
import { useInvoiceDirectory } from '@/features/billing/hooks/use-billing';
import {
  countByStatus,
  INVOICE_FILTER_LABELS,
  INVOICE_FILTERS,
  outstandingTotal,
  queryInvoices,
  type InvoiceFilter,
} from '@/features/billing/services/billing-search';
import { formatMoney } from '@/lib/format';
import { AppError } from '@/types/common';

export function BillingPage() {
  const directory = useInvoiceDirectory();

  const [term, setTerm] = useState('');
  const [filter, setFilter] = useState<InvoiceFilter>('outstanding');

  const invoices = useMemo(() => directory.data?.invoices ?? [], [directory.data]);
  const shown = useMemo(
    () => queryInvoices(invoices, { filter, query: term }),
    [invoices, filter, term],
  );
  const counts = useMemo(() => countByStatus(invoices), [invoices]);
  const outstanding = useMemo(() => outstandingTotal(invoices), [invoices]);

  return (
    <>
      <PageHeader
        title="Billing & Payments"
        description="What has been billed, what has been received, and what is still owed. Invoices are raised from a priced job."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Outstanding</p>
            <p className="tabular-money text-2xl font-semibold">{formatMoney(outstanding)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Unpaid invoices</p>
            <p className="text-2xl font-semibold">{counts.unpaid}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Partly paid</p>
            <p className="text-2xl font-semibold">{counts.partial}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={term}
                onChange={(event) => {
                  setTerm(event.target.value);
                }}
                placeholder="Search invoice number, job, customer or mobile"
                aria-label="Search invoices"
                className="pl-8"
              />
            </div>
            <Select
              value={filter}
              onValueChange={(value) => {
                setFilter(value as InvoiceFilter);
              }}
            >
              <SelectTrigger className="sm:w-48" aria-label="Filter by payment status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVOICE_FILTERS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {INVOICE_FILTER_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {directory.isPending ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : directory.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {directory.error instanceof AppError
                ? directory.error.message
                : 'Could not load invoices.'}
            </p>
          ) : shown.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <ReceiptText className="size-6" aria-hidden="true" />
              <p className="text-sm">
                {term || filter !== 'outstanding'
                  ? 'No invoices match this search.'
                  : 'Nothing outstanding. Raise an invoice from a priced job.'}
              </p>
            </div>
          ) : (
            <>
              <div className="hidden sm:block">
                <InvoiceTable invoices={shown} />
              </div>
              <div className="sm:hidden">
                <InvoiceCardList invoices={shown} />
              </div>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                Showing {shown.length} of {invoices.length} invoices
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
