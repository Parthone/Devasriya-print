import {
  currentTask,
  isSettled,
  type ProductionRun,
  type ProductionStatus,
} from '@/features/production/types';

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
