import { z } from 'zod';

import { DEPARTMENTS, type Department } from '@/constants/organization';
import { AppError, type Entity, type Id } from '@/types/common';

export const PRODUCTION_STATUSES = [
  'pending',
  'ready',
  'in-progress',
  'on-hold',
  'completed',
  'skipped',
] as const;
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];

export const PRODUCTION_STATUS_LABELS: Record<ProductionStatus, string> = {
  pending: 'Waiting',
  ready: 'Ready to start',
  'in-progress': 'In progress',
  'on-hold': 'On hold',
  completed: 'Completed',
  skipped: 'Skipped',
};

export const RUN_STATUSES = ['in-progress', 'on-hold', 'completed', 'cancelled'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/**
 * Allowed moves for one stage.
 *
 * Work goes forwards. A stage that has been finished or passed over is history,
 * and the only way back to it is a decision somebody records elsewhere - not a
 * quiet edit here. Mirrored in `public.production_transitions`, so a move
 * refused in the browser is refused by the database for the same reason.
 */
export const PRODUCTION_TRANSITIONS: Record<ProductionStatus, ProductionStatus[]> = {
  pending: ['ready', 'skipped'],
  ready: ['in-progress', 'skipped'],
  'in-progress': ['on-hold', 'completed', 'skipped'],
  'on-hold': ['in-progress', 'skipped'],
  completed: [],
  skipped: [],
};

export function canTransition(from: ProductionStatus, to: ProductionStatus): boolean {
  return PRODUCTION_TRANSITIONS[from].includes(to);
}

/** Stopping or passing over a stage always says why. */
export function requiresReason(to: ProductionStatus): boolean {
  return to === 'on-hold' || to === 'skipped';
}

/** Finished one way or the other; nothing further happens to it. */
export function isSettled(status: ProductionStatus): boolean {
  return status === 'completed' || status === 'skipped';
}

export interface WorkflowStage extends Entity {
  name: string;
  department: Department;
  position: number;
  isActive: boolean;
}

export interface ProductionTask extends Entity {
  runId: Id;
  jobId: Id;
  stageId: Id | null;
  /** What the stage was called when this task was made. */
  stageName: string;
  department: Department;
  position: number;
  status: ProductionStatus;
  assignedToId?: Id | null | undefined;
  assignedToName?: string | null | undefined;
  startedAt?: Date | null | undefined;
  completedAt?: Date | null | undefined;
  holdReason?: string | undefined;
  skipReason?: string | undefined;
  notes?: string | undefined;
}

/**
 * One job's journey through the shop.
 *
 * `approvedDesignId` is the artwork this run was started against, snapshotted
 * so that a revision approved next week cannot change the answer to "what did
 * we actually print".
 */
export interface ProductionRun extends Entity {
  jobId: Id;
  jobNumber: string;
  jobTitle: string;
  customerId: Id;
  customerName: string;
  status: RunStatus;
  approvedDesignId?: Id | null | undefined;
  approvedDesignVersion?: number | null | undefined;
  startedAt: Date;
  startedById: Id;
  startedByName: string;
  completedAt?: Date | null | undefined;
  tasks: ProductionTask[];
}

export const PRODUCTION_ACTIONS = [
  'run-started',
  'stage-unlocked',
  'stage-started',
  'stage-held',
  'stage-resumed',
  'stage-completed',
  'stage-skipped',
  'stage-assigned',
  'run-completed',
] as const;
export type ProductionAction = (typeof PRODUCTION_ACTIONS)[number];

export const PRODUCTION_ACTION_LABELS: Record<ProductionAction, string> = {
  'run-started': 'Sent to production',
  'stage-unlocked': 'Ready to start',
  'stage-started': 'Started',
  'stage-held': 'Put on hold',
  'stage-resumed': 'Resumed',
  'stage-completed': 'Completed',
  'stage-skipped': 'Skipped',
  'stage-assigned': 'Assigned',
  'run-completed': 'All stages finished',
};

/** Append-only. Nothing that happened on the shop floor gets edited later. */
export interface ProductionEvent {
  id: Id;
  runId: Id;
  taskId?: Id | null | undefined;
  jobId: Id;
  action: ProductionAction;
  stageName?: string | null | undefined;
  fromStatus?: ProductionStatus | null | undefined;
  toStatus?: ProductionStatus | null | undefined;
  reason?: string | undefined;
  at: Date;
  byId: Id;
  byName: string;
}

export const stageFormSchema = z.object({
  name: z.string().trim().min(2, 'Give the stage a name').max(80, 'Name is too long'),
  department: z.enum(DEPARTMENTS),
  position: z.coerce.number().int().min(0, 'Order cannot be negative').max(99),
  isActive: z.boolean(),
});

export type StageFormValues = z.infer<typeof stageFormSchema>;

export interface WorkflowStageInput {
  name: string;
  department: Department;
  position: number;
  isActive: boolean;
}

const stageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  department: z.enum(DEPARTMENTS),
  position: z.number().int().nonnegative(),
  isActive: z.boolean(),
  createdAt: z.date(),
  createdBy: z.string(),
  updatedAt: z.date(),
  updatedBy: z.string(),
});

export function parseWorkflowStage(data: unknown, id: string): WorkflowStage {
  const result = stageSchema.safeParse(data);
  if (!result.success) {
    throw new AppError('invalid-input', `Workflow stage "${id}" is malformed.`, result.error);
  }
  return result.data;
}

/** The stage the shop floor should pick up next, or null when nothing is open. */
export function currentTask(run: ProductionRun): ProductionTask | null {
  const open = run.tasks.filter((task) => !isSettled(task.status));
  const sorted = [...open].sort((a, b) => a.position - b.position);
  return (
    sorted.find((task) => task.status === 'in-progress') ??
    sorted.find((task) => task.status === 'on-hold') ??
    sorted.find((task) => task.status === 'ready') ??
    sorted[0] ??
    null
  );
}

/** How far along a run is, as finished stages out of the total. */
export function runProgress(run: ProductionRun): { done: number; total: number; percent: number } {
  const total = run.tasks.length;
  const done = run.tasks.filter((task) => isSettled(task.status)).length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/**
 * Whether a stage may be started right now.
 *
 * Being `ready` is not enough on its own: everything in front of it has to be
 * finished or skipped. The database enforces the same rule, so this only
 * decides whether to offer the button.
 */
export function canStart(run: ProductionRun, task: ProductionTask): boolean {
  if (task.status !== 'ready') return false;
  return run.tasks.every((other) => other.position >= task.position || isSettled(other.status));
}
