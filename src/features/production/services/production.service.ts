import { isDemoMode } from '@/config/demo';
import {
  addDemoStage,
  advanceDemoTask,
  assignDemoTask,
  demoProductionEvents,
  demoProductionRuns,
  demoWorkflowStages,
  startDemoRun,
  updateDemoStage,
} from '@/features/demo/demo-store';
import type { ActorSnapshot } from '@/features/enquiries/services/enquiry.service';
import {
  EVENT_COLUMNS,
  RUN_COLUMNS,
  STAGE_COLUMNS,
  toEvent,
  toRun,
  toTask,
  toStageRow,
  toWorkflowStage,
  type EventRow,
  type RunRow,
  type StageRow,
  type TaskRow,
} from '@/features/production/services/production.rows';
import type {
  ProductionEvent,
  ProductionRun,
  ProductionStatus,
  ProductionTask,
  WorkflowStage,
  WorkflowStageInput,
} from '@/features/production/types';
import { getSupabase } from '@/lib/supabase/client';
import { toAppError, unwrap, unwrapMaybe } from '@/lib/supabase/errors';
import { TABLES } from '@/services/base/tables';
import { AppError, type Id } from '@/types/common';

export const RUN_FETCH_CAP = 500;

// ── Workflow stages ────────────────────────────────────────────────────────

/** The shop's stages, in the order work moves through them. */
export async function listWorkflowStages(): Promise<WorkflowStage[]> {
  if (isDemoMode()) return demoWorkflowStages();

  const rows = unwrap(
    await getSupabase()
      .from(TABLES.workflowStages)
      .select(STAGE_COLUMNS)
      .order('position', { ascending: true })
      .order('name', { ascending: true })
      .limit(100)
      .returns<StageRow[]>(),
  );
  return rows.map(toWorkflowStage);
}

export async function createWorkflowStage(
  input: WorkflowStageInput,
  actorId: Id,
): Promise<WorkflowStage> {
  if (isDemoMode()) return addDemoStage(input, actorId);

  try {
    const row = unwrap(
      await getSupabase()
        .from(TABLES.workflowStages)
        .insert({ ...toStageRow(input, actorId), created_by: actorId })
        .select(STAGE_COLUMNS)
        .single<StageRow>(),
    );
    return toWorkflowStage(row);
  } catch (error) {
    throw toAppError(error);
  }
}

/**
 * Edits a stage.
 *
 * Renaming one does not rewrite history: every task snapshots the name it was
 * made with, so a job that went through "Lamination" last month still says so.
 * Stages are deactivated rather than deleted for the same reason.
 */
export async function updateWorkflowStage(
  id: Id,
  input: WorkflowStageInput,
  actorId: Id,
): Promise<void> {
  if (isDemoMode()) {
    updateDemoStage(id, input, actorId);
    return;
  }

  try {
    const { error } = await getSupabase()
      .from(TABLES.workflowStages)
      .update(toStageRow(input, actorId))
      .eq('id', id);
    if (error) throw error;
  } catch (error) {
    throw toAppError(error);
  }
}

// ── Runs and tasks ─────────────────────────────────────────────────────────

export async function listProductionRuns(): Promise<ProductionRun[]> {
  if (isDemoMode()) return demoProductionRuns();

  const rows = unwrap(
    await getSupabase()
      .from(TABLES.productionRuns)
      .select(RUN_COLUMNS)
      .order('started_at', { ascending: false })
      .limit(RUN_FETCH_CAP)
      .returns<RunRow[]>(),
  );
  return rows.map(toRun);
}

/** The run for one job, or null when it has not been sent to production yet. */
export async function findRunForJob(jobId: Id): Promise<ProductionRun | null> {
  if (isDemoMode()) {
    return demoProductionRuns().find((run: ProductionRun) => run.jobId === jobId) ?? null;
  }

  const row = unwrapMaybe(
    await getSupabase()
      .from(TABLES.productionRuns)
      .select(RUN_COLUMNS)
      .eq('job_id', jobId)
      .maybeSingle<RunRow>(),
  );
  return row ? toRun(row) : null;
}

export async function listRunEvents(runId: Id): Promise<ProductionEvent[]> {
  if (isDemoMode()) return demoProductionEvents(runId);

  const rows = unwrap(
    await getSupabase()
      .from(TABLES.productionEvents)
      .select(EVENT_COLUMNS)
      .eq('run_id', runId)
      .order('at', { ascending: false })
      .limit(200)
      .returns<EventRow[]>(),
  );
  return rows.map(toEvent);
}

/**
 * Sends a job to production.
 *
 * The run, one task per active stage, the opening history entry and the job's
 * new status all land in one transaction. The artwork the shop floor is working
 * from is snapshotted at this moment, so a revision approved next week cannot
 * change what this run was started against.
 */
export async function startProductionRun(jobId: Id, actor: ActorSnapshot): Promise<ProductionRun> {
  if (isDemoMode()) return startDemoRun(jobId, actor);

  try {
    const created = unwrap(
      await getSupabase()
        .rpc('start_production_run', { p_job_id: jobId, p_by_name: actor.name })
        .single<RunRow>(),
    );

    const full = await findRunForJob(created.job_id);
    if (!full) throw new AppError('not-found', 'The run could not be read back.');
    return full;
  } catch (error) {
    throw toAppError(error);
  }
}

export interface AdvanceTaskInput {
  task: ProductionTask;
  toStatus: ProductionStatus;
  /** Required when putting a stage on hold or skipping it. */
  reason?: string | undefined;
  actor: ActorSnapshot;
}

/**
 * Moves one stage along.
 *
 * Finishing a stage unlocks the next one and updates the job, all in the same
 * transaction - the shop floor never sees a run with nothing to pick up, and a
 * job never disagrees with the work actually happening on it.
 */
export async function advanceProductionTask({
  task,
  toStatus,
  reason,
  actor,
}: AdvanceTaskInput): Promise<ProductionTask> {
  if (isDemoMode()) return advanceDemoTask(task, toStatus, reason, actor);

  try {
    const row = unwrap(
      await getSupabase()
        .rpc('advance_production_task', {
          p_task_id: task.id,
          p_to_status: toStatus,
          p_reason: reason?.trim() ?? null,
          p_by_name: actor.name,
        })
        .single<TaskRow>(),
    );
    return toTask(row);
  } catch (error) {
    throw toAppError(error);
  }
}

/** Assigning work needs jobs:assign, which is separate from doing the work. */
export async function assignProductionTask(
  task: ProductionTask,
  assignee: { id: Id; name: string } | null,
  actor: ActorSnapshot,
): Promise<ProductionTask> {
  if (isDemoMode()) return assignDemoTask(task, assignee, actor);

  try {
    const row = unwrap(
      await getSupabase()
        .rpc('assign_production_task', {
          p_task_id: task.id,
          p_assignee_id: assignee?.id ?? null,
          p_assignee_name: assignee?.name ?? null,
          p_by_name: actor.name,
        })
        .single<TaskRow>(),
    );
    return toTask(row);
  } catch (error) {
    throw toAppError(error);
  }
}
