import { Factory, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DEPARTMENTS, DEPARTMENT_LABELS } from '@/constants/organization';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-auth';
import { ProductionStatusBadge } from '@/features/production/components/ProductionStatusBadge';
import { useProductionRuns } from '@/features/production/hooks/use-production';
import {
  DEADLINE_FILTERS,
  PRODUCTION_FILTERS,
  WORK_SCOPES,
  countByBucket,
  deadlineStateFor,
  queryRuns,
  workloadFor,
  type DeadlineFilter,
  type ProductionFilter,
  type WorkScope,
} from '@/features/production/services/production-search';
import { currentTask, runProgress, type ProductionRun } from '@/features/production/types';
import { formatDate } from '@/lib/format';
import { AppError } from '@/types/common';

const DEADLINE_TONE: Record<DeadlineFilter, string> = {
  overdue: 'destructive',
  today: 'warning',
  soon: 'secondary',
  any: 'outline',
};

function RunRow({ run }: { run: ProductionRun }) {
  const task = currentTask(run);
  const progress = runProgress(run);
  const deadline = deadlineStateFor(run);

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
        <div className="flex flex-wrap items-center gap-2">
          {run.priority === 'urgent' ? <Badge variant="destructive">Urgent</Badge> : null}
          {deadline !== 'any' ? (
            <Badge variant={DEADLINE_TONE[deadline] as 'destructive' | 'warning' | 'secondary'}>
              {deadline === 'overdue' ? 'Overdue' : deadline === 'today' ? 'Due today' : 'Due soon'}
            </Badge>
          ) : null}
          {task ? (
            <ProductionStatusBadge status={task.status} />
          ) : (
            <ProductionStatusBadge status="completed" />
          )}
        </div>
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
/**
 * The operations board.
 *
 * Everything a supervisor asks in a morning, on one screen: what is moving,
 * what has stopped, what nobody has picked up, what is late, and who is
 * carrying too much. Grouped by what needs a person rather than by how far
 * along a job is.
 */
export function ProductionPage() {
  const currentUser = useAuthenticatedUser();
  const runs = useProductionRuns();

  const [term, setTerm] = useState('');
  const [status, setStatus] = useState<ProductionFilter>('all');
  const [scope, setScope] = useState<WorkScope>('all');
  const [deadline, setDeadline] = useState<DeadlineFilter>('any');
  const [department, setDepartment] = useState('all');
  const [assigneeId, setAssigneeId] = useState('all');

  const all = useMemo(() => runs.data ?? [], [runs.data]);
  const counts = useMemo(() => countByBucket(all), [all]);
  const workload = useMemo(() => workloadFor(all), [all]);
  const visible = useMemo(
    () =>
      queryRuns(all, {
        term,
        status,
        scope,
        deadline,
        department,
        assigneeId,
        uid: currentUser.uid,
      }),
    [all, term, status, scope, deadline, department, assigneeId, currentUser.uid],
  );

  return (
    <>
      <PageHeader
        title="Production"
        description="Work on the shop floor, by what needs doing next. Jobs enter production from the job screen."
      />

      <Card>
        <CardContent className="space-y-4">
          <div className="relative">
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

          <div className="flex flex-wrap gap-2" role="group" aria-label="Whose work">
            {WORK_SCOPES.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={option.value === scope ? 'default' : 'outline'}
                aria-pressed={option.value === scope}
                onClick={() => {
                  setScope(option.value);
                }}
              >
                {option.label}
                {option.value === 'unassigned' ? ` (${String(workload.unassigned)})` : ''}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter production">
            {PRODUCTION_FILTERS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={option.value === status ? 'default' : 'outline'}
                aria-pressed={option.value === status}
                onClick={() => {
                  setStatus(option.value);
                }}
              >
                {option.label} ({counts[option.value]})
              </Button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Select
              value={deadline}
              onValueChange={(value) => {
                setDeadline(value as DeadlineFilter);
              }}
            >
              <SelectTrigger aria-label="Filter by delivery date">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEADLINE_FILTERS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger aria-label="Filter by department">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Every department</SelectItem>
                {DEPARTMENTS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {DEPARTMENT_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger aria-label="Filter by employee">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everybody</SelectItem>
                {workload.assigned.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.name} ({entry.open})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {workload.assigned.length > 0 ? (
            <div className="flex flex-wrap gap-2" aria-label="Workload">
              {workload.assigned.map((entry) => (
                <Badge key={entry.id} variant="outline">
                  {entry.name}: {entry.open} open
                </Badge>
              ))}
            </div>
          ) : null}

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
                {all.length === 0
                  ? 'Nothing is in production right now. Send a job from its job screen.'
                  : 'Nothing matches these filters.'}
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
