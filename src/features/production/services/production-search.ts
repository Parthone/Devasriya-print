import { DUE_SOON_DAYS } from '@/features/dashboard/services/dashboard-metrics';
import {
  currentTask,
  isSettled,
  type ProductionRun,
  type ProductionStatus,
} from '@/features/production/types';
import { isDueWithin, isOverdue, isToday } from '@/lib/business-day';

/** The four buckets the production screen offers. */
export type ProductionFilter = 'ready' | 'in-progress' | 'on-hold' | 'completed' | 'all';

export const PRODUCTION_FILTERS: { value: ProductionFilter; label: string }[] = [
  { value: 'ready', label: 'Ready' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'on-hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'all', label: 'All' },
];

/**
 * Which bucket a run belongs in.
 *
 * A run is described by the stage the shop floor would pick up next, not by an
 * average of its stages: "on hold" matters more than "three of five done",
 * because it is the thing somebody has to act on.
 */
export function bucketFor(run: ProductionRun): ProductionFilter {
  if (run.tasks.length > 0 && run.tasks.every((task) => isSettled(task.status))) {
    return 'completed';
  }
  const statuses = new Set<ProductionStatus>(run.tasks.map((task) => task.status));
  if (statuses.has('on-hold')) return 'on-hold';
  if (statuses.has('in-progress')) return 'in-progress';
  return 'ready';
}

export function matchesFilter(run: ProductionRun, filter: ProductionFilter): boolean {
  return filter === 'all' || bucketFor(run) === filter;
}

function haystack(run: ProductionRun): string {
  return [run.jobNumber, run.jobTitle, run.customerName, currentTask(run)?.stageName ?? '']
    .join(' ')
    .toLowerCase();
}

export function matchesTerm(run: ProductionRun, term: string): boolean {
  const needle = term.trim().toLowerCase();
  return !needle || haystack(run).includes(needle);
}

export function filterRuns(
  runs: readonly ProductionRun[],
  term: string,
  filter: ProductionFilter,
): ProductionRun[] {
  return runs.filter((run) => matchesFilter(run, filter) && matchesTerm(run, term));
}

/** How many runs sit in each bucket, for the filter counts. */
export function countByBucket(runs: readonly ProductionRun[]): Record<ProductionFilter, number> {
  const counts: Record<ProductionFilter, number> = {
    ready: 0,
    'in-progress': 0,
    'on-hold': 0,
    completed: 0,
    all: runs.length,
  };
  for (const run of runs) counts[bucketFor(run)] += 1;
  return counts;
}

// ── Module 9: operations control ───────────────────────────────────────────

/** Whose work the board is showing. */
export type WorkScope = 'all' | 'mine' | 'unassigned';

export const WORK_SCOPES: { value: WorkScope; label: string }[] = [
  { value: 'all', label: 'All work' },
  { value: 'mine', label: 'My work' },
  { value: 'unassigned', label: 'Unassigned' },
];

export type DeadlineFilter = 'any' | 'overdue' | 'today' | 'soon';

export const DEADLINE_FILTERS: { value: DeadlineFilter; label: string }[] = [
  { value: 'any', label: 'Any date' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'soon', label: 'Due soon' },
];

/**
 * How a run sits against its delivery date.
 *
 * Only the stage still to be done matters here: a run whose every stage is
 * finished is not overdue, it is waiting to be collected.
 */
export function deadlineStateFor(run: ProductionRun, now: Date = new Date()): DeadlineFilter {
  const due = run.expectedDeliveryDate;
  if (!due || bucketFor(run) === 'completed') return 'any';
  if (isOverdue(due, now)) return 'overdue';
  if (isToday(due, now)) return 'today';
  if (isDueWithin(due, DUE_SOON_DAYS, now)) return 'soon';
  return 'any';
}

function matchesScope(run: ProductionRun, scope: WorkScope, uid: string): boolean {
  if (scope === 'all') return true;
  const open = run.tasks.filter((task) => !isSettled(task.status));
  if (scope === 'unassigned') return open.some((task) => !task.assignedToId);
  return open.some((task) => task.assignedToId === uid);
}

export interface BoardQuery {
  term: string;
  status: ProductionFilter;
  scope: WorkScope;
  deadline: DeadlineFilter;
  department: string;
  assigneeId: string;
  uid: string;
  now?: Date;
}

/** Everything the board filters on, in one pass. */
export function queryRuns(runs: readonly ProductionRun[], query: BoardQuery): ProductionRun[] {
  const now = query.now ?? new Date();

  return runs.filter((run) => {
    if (!matchesFilter(run, query.status) || !matchesTerm(run, query.term)) return false;
    if (!matchesScope(run, query.scope, query.uid)) return false;
    if (query.deadline !== 'any' && deadlineStateFor(run, now) !== query.deadline) return false;

    const open = run.tasks.filter((task) => !isSettled(task.status));
    if (query.department !== 'all' && !open.some((task) => task.department === query.department)) {
      return false;
    }
    if (
      query.assigneeId !== 'all' &&
      !open.some((task) => task.assignedToId === query.assigneeId)
    ) {
      return false;
    }
    return true;
  });
}

export interface WorkloadEntry {
  id: string;
  name: string;
  open: number;
}

/**
 * How much unfinished work each person is holding.
 *
 * Counts stages still to be done, not stages ever touched: the question this
 * answers is "who has too much on right now", and finished work is not on.
 */
export function workloadFor(runs: readonly ProductionRun[]): {
  assigned: WorkloadEntry[];
  unassigned: number;
} {
  const byPerson = new Map<string, WorkloadEntry>();
  let unassigned = 0;

  for (const run of runs) {
    for (const task of run.tasks) {
      if (isSettled(task.status)) continue;
      if (!task.assignedToId) {
        unassigned += 1;
        continue;
      }
      const existing = byPerson.get(task.assignedToId);
      if (existing) {
        existing.open += 1;
      } else {
        byPerson.set(task.assignedToId, {
          id: task.assignedToId,
          name: task.assignedToName ?? 'Unnamed',
          open: 1,
        });
      }
    }
  }

  return {
    assigned: [...byPerson.values()].sort(
      (a, b) => b.open - a.open || a.name.localeCompare(b.name),
    ),
    unassigned,
  };
}

/** Runs needing attention on a date, worst first. Used by the deadlines screen. */
export function byDeadline(
  runs: readonly ProductionRun[],
  state: Exclude<DeadlineFilter, 'any'>,
  now: Date = new Date(),
): ProductionRun[] {
  return runs
    .filter((run) => deadlineStateFor(run, now) === state)
    .sort(
      (a, b) => (a.expectedDeliveryDate?.getTime() ?? 0) - (b.expectedDeliveryDate?.getTime() ?? 0),
    );
}
