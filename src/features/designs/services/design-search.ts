import type { Design, DesignStatus } from '@/features/designs/types';

export type DesignStatusFilter = DesignStatus | 'all' | 'open';

export interface DesignQuery {
  term: string;
  status: DesignStatusFilter;
  page: number;
  pageSize: number;
}

export interface DesignPage {
  items: Design[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}

export const DEFAULT_PAGE_SIZE = 25;

/** Versions still part of the conversation, rather than history. */
const OPEN_STATUSES: DesignStatus[] = ['draft', 'submitted-for-review', 'changes-requested'];

function haystack(design: Design): string {
  return [design.jobNumber, design.jobTitle, design.customerName, design.uploadedByName]
    .join(' ')
    .toLowerCase();
}

export function matchesDesignTerm(design: Design, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return haystack(design).includes(needle);
}

export function matchesDesignStatus(design: Design, status: DesignStatusFilter): boolean {
  if (status === 'all') return true;
  if (status === 'open') return OPEN_STATUSES.includes(design.status);
  return design.status === status;
}

export function filterDesigns(
  designs: readonly Design[],
  term: string,
  status: DesignStatusFilter,
): Design[] {
  return designs.filter(
    (design) => matchesDesignStatus(design, status) && matchesDesignTerm(design, term),
  );
}

export function queryDesigns(
  designs: readonly Design[],
  { term, status, page, pageSize }: DesignQuery,
): DesignPage {
  const matches = filterDesigns(designs, term, status);
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

/** Sent to a customer and not yet answered. */
export function awaitingCustomer(designs: readonly Design[]): Design[] {
  return designs.filter((design) => design.status === 'submitted-for-review');
}

/** Answered with a change request and still waiting on a new version. */
export function changesRequested(designs: readonly Design[]): Design[] {
  return designs.filter((design) => design.status === 'changes-requested');
}
