import type { Enquiry, EnquiryStatus } from '@/features/enquiries/types';

export type EnquiryStatusFilter = EnquiryStatus | 'all' | 'open';

export interface EnquiryQuery {
  term: string;
  status: EnquiryStatusFilter;
  page: number;
  pageSize: number;
}

export interface EnquiryPage {
  items: Enquiry[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}

export const DEFAULT_PAGE_SIZE = 25;

/** Everything still being worked on. The default view. */
const OPEN_STATUSES: EnquiryStatus[] = ['new', 'contacted', 'follow-up', 'quotation-required'];

function haystack(enquiry: Enquiry): string {
  return [
    enquiry.enquiryNumber,
    enquiry.customerName,
    enquiry.customerMobile,
    enquiry.requirementText,
    enquiry.notes ?? '',
    enquiry.assignedToName ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

export function matchesEnquiryTerm(enquiry: Enquiry, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;

  const hay = haystack(enquiry);
  if (hay.includes(needle)) return true;

  // Mobile numbers typed with spaces, a leading zero or +91 still match.
  const digits = needle.replace(/\D/g, '');
  if (digits.length < 4) return false;

  const candidates = new Set([digits]);
  if (digits.length > 10) candidates.add(digits.slice(-10));
  if (digits.length === 11 && digits.startsWith('0')) candidates.add(digits.slice(1));

  return [...candidates].some((candidate) => hay.includes(candidate));
}

export function matchesEnquiryStatus(enquiry: Enquiry, status: EnquiryStatusFilter): boolean {
  if (status === 'all') return true;
  if (status === 'open') return OPEN_STATUSES.includes(enquiry.status);
  return enquiry.status === status;
}

export function filterEnquiries(
  enquiries: readonly Enquiry[],
  term: string,
  status: EnquiryStatusFilter,
): Enquiry[] {
  return enquiries.filter(
    (enquiry) => matchesEnquiryStatus(enquiry, status) && matchesEnquiryTerm(enquiry, term),
  );
}

export function queryEnquiries(
  enquiries: readonly Enquiry[],
  { term, status, page, pageSize }: EnquiryQuery,
): EnquiryPage {
  const matches = filterEnquiries(enquiries, term, status);
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

/** Enquiries whose follow-up date has arrived. Used by the directory summary. */
export function dueForFollowUp(enquiries: readonly Enquiry[], now: Date = new Date()): Enquiry[] {
  return enquiries.filter(
    (enquiry) =>
      enquiry.nextFollowUpAt !== null &&
      enquiry.nextFollowUpAt !== undefined &&
      enquiry.nextFollowUpAt.getTime() <= now.getTime() &&
      OPEN_STATUSES.includes(enquiry.status),
  );
}
