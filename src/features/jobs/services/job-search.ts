import type { Job, JobStatus } from '@/features/jobs/types';

export type JobStatusFilter = JobStatus | 'all' | 'active';

export interface JobQuery {
  term: string;
  status: JobStatusFilter;
  page: number;
  pageSize: number;
}

export interface JobPage {
  items: Job[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}

export const DEFAULT_PAGE_SIZE = 25;

const ACTIVE_STATUSES: JobStatus[] = ['open', 'in-progress', 'ready', 'on-hold'];

function haystack(job: Job): string {
  return [
    job.jobNumber,
    job.enquiryNumber ?? '',
    job.customerName,
    job.customerMobile,
    job.title,
    job.requirementText,
    job.pickupLocationName ?? '',
    job.assignedToName ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

export function matchesJobTerm(job: Job, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;

  const hay = haystack(job);
  if (hay.includes(needle)) return true;

  const digits = needle.replace(/\D/g, '');
  if (digits.length < 4) return false;

  const candidates = new Set([digits]);
  if (digits.length > 10) candidates.add(digits.slice(-10));
  if (digits.length === 11 && digits.startsWith('0')) candidates.add(digits.slice(1));

  return [...candidates].some((candidate) => hay.includes(candidate));
}

export function matchesJobStatus(job: Job, status: JobStatusFilter): boolean {
  if (status === 'all') return true;
  if (status === 'active') return ACTIVE_STATUSES.includes(job.status);
  return job.status === status;
}

export function filterJobs(jobs: readonly Job[], term: string, status: JobStatusFilter): Job[] {
  return jobs.filter((job) => matchesJobStatus(job, status) && matchesJobTerm(job, term));
}

export function queryJobs(
  jobs: readonly Job[],
  { term, status, page, pageSize }: JobQuery,
): JobPage {
  const matches = filterJobs(jobs, term, status);
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const start = (safePage - 1) * pageSize;

  return {
    items: matches.slice(start, start + pageSize),
    total: matches.length,
    page: safePage,
    pageCount,
    pageSize,
  };
}

/** Jobs past their expected delivery date and not finished. */
export function overdueJobs(jobs: readonly Job[], now: Date = new Date()): Job[] {
  return jobs.filter(
    (job) =>
      job.expectedDeliveryDate !== null &&
      job.expectedDeliveryDate !== undefined &&
      job.expectedDeliveryDate.getTime() < now.getTime() &&
      ACTIVE_STATUSES.includes(job.status),
  );
}
