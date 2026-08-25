import type { Invoice } from '@/features/billing/types';
import type { Customer } from '@/features/customers/types';
import { isLowStock, isOutOfStock, type InventoryItem } from '@/features/inventory/types';
import { ENQUIRY_STATUSES, type Enquiry, type EnquiryStatus } from '@/features/enquiries/types';
import type { Design } from '@/features/designs/types';
import type { Estimate } from '@/features/estimates/types';
import type { ProductionRun } from '@/features/production/types';
import { JOB_STATUSES, type Job, type JobStatus } from '@/features/jobs/types';
import { isDueWithin, isOverdue, isToday } from '@/lib/business-day';
import { addMoney, money, subtractMoney, type Money } from '@/lib/money';

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

export interface EstimateSummary {
  /** Quotations made but not yet given to the customer. */
  drafts: number;
  /** Sent and still within their validity date. */
  awaitingApproval: number;
  /** Sent but past the validity date, so worth chasing or reissuing. */
  pastValidity: number;
}

export function summariseEstimates(
  estimates: readonly Estimate[],
  now: Date = new Date(),
): EstimateSummary {
  let drafts = 0;
  let awaitingApproval = 0;
  let pastValidity = 0;

  for (const estimate of estimates) {
    if (estimate.status === 'draft') {
      drafts += 1;
    } else if (estimate.status === 'sent') {
      if (estimate.validUntil.getTime() < now.getTime()) {
        pastValidity += 1;
      } else {
        awaitingApproval += 1;
      }
    }
  }

  return { drafts, awaitingApproval, pastValidity };
}

export interface DesignSummary {
  /** Sent to a customer and not answered yet. */
  awaitingCustomer: number;
  /** Answered with a change request, so a new version is owed. */
  changesRequested: number;
}

export function summariseDesigns(designs: readonly Design[]): DesignSummary {
  let awaitingCustomer = 0;
  let changesRequested = 0;

  for (const design of designs) {
    if (design.status === 'submitted-for-review') awaitingCustomer += 1;
    else if (design.status === 'changes-requested') changesRequested += 1;
  }

  return { awaitingCustomer, changesRequested };
}

export interface ProductionSummary {
  /** In production and past the delivery date on the job. */
  overdue: number;
  /** Stopped for a reason somebody wrote down, waiting on a person. */
  onHold: number;
  /** Stages nobody has been given yet. */
  unassigned: number;
}

/**
 * The three production numbers worth putting on a dashboard.
 *
 * All about work that needs a person, not progress: a run that is simply
 * moving along does not belong on a list of things to look at.
 */
export function summariseProduction(
  runs: readonly ProductionRun[],
  now: Date = new Date(),
): ProductionSummary {
  let overdue = 0;
  let onHold = 0;
  let unassigned = 0;

  for (const run of runs) {
    const open = run.tasks.filter(
      (task) => task.status !== 'completed' && task.status !== 'skipped',
    );
    if (open.length === 0) continue;

    if (run.expectedDeliveryDate && isOverdue(run.expectedDeliveryDate, now)) overdue += 1;
    if (open.some((task) => task.status === 'on-hold')) onHold += 1;
    unassigned += open.filter((task) => !task.assignedToId).length;
  }

  return { overdue, onHold, unassigned };
}

export interface BillingSummary {
  /** Money billed and not yet received, across every open invoice. */
  outstanding: Money;
  unpaid: number;
  partial: number;
}

export function summariseBilling(invoices: readonly Invoice[]): BillingSummary {
  let outstanding = money(0);
  let unpaid = 0;
  let partial = 0;

  for (const invoice of invoices) {
    if (invoice.status === 'paid') continue;
    outstanding = addMoney(outstanding, subtractMoney(invoice.total, invoice.paid));
    if (invoice.status === 'unpaid') unpaid += 1;
    else partial += 1;
  }

  return { outstanding, unpaid, partial };
}

export interface InventorySummary {
  /** Materials at or below the minimum somebody set for them. */
  low: number;
  outOfStock: number;
}

export function summariseInventory(items: readonly InventoryItem[]): InventorySummary {
  return {
    low: items.filter(isLowStock).length,
    outOfStock: items.filter(isOutOfStock).length,
  };
}
