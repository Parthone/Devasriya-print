import { CalendarClock } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductionStatusBadge } from '@/features/production/components/ProductionStatusBadge';
import { useProductionRuns } from '@/features/production/hooks/use-production';
import { byDeadline } from '@/features/production/services/production-search';
import { currentTask, type ProductionRun } from '@/features/production/types';
import { formatDate } from '@/lib/format';
import { AppError } from '@/types/common';

function DeadlineGroup({
  title,
  description,
  runs,
  tone,
}: {
  title: string;
  description: string;
  runs: ProductionRun[];
  tone: 'destructive' | 'warning' | 'secondary';
}) {
  if (runs.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Badge variant={tone}>{runs.length}</Badge>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {runs.map((run) => {
            const task = currentTask(run);
            return (
              <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
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
                  <p className="mt-1 text-xs text-muted-foreground">
                    {task ? `${task.stageName} - ` : 'Every stage finished - '}
                    {task?.assignedToName ?? 'nobody assigned yet'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {run.priority === 'urgent' ? <Badge variant="destructive">Urgent</Badge> : null}
                  {run.expectedDeliveryDate ? (
                    <Badge variant="outline">Due {formatDate(run.expectedDeliveryDate)}</Badge>
                  ) : null}
                  {task ? <ProductionStatusBadge status={task.status} /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * What is late, what is due, and who is holding it.
 *
 * Only work still to be done appears here. A run whose every stage is finished
 * is not late - it is waiting to be collected, which is a different problem.
 */
export function DeadlinesPage() {
  const runs = useProductionRuns();
  const now = useMemo(() => new Date(), []);
  const all = useMemo(() => runs.data ?? [], [runs.data]);

  const overdue = useMemo(() => byDeadline(all, 'overdue', now), [all, now]);
  const today = useMemo(() => byDeadline(all, 'today', now), [all, now]);
  const soon = useMemo(() => byDeadline(all, 'soon', now), [all, now]);
  const total = overdue.length + today.length + soon.length;

  return (
    <>
      <PageHeader
        title="Deadlines"
        description="Work in production, against the delivery date on the job."
      />

      {runs.isPending ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-32 w-full" />
        </div>
      ) : runs.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {runs.error instanceof AppError ? runs.error.message : 'Could not load deadlines.'}
        </p>
      ) : total === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
            <CalendarClock className="size-6" aria-hidden="true" />
            <p className="text-sm">Nothing is late or due in the next few days.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <DeadlineGroup
            title="Overdue"
            description="Past the delivery date and still in production."
            runs={overdue}
            tone="destructive"
          />
          <DeadlineGroup
            title="Due today"
            description="Has to go out today."
            runs={today}
            tone="warning"
          />
          <DeadlineGroup
            title="Due soon"
            description="Within the next few days."
            runs={soon}
            tone="secondary"
          />
        </>
      )}
    </>
  );
}
