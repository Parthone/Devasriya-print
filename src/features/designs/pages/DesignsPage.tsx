import { Images, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DesignStatusBadge } from '@/features/designs/components/DesignStatusBadge';
import { useDesignDirectory } from '@/features/designs/hooks/use-designs';
import {
  DEFAULT_PAGE_SIZE,
  awaitingCustomer,
  queryDesigns,
  type DesignStatusFilter,
} from '@/features/designs/services/design-search';
import { DESIGN_STATUSES, DESIGN_STATUS_LABELS, type Design } from '@/features/designs/types';
import { formatDateTime } from '@/lib/format';
import { AppError } from '@/types/common';

const STATUS_OPTIONS: { value: DesignStatusFilter; label: string }[] = [
  { value: 'open', label: 'In progress' },
  { value: 'all', label: 'All' },
  ...DESIGN_STATUSES.map((status) => ({ value: status, label: DESIGN_STATUS_LABELS[status] })),
];

function DesignRows({ designs }: { designs: Design[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Job</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Version</TableHead>
          <TableHead>Uploaded</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {designs.map((design) => (
          <TableRow key={design.id}>
            <TableCell>
              <Link
                to={`/jobs/${design.jobId}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {design.jobNumber}
              </Link>
              <div className="truncate text-xs text-muted-foreground">{design.jobTitle}</div>
            </TableCell>
            <TableCell className="text-sm">{design.customerName}</TableCell>
            <TableCell className="text-sm">v{design.version}</TableCell>
            <TableCell className="text-sm">
              <div>{design.uploadedByName}</div>
              <div className="text-xs text-muted-foreground">
                {formatDateTime(design.uploadedAt)}
              </div>
            </TableCell>
            <TableCell>
              <DesignStatusBadge status={design.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DesignCards({ designs }: { designs: Design[] }) {
  return (
    <ul aria-label="Design cards" className="space-y-3">
      {designs.map((design) => (
        <li key={design.id} className="rounded-lg border p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                to={`/jobs/${design.jobId}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {design.jobNumber}
              </Link>
              <p className="truncate text-xs text-muted-foreground">{design.customerName}</p>
            </div>
            <DesignStatusBadge status={design.status} />
          </div>
          <p className="mt-2 line-clamp-2 text-sm">
            v{design.version} - {design.jobTitle}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {design.uploadedByName}, {formatDateTime(design.uploadedAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function DesignsPage() {
  const directory = useDesignDirectory();

  const [term, setTerm] = useState('');
  const [status, setStatus] = useState<DesignStatusFilter>('open');
  const [page, setPage] = useState(1);

  const designs = useMemo(() => directory.data?.designs ?? [], [directory.data]);
  const result = useMemo(
    () => queryDesigns(designs, { term, status, page, pageSize: DEFAULT_PAGE_SIZE }),
    [designs, term, status, page],
  );
  const waiting = useMemo(() => awaitingCustomer(designs).length, [designs]);

  return (
    <>
      <PageHeader
        title="Designs & Approvals"
        description="Every version we have sent, and what the customer said about it. Designs are uploaded from the job."
      />

      {waiting > 0 ? (
        <p className="text-sm text-muted-foreground">
          {waiting} {waiting === 1 ? 'design is' : 'designs are'} waiting on a customer reply.
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
                placeholder="Search job number, customer or designer"
                aria-label="Search designs"
                className="pl-8"
              />
            </div>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value as DesignStatusFilter);
                setPage(1);
              }}
            >
              <SelectTrigger className="sm:w-52" aria-label="Filter by status">
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
            </div>
          ) : directory.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {directory.error instanceof AppError
                ? directory.error.message
                : 'Could not load designs.'}
            </p>
          ) : result.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <Images className="size-6" aria-hidden="true" />
              <p className="text-sm">
                {term || status !== 'open'
                  ? 'No designs match this search.'
                  : 'Nothing in progress. Open a job to upload the first design.'}
              </p>
            </div>
          ) : (
            <>
              <div className="hidden sm:block">
                <DesignRows designs={result.items} />
              </div>
              <div className="sm:hidden">
                <DesignCards designs={result.items} />
              </div>

              <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  Showing {result.items.length} of {result.total} designs
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
