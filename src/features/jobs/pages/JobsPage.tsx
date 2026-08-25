import { AlertTriangle, ClipboardList, Plus, Search } from 'lucide-react';
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
import { useAuthenticatedUser } from '@/features/auth/hooks/use-auth';
import { JobFormDialog, type JobSubmitPayload } from '@/features/jobs/components/JobFormDialog';
import { JobCardList, JobTable } from '@/features/jobs/components/JobTable';
import { useCreateJob, useJobDirectory } from '@/features/jobs/hooks/use-jobs';
import {
  DEFAULT_PAGE_SIZE,
  overdueJobs,
  queryJobs,
  type JobStatusFilter,
} from '@/features/jobs/services/job-search';
import { JOB_STATUSES, JOB_STATUS_LABELS } from '@/features/jobs/types';
import { Can } from '@/features/permissions/components/Can';
import { AppError } from '@/types/common';

const STATUS_OPTIONS: { value: JobStatusFilter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'all', label: 'All' },
  ...JOB_STATUSES.map((status) => ({
    value: status,
    label: JOB_STATUS_LABELS[status],
  })),
];

export function JobsPage() {
  const currentUser = useAuthenticatedUser();
  const actor = { uid: currentUser.uid, name: currentUser.name };

  const directory = useJobDirectory();
  const createJob = useCreateJob(actor);

  const [term, setTerm] = useState('');
  const [status, setStatus] = useState<JobStatusFilter>('active');
  const [page, setPage] = useState(1);
  const [isFormOpen, setFormOpen] = useState(false);

  const jobs = useMemo(() => directory.data?.jobs ?? [], [directory.data]);
  const result = useMemo(
    () => queryJobs(jobs, { term, status, page, pageSize: DEFAULT_PAGE_SIZE }),
    [jobs, term, status, page],
  );
  const overdueCount = useMemo(() => overdueJobs(jobs).length, [jobs]);

  const handleSubmit = async (payload: JobSubmitPayload): Promise<void> => {
    await createJob.mutateAsync({
      input: payload.input,
      customer: {
        id: payload.customer.id,
        name: payload.customer.name,
        mobile: payload.customer.mobile,
      },
      recording: payload.recording,
    });
    setFormOpen(false);
  };

  return (
    <>
      <PageHeader
        title="Jobs & Orders"
        description="Confirmed work, from enquiry conversion or taken directly."
        actions={
          <Can permission="jobs:create">
            <Button
              onClick={() => {
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden="true" /> New job
            </Button>
          </Can>
        }
      />

      {directory.data?.capReached ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>Showing the {directory.data.cap} most recent jobs only.</span>
        </div>
      ) : null}

      {overdueCount > 0 ? (
        <p className="text-sm text-muted-foreground">
          {overdueCount} {overdueCount === 1 ? 'job is' : 'jobs are'} past the expected delivery
          date.
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
                placeholder="Search job number, customer, mobile or title"
                aria-label="Search jobs"
                className="pl-8"
              />
            </div>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value as JobStatusFilter);
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
                : 'Could not load jobs.'}
            </p>
          ) : result.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <ClipboardList className="size-6" aria-hidden="true" />
              <p className="text-sm">
                {term || status !== 'active'
                  ? 'No jobs match this search.'
                  : 'No active jobs yet. Convert an enquiry or create one directly.'}
              </p>
            </div>
          ) : (
            <>
              <div className="hidden sm:block">
                <JobTable jobs={result.items} />
              </div>
              <div className="sm:hidden">
                <JobCardList jobs={result.items} />
              </div>

              <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  Showing {result.items.length} of {result.total} jobs
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

      <JobFormDialog
        open={isFormOpen}
        onOpenChange={setFormOpen}
        isSaving={createJob.isPending}
        onSubmit={handleSubmit}
      />
    </>
  );
}
