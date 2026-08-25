import { Factory, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductionStatusBadge } from '@/features/production/components/ProductionStatusBadge';
import { useProductionRuns } from '@/features/production/hooks/use-production';
import {
  PRODUCTION_FILTERS,
  countByBucket,
  filterRuns,
  type ProductionFilter,
} from '@/features/production/services/production-search';
import { currentTask, runProgress, type ProductionRun } from '@/features/production/types';
import { formatDate } from '@/lib/format';
import { AppError } from '@/types/common';

function RunRow({ run }: { run: ProductionRun }) {
  const task = currentTask(run);
  const progress = runProgress(run);

  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            to={`/jobs/${run.jobId}`}
            className="font-medium underline-offset-2 hover:underline"
          >
            {run.jobNumber}
          </Link>
          <p className="truncate text-sm text-muted-foreground">
            {run.jobTitle} - {run.customerName}
          </p>
        </div>
        {task ? (
          <ProductionStatusBadge status={task.status} />
        ) : (
          <ProductionStatusBadge status="completed" />
        )}
      </div>

      <p className="mt-2 text-sm">
        {task ? (
          <>
            Next: <span className="font-medium">{task.stageName}</span>
            <span className="text-muted-foreground"> ({task.department})</span>
          </>
        ) : (
          <span className="text-muted-foreground">Every stage finished</span>
        )}
      </p>

      {task?.holdReason ? (
        <p className="mt-1 text-sm text-muted-foreground">On hold: {task.holdReason}</p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {progress.done} of {progress.total} stages - started {formatDate(run.startedAt)}
        </span>
        {task?.assignedToName ? <span>Assigned to {task.assignedToName}</span> : null}
      </div>
    </li>
  );
}

/**
 * The shop floor board.
 *
 * Grouped by what somebody has to do next, not by how far along a job is:
 * "on hold" is the bucket that needs a person, so it is a filter of its own
 * rather than a percentage buried in a progress bar.
 */
export function ProductionPage() {
  const runs = useProductionRuns();
  const [term, setTerm] = useState('');
  const [filter, setFilter] = useState<ProductionFilter>('in-progress');

  const all = useMemo(() => runs.data ?? [], [runs.data]);
  const counts = useMemo(() => countByBucket(all), [all]);
  const visible = useMemo(() => filterRuns(all, term, filter), [all, term, filter]);

  return (
    <>
      <PageHeader
        title="Production"
        description="Work on the shop floor, by what needs doing next. Jobs enter production from the job screen."
      />

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
                placeholder="Search job number, customer or stage"
                aria-label="Search production"
                className="pl-8"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter production">
            {PRODUCTION_FILTERS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={option.value === filter ? 'default' : 'outline'}
                aria-pressed={option.value === filter}
                onClick={() => {
                  setFilter(option.value);
                }}
              >
                {option.label} ({counts[option.value]})
              </Button>
            ))}
          </div>

          {runs.isPending ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : runs.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {runs.error instanceof AppError ? runs.error.message : 'Could not load production.'}
            </p>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <Factory className="size-6" aria-hidden="true" />
              <p className="text-sm">
                {term || filter !== 'in-progress'
                  ? 'Nothing matches this filter.'
                  : 'Nothing is in production right now. Send a job from its job screen.'}
              </p>
            </div>
          ) : (
            <>
              <ul className="space-y-3">
                {visible.map((run) => (
                  <RunRow key={run.id} run={run} />
                ))}
              </ul>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                Showing {visible.length} of {all.length} runs
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
