import type { Estimate, EstimateStatus } from '@/features/estimates/types';

export type EstimateStatusFilter = EstimateStatus | 'all' | 'open';

export interface EstimateQuery {
  term: string;
  status: EstimateStatusFilter;
  page: number;
  pageSize: number;
}

export interface EstimatePage {
  items: Estimate[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}

export const DEFAULT_PAGE_SIZE = 25;

/** Quotations still in play: not yet decided one way or the other. */
const OPEN_STATUSES: EstimateStatus[] = ['draft', 'sent'];

function haystack(estimate: Estimate): string {
  return [
    estimate.estimateNumber,
    estimate.jobNumber,
    estimate.customerName,
    estimate.customerMobile,
    estimate.customerBusinessName ?? '',
    estimate.jobTitle,
  ]
    .join(' ')
    .toLowerCase();
}

export function matchesEstimateTerm(estimate: Estimate, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;

  const hay = haystack(estimate);
  if (hay.includes(needle)) return true;

  const digits = needle.replace(/\D/g, '');
  if (digits.length < 4) return false;

  const candidates = new Set([digits]);
  if (digits.length > 10) candidates.add(digits.slice(-10));
  if (digits.length === 11 && digits.startsWith('0')) candidates.add(digits.slice(1));

  return [...candidates].some((candidate) => hay.includes(candidate));
}

export function matchesEstimateStatus(estimate: Estimate, status: EstimateStatusFilter): boolean {
  if (status === 'all') return true;
  if (status === 'open') return OPEN_STATUSES.includes(estimate.status);
  return estimate.status === status;
}

export function filterEstimates(
  estimates: readonly Estimate[],
  term: string,
  status: EstimateStatusFilter,
): Estimate[] {
  return estimates.filter(
    (estimate) => matchesEstimateStatus(estimate, status) && matchesEstimateTerm(estimate, term),
  );
}

export function queryEstimates(
  estimates: readonly Estimate[],
  { term, status, page, pageSize }: EstimateQuery,
): EstimatePage {
  const matches = filterEstimates(estimates, term, status);
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

/** Sent quotations whose validity date has passed. */
export function expiredEstimates(
  estimates: readonly Estimate[],
  now: Date = new Date(),
): Estimate[] {
  return estimates.filter(
    (estimate) => estimate.status === 'sent' && estimate.validUntil.getTime() < now.getTime(),
  );
}
