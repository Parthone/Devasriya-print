import { Check, Factory, Pause, Play, SkipForward } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-auth';
import type { Job } from '@/features/jobs/types';
import { usePermissions } from '@/features/permissions/hooks/use-permissions';
import { ProductionStatusBadge } from '@/features/production/components/ProductionStatusBadge';
import { StageActionDialog } from '@/features/production/components/StageActionDialog';
import {
  useAdvanceTask,
  useRunEvents,
  useRunForJob,
  useStartProductionRun,
} from '@/features/production/hooks/use-production';
import {
  PRODUCTION_ACTION_LABELS,
  canStart,
  isSettled,
  runProgress,
  type ProductionStatus,
  type ProductionTask,
} from '@/features/production/types';
import { formatDateTime } from '@/lib/format';

/**
 * The shop floor view of one job.
 *
 * Stages in order, what each one is doing, and only the buttons that apply to
 * the stage that is actually live. A stage further down the list has none -
 * work moves in order, and offering a control the database would refuse is
 * worse than not offering it at all.
 */
export function JobProductionCard({ job }: { job: Job }) {
  const currentUser = useAuthenticatedUser();
  const actor = { uid: currentUser.uid, name: currentUser.name };
  const { can } = usePermissions();
  const canUpdate = can('production:update');

  const runQuery = useRunForJob(job.id);
  const events = useRunEvents(runQuery.data?.id);
  const start = useStartProductionRun(actor);
  const advance = useAdvanceTask(actor);

  const [pending, setPending] = useState<{ task: ProductionTask; to: ProductionStatus } | null>(
    null,
  );

  const run = runQuery.data ?? null;
  const progress = run ? runProgress(run) : null;
  const move = (task: ProductionTask, to: ProductionStatus) => {
    advance.mutate({ task, toStatus: to });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Production</CardTitle>
        {!run && canUpdate && job.status !== 'delivered' && job.status !== 'cancelled' ? (
          <Button
            size="sm"
            variant="outline"
            disabled={start.isPending}
            onClick={() => {
              start.mutate(job.id);
            }}
          >
            <Factory className="size-4" aria-hidden="true" /> Send to production
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {runQuery.isPending ? (
          <Skeleton className="h-24 w-full" aria-busy="true" />
        ) : !run ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            This job has not been sent to production yet.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {progress?.done} of {progress?.total} stages finished
              </span>
              {run.approvedDesignVersion ? (
                <span className="text-xs text-muted-foreground">
                  Working from design version {run.approvedDesignVersion}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Started with no approved design on file
                </span>
              )}
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${String(progress?.percent ?? 0)}%` }}
                role="progressbar"
                aria-valuenow={progress?.percent ?? 0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Production progress"
              />
            </div>

            <ol className="divide-y">
              {run.tasks.map((task) => (
                <li key={task.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {task.position + 1}. {task.stageName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {task.department}
                        {task.assignedToName ? ` - ${task.assignedToName}` : ''}
                      </p>
                    </div>
                    <ProductionStatusBadge status={task.status} />
                  </div>

                  {task.holdReason ? (
                    <p className="mt-2 text-sm text-muted-foreground">On hold: {task.holdReason}</p>
                  ) : null}
                  {task.skipReason ? (
                    <p className="mt-2 text-sm text-muted-foreground">Skipped: {task.skipReason}</p>
                  ) : null}

                  {canUpdate && !isSettled(task.status) ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {canStart(run, task) ? (
                        <Button
                          size="sm"
                          disabled={advance.isPending}
                          onClick={() => {
                            move(task, 'in-progress');
                          }}
                        >
                          <Play className="size-4" aria-hidden="true" /> Start
                        </Button>
                      ) : null}

                      {task.status === 'in-progress' ? (
                        <>
                          <Button
                            size="sm"
                            disabled={advance.isPending}
                            onClick={() => {
                              move(task, 'completed');
                            }}
                          >
                            <Check className="size-4" aria-hidden="true" /> Complete
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setPending({ task, to: 'on-hold' });
                            }}
                          >
                            <Pause className="size-4" aria-hidden="true" /> Hold
                          </Button>
                        </>
                      ) : null}

                      {task.status === 'on-hold' ? (
                        <Button
                          size="sm"
                          disabled={advance.isPending}
                          onClick={() => {
                            move(task, 'in-progress');
                          }}
                        >
                          <Play className="size-4" aria-hidden="true" /> Resume
                        </Button>
                      ) : null}

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setPending({ task, to: 'skipped' });
                        }}
                      >
                        <SkipForward className="size-4" aria-hidden="true" /> Skip
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>

            {events.data && events.data.length > 0 ? (
              <div>
                <p className="text-xs tracking-wide text-muted-foreground uppercase">History</p>
                <ul className="mt-1 space-y-1 text-xs">
                  {events.data.slice(0, 8).map((event) => (
                    <li key={event.id} className="text-muted-foreground">
                      {formatDateTime(event.at)} - {PRODUCTION_ACTION_LABELS[event.action]}
                      {event.stageName ? `: ${event.stageName}` : ''} ({event.byName})
                      {event.reason ? ` - ${event.reason}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </CardContent>

      <StageActionDialog
        task={pending?.task ?? null}
        toStatus={pending?.to ?? 'on-hold'}
        isSaving={advance.isPending}
        onCancel={() => {
          setPending(null);
        }}
        onConfirm={(reason) => {
          if (!pending) return;
          advance.mutate(
            { task: pending.task, toStatus: pending.to, reason },
            {
              onSettled: () => {
                setPending(null);
              },
            },
          );
        }}
      />
    </Card>
  );
}
