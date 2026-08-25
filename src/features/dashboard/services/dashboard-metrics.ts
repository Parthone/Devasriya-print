import type { Customer } from '@/features/customers/types';
import { ENQUIRY_STATUSES, type Enquiry, type EnquiryStatus } from '@/features/enquiries/types';
import { JOB_STATUSES, type Job, type JobStatus } from '@/features/jobs/types';
import { isDueWithin, isOverdue, isToday } from '@/lib/business-day';

/** Work still in play. Matches the "open" filter on the enquiry directory. */
const OPEN_ENQUIRY_STATUSES: EnquiryStatus[] = [
  'new',
  'contacted',
  'follow-up',
  'quotation-required',
];

/** Jobs that are still someone's responsibility today. */
const ACTIVE_JOB_STATUSES: JobStatus[] = ['open', 'in-progress', 'ready', 'on-hold'];

/** How far ahead "due soon" looks, in business calendar days. */
export const DUE_SOON_DAYS = 3;

export interface CustomerSummary {
  total: number;
  archived: number;
}

export function summariseCustomers(customers: readonly Customer[]): CustomerSummary {
  const archived = customers.filter((customer) => customer.isArchived).length;
  return { total: customers.length - archived, archived };
}

export interface EnquirySummary {
  open: number;
  byStatus: Record<EnquiryStatus, number>;
  followUpsDueToday: Enquiry[];
  followUpsOverdue: Enquiry[];
}

export function summariseEnquiries(
  enquiries: readonly Enquiry[],
  now: Date = new Date(),
): EnquirySummary {
  const byStatus = Object.fromEntries(ENQUIRY_STATUSES.map((status) => [status, 0])) as Record<
    EnquiryStatus,
    number
  >;

  for (const enquiry of enquiries) {
    byStatus[enquiry.status] += 1;
  }

  const openEnquiries = enquiries.filter((enquiry) =>
    OPEN_ENQUIRY_STATUSES.includes(enquiry.status),
  );

  const withFollowUp = openEnquiries.filter(
    (enquiry): enquiry is Enquiry & { nextFollowUpAt: Date } => Boolean(enquiry.nextFollowUpAt),
  );

  return {
    open: openEnquiries.length,
    byStatus,
    followUpsDueToday: withFollowUp
      .filter((enquiry) => isToday(enquiry.nextFollowUpAt, now))
      .sort((a, b) => a.customerName.localeCompare(b.customerName)),
    followUpsOverdue: withFollowUp
      .filter((enquiry) => isOverdue(enquiry.nextFollowUpAt, now))
      .sort((a, b) => a.nextFollowUpAt.getTime() - b.nextFollowUpAt.getTime()),
  };
}

export interface JobSummary {
  active: number;
  ready: number;
  byStatus: Record<JobStatus, number>;
  /** Active jobs due today or in the next few days. Never includes overdue. */
  dueSoon: Job[];
  overdue: Job[];
  urgent: Job[];
  unassigned: Job[];
  /** Soonest first: overdue, then due soon, then the rest with a date. */
  upcomingDeliveries: Job[];
}

export function summariseJobs(jobs: readonly Job[], now: Date = new Date()): JobSummary {
  const byStatus = Object.fromEntries(JOB_STATUSES.map((status) => [status, 0])) as Record<
    JobStatus,
    number
  >;

  for (const job of jobs) {
    byStatus[job.status] += 1;
  }

  const active = jobs.filter((job) => ACTIVE_JOB_STATUSES.includes(job.status));
  const withDelivery = active.filter((job): job is Job & { expectedDeliveryDate: Date } =>
    Boolean(job.expectedDeliveryDate),
  );

  const bySoonest = (
    a: Job & { expectedDeliveryDate: Date },
    b: Job & { expectedDeliveryDate: Date },
  ) => a.expectedDeliveryDate.getTime() - b.expectedDeliveryDate.getTime();

  return {
    active: active.length,
    ready: byStatus.ready,
    byStatus,
    dueSoon: withDelivery
      .filter((job) => isDueWithin(job.expectedDeliveryDate, DUE_SOON_DAYS, now))
      .sort(bySoonest),
    overdue: withDelivery.filter((job) => isOverdue(job.expectedDeliveryDate, now)).sort(bySoonest),
    urgent: active.filter((job) => job.priority === 'urgent'),
    unassigned: active.filter((job) => !job.assignedToId),
    upcomingDeliveries: [...withDelivery].sort(bySoonest),
  };
}
