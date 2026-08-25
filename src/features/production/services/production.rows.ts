import type { Department } from '@/constants/organization';
import type { JobPriority, JobStatus } from '@/features/jobs/types';
import {
  parseWorkflowStage,
  type ProductionAction,
  type ProductionEvent,
  type ProductionRun,
  type ProductionStatus,
  type ProductionTask,
  type RunStatus,
  type WorkflowStage,
  type WorkflowStageInput,
} from '@/features/production/types';
import { toAudit, toDate, toDateOrNull, toOptional, type AuditRow } from '@/lib/supabase/rows';
import type { Id } from '@/types/common';

export interface StageRow extends AuditRow {
  id: string;
  name: string;
  department: Department;
  position: number;
  is_active: boolean;
}

export const STAGE_COLUMNS =
  'id, name, department, position, is_active, created_at, created_by, updated_at, updated_by';

export function toWorkflowStage(row: StageRow): WorkflowStage {
  return parseWorkflowStage(
    {
      id: row.id,
      name: row.name,
      department: row.department,
      position: row.position,
      isActive: row.is_active,
      ...toAudit(row),
    },
    row.id,
  );
}

export function toStageRow(input: WorkflowStageInput, actorId: Id) {
  return {
    name: input.name,
    department: input.department,
    position: input.position,
    is_active: input.isActive,
    updated_by: actorId,
  };
}

export interface TaskRow extends AuditRow {
  id: string;
  run_id: string;
  job_id: string;
  stage_id: string | null;
  stage_name: string;
  department: Department;
  position: number;
  status: ProductionStatus;
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  started_at: string | null;
  completed_at: string | null;
  hold_reason: string | null;
  skip_reason: string | null;
  notes: string | null;
}

export const TASK_COLUMNS =
  'id, run_id, job_id, stage_id, stage_name, department, position, status, assigned_to_id,' +
  ' assigned_to_name, started_at, completed_at, hold_reason, skip_reason, notes,' +
  ' created_at, created_by, updated_at, updated_by';

export function toTask(row: TaskRow): ProductionTask {
  return {
    id: row.id,
    runId: row.run_id,
    jobId: row.job_id,
    stageId: row.stage_id,
    stageName: row.stage_name,
    department: row.department,
    position: row.position,
    status: row.status,
    assignedToId: row.assigned_to_id,
    assignedToName: row.assigned_to_name,
    startedAt: toDateOrNull(row.started_at),
    completedAt: toDateOrNull(row.completed_at),
    holdReason: toOptional(row.hold_reason),
    skipReason: toOptional(row.skip_reason),
    notes: toOptional(row.notes),
    ...toAudit(row),
  };
}

export interface RunRow extends AuditRow {
  id: string;
  job_id: string;
  job_number: string;
  job_title: string;
  customer_id: string;
  customer_name: string;
  status: RunStatus;
  approved_design_id: string | null;
  approved_design_version: number | null;
  started_at: string;
  started_by_id: string;
  started_by_name: string;
  completed_at: string | null;
  production_tasks?: TaskRow[];
  jobs?: { expected_delivery_date: string | null; priority: JobPriority; status: JobStatus } | null;
}

export const RUN_COLUMNS =
  'id, job_id, job_number, job_title, customer_id, customer_name, status,' +
  ' approved_design_id, approved_design_version, started_at, started_by_id,' +
  ' started_by_name, completed_at, created_at, created_by, updated_at, updated_by,' +
  ' jobs(expected_delivery_date, priority, status),' +
  ` production_tasks(${TASK_COLUMNS})`;

export function toRun(row: RunRow): ProductionRun {
  return {
    id: row.id,
    jobId: row.job_id,
    jobNumber: row.job_number,
    jobTitle: row.job_title,
    customerId: row.customer_id,
    customerName: row.customer_name,
    status: row.status,
    approvedDesignId: row.approved_design_id,
    approvedDesignVersion: row.approved_design_version,
    startedAt: toDate(row.started_at),
    startedById: row.started_by_id,
    startedByName: row.started_by_name,
    completedAt: toDateOrNull(row.completed_at),
    tasks: [...(row.production_tasks ?? [])].sort((a, b) => a.position - b.position).map(toTask),
    ...toAudit(row),
  };
}

export interface EventRow {
  id: string;
  run_id: string;
  task_id: string | null;
  job_id: string;
  action: ProductionAction;
  stage_name: string | null;
  from_status: ProductionStatus | null;
  to_status: ProductionStatus | null;
  reason: string | null;
  at: string;
  by_id: string;
  by_name: string;
}

export const EVENT_COLUMNS =
  'id, run_id, task_id, job_id, action, stage_name, from_status, to_status, reason,' +
  ' at, by_id, by_name';

export function toEvent(row: EventRow): ProductionEvent {
  return {
    id: row.id,
    runId: row.run_id,
    taskId: row.task_id,
    jobId: row.job_id,
    action: row.action,
    stageName: row.stage_name,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    reason: toOptional(row.reason),
    at: toDate(row.at),
    byId: row.by_id,
    byName: row.by_name,
  };
}
