import type { Customer } from '@/features/customers/types';
import type { Enquiry } from '@/features/enquiries/types';
import type { Job } from '@/features/jobs/types';
import type { Id } from '@/types/common';

export type RecentUpdateKind =
  | 'customer-created'
  | 'customer-updated'
  | 'enquiry-created'
  | 'enquiry-converted'
  | 'enquiry-updated'
  | 'job-created'
  | 'job-updated';

export interface RecentUpdate {
  id: Id;
  kind: RecentUpdateKind;
  at: Date;
  /** What the entry is about, e.g. "ENQ-2627-0001". */
  title: string;
  /** Who or what it concerns, e.g. the customer name. */
  subtitle: string;
  /** Where clicking it goes, when there is somewhere to go. */
  href?: string;
}

export const RECENT_UPDATE_LABELS: Record<RecentUpdateKind, string> = {
  'customer-created': 'New customer',
  'customer-updated': 'Customer updated',
  'enquiry-created': 'New enquiry',
  'enquiry-converted': 'Enquiry converted to job',
  'enquiry-updated': 'Enquiry updated',
  'job-created': 'New job',
  'job-updated': 'Job updated',
};

/**
 * `createdAt` and `updatedAt` are written in the same operation when a record is
 * created, so they can differ by a few milliseconds without anything having
 * happened since.
 */
const MEANINGFUL_GAP_MS = 1000;

function isLater(candidate: Date, reference: Date): boolean {
  return candidate.getTime() - reference.getTime() > MEANINGFUL_GAP_MS;
}

/**
 * One entry per record, describing its most recent genuine event.
 *
 * This is not an audit log and does not pretend to be one: it reads the
 * timestamps that already exist on customers, enquiries and jobs. Two edits to
 * the same record show as one entry, and an enquiry only reads as "converted"
 * when conversion really is the newest thing that happened to it - a later edit
 * shows as an edit.
 */
export function buildRecentUpdates(
  customers: readonly Customer[],
  enquiries: readonly Enquiry[],
  jobs: readonly Job[],
  limit = 8,
): RecentUpdate[] {
  const entries: RecentUpdate[] = [];

  for (const customer of customers) {
    const updated = isLater(customer.updatedAt, customer.createdAt);
    entries.push({
      id: `customer-${customer.id}`,
      kind: updated ? 'customer-updated' : 'customer-created',
      at: updated ? customer.updatedAt : customer.createdAt,
      title: customer.name,
      subtitle: customer.businessName ?? customer.city,
      href: `/customers/${customer.id}`,
    });
  }

  for (const enquiry of enquiries) {
    const candidates: { kind: RecentUpdateKind; at: Date }[] = [
      { kind: 'enquiry-created', at: enquiry.createdAt },
    ];
    if (enquiry.convertedAt) {
      candidates.push({ kind: 'enquiry-converted', at: enquiry.convertedAt });
    }
    if (isLater(enquiry.updatedAt, enquiry.createdAt)) {
      candidates.push({ kind: 'enquiry-updated', at: enquiry.updatedAt });
    }

    // The newest event wins. Conversion wins a tie, because the edit that
    // records a conversion is that conversion.
    const newest = candidates.reduce((best, candidate) => {
      if (candidate.at.getTime() > best.at.getTime()) return candidate;
      if (candidate.at.getTime() === best.at.getTime() && candidate.kind === 'enquiry-converted') {
        return candidate;
      }
      return best;
    });

    entries.push({
      id: `enquiry-${enquiry.id}`,
      kind: newest.kind,
      at: newest.at,
      title: enquiry.enquiryNumber,
      subtitle: enquiry.customerName,
      href: `/enquiries/${enquiry.id}`,
    });
  }

  for (const job of jobs) {
    const updated = isLater(job.updatedAt, job.createdAt);
    entries.push({
      id: `job-${job.id}`,
      kind: updated ? 'job-updated' : 'job-created',
      at: updated ? job.updatedAt : job.createdAt,
      title: job.jobNumber,
      subtitle: `${job.customerName} - ${job.title}`,
      href: `/jobs/${job.id}`,
    });
  }

  return entries.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}
