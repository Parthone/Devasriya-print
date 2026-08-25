import { FileText, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
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
import { EstimateCardList, EstimateTable } from '@/features/estimates/components/EstimateTable';
import { useEstimateDirectory } from '@/features/estimates/hooks/use-estimates';
import {
  DEFAULT_PAGE_SIZE,
  expiredEstimates,
  queryEstimates,
  type EstimateStatusFilter,
} from '@/features/estimates/services/estimate-search';
import { ESTIMATE_STATUSES, ESTIMATE_STATUS_LABELS } from '@/features/estimates/types';
import { AppError } from '@/types/common';

const STATUS_OPTIONS: { value: EstimateStatusFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'all', label: 'All' },
  ...ESTIMATE_STATUSES.map((status) => ({
    value: status,
    label: ESTIMATE_STATUS_LABELS[status],
  })),
];

export function EstimatesPage() {
  const directory = useEstimateDirectory();

  const [term, setTerm] = useState('');
  const [status, setStatus] = useState<EstimateStatusFilter>('open');
  const [page, setPage] = useState(1);

  const estimates = useMemo(() => directory.data?.estimates ?? [], [directory.data]);
  const result = useMemo(
    () => queryEstimates(estimates, { term, status, page, pageSize: DEFAULT_PAGE_SIZE }),
    [estimates, term, status, page],
  );
  const pastValidity = useMemo(() => expiredEstimates(estimates).length, [estimates]);

  return (
    <>
      <PageHeader
        title="Estimates & Quotations"
        description="What was quoted, to whom, and what the customer decided. Quotations are made from a priced job."
      />

      {pastValidity > 0 ? (
        <p className="text-sm text-muted-foreground">
          {pastValidity} sent {pastValidity === 1 ? 'quotation is' : 'quotations are'} past the
          validity date.
        </p>
      ) : null}

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
                  setPage(1);
                }}
                placeholder="Search quotation number, job, customer or mobile"
                aria-label="Search quotations"
                className="pl-8"
              />
            </div>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value as EstimateStatusFilter);
                setPage(1);
              }}
            >
              <SelectTrigger className="sm:w-48" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
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
                : 'Could not load quotations.'}
            </p>
          ) : result.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <FileText className="size-6" aria-hidden="true" />
              <p className="text-sm">
                {term || status !== 'open'
                  ? 'No quotations match this search.'
                  : 'No open quotations. Price a job, then create a quotation from it.'}
              </p>
            </div>
          ) : (
            <>
              <div className="hidden sm:block">
                <EstimateTable estimates={result.items} />
              </div>
              <div className="sm:hidden">
                <EstimateCardList estimates={result.items} />
              </div>

              <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  Showing {result.items.length} of {result.total} quotations
                  {result.pageCount > 1 ? ` (page ${result.page} of ${result.pageCount})` : ''}
                </p>
                {result.pageCount > 1 ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={result.page <= 1}
                      onClick={() => {
                        setPage((current) => Math.max(1, current - 1));
                      }}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={result.page >= result.pageCount}
                      onClick={() => {
                        setPage((current) => current + 1);
                      }}
                    >
                      Next
                    </Button>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
