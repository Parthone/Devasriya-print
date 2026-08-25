import { describe, expect, it } from 'vitest';

import type { Customer } from '@/features/customers/types';
import {
  summariseCustomers,
  summariseEnquiries,
  summariseJobs,
} from '@/features/dashboard/services/dashboard-metrics';
import type { Enquiry } from '@/features/enquiries/types';
import type { Job } from '@/features/jobs/types';

const NOW = new Date('2026-08-24T06:00:00.000Z'); // 11:30 IST
const ist = (day: string) => new Date(`${day}T10:00:00+05:30`);

function customer(overrides: Partial<Customer> & { id: string }): Customer {
  return {
    name: 'Ravi Kumar',
    nameLower: 'ravi kumar',
    type: 'individual',
    mobile: '9812300011',
    address: '12 Station Road',
    city: 'Jaipur',
    state: 'Rajasthan',
    pincode: '302001',
    preferredLanguage: 'hi',
    isArchived: false,
    portalUserId: null,
    createdAt: NOW,
    createdBy: 'uid-owner',
    updatedAt: NOW,
    updatedBy: 'uid-owner',
    ...overrides,
  };
}

function enquiry(overrides: Partial<Enquiry> & { id: string }): Enquiry {
  return {
    enquiryNumber: 'ENQ-2627-0001',
    customerId: 'c1',
    customerName: 'Ravi Kumar',
    customerMobile: '9812300011',
    enquiryDate: NOW,
    source: 'walk-in',
    requirementText: 'Wedding cards',
    requirementAudio: null,
    assignedToId: null,
    assignedToName: null,
    nextFollowUpAt: null,
    followUps: [],
    status: 'new',
    convertedJobId: null,
    convertedAt: null,
    createdAt: NOW,
    createdBy: 'uid-owner',
    updatedAt: NOW,
    updatedBy: 'uid-owner',
    ...overrides,
  };
}

function job(overrides: Partial<Job> & { id: string }): Job {
  return {
    jobNumber: 'JOB-2627-0001',
    customerId: 'c1',
    customerName: 'Ravi Kumar',
    customerMobile: '9812300011',
    enquiryId: null,
    enquiryNumber: null,
    jobDate: NOW,
    title: 'Wedding cards',
    requirementText: 'Gold foil',
    requirementAudio: null,
    priority: 'normal',
    expectedDeliveryDate: null,
    pickupLocationId: null,
    pickupLocationName: null,
    contactPersonId: null,
    contactPersonName: null,
    contactPersonMobile: null,
    assignedToId: null,
    assignedToName: null,
    status: 'open',
    createdAt: NOW,
    createdBy: 'uid-owner',
    updatedAt: NOW,
    updatedBy: 'uid-owner',
    ...overrides,
  };
}

describe('customer KPIs', () => {
  it('counts active customers and reports archived separately', () => {
    const summary = summariseCustomers([
      customer({ id: 'c1' }),
      customer({ id: 'c2' }),
      customer({ id: 'c3', isArchived: true }),
    ]);

    expect(summary.total).toBe(2);
    expect(summary.archived).toBe(1);
  });

  it('handles an empty directory', () => {
    expect(summariseCustomers([])).toEqual({ total: 0, archived: 0 });
  });
});

describe('enquiry KPIs', () => {
  const enquiries = [
    enquiry({ id: 'e1', status: 'new' }),
    enquiry({ id: 'e2', status: 'contacted' }),
    enquiry({ id: 'e3', status: 'follow-up' }),
    enquiry({ id: 'e4', status: 'quotation-required' }),
    enquiry({ id: 'e5', status: 'converted', convertedJobId: 'j1' }),
    enquiry({ id: 'e6', status: 'lost', lostReason: 'Price' }),
    enquiry({ id: 'e7', status: 'closed' }),
  ];

  it('counts every status in the pipeline', () => {
    const summary = summariseEnquiries(enquiries, NOW);
    expect(summary.byStatus).toEqual({
      new: 1,
      contacted: 1,
      'follow-up': 1,
      'quotation-required': 1,
      converted: 1,
      lost: 1,
      closed: 1,
    });
  });

  it('counts only unfinished enquiries as open', () => {
    expect(summariseEnquiries(enquiries, NOW).open).toBe(4);
  });

  it('separates follow-ups due today from overdue ones', () => {
    const summary = summariseEnquiries(
      [
        enquiry({ id: 'today', status: 'follow-up', nextFollowUpAt: ist('2026-08-24') }),
        enquiry({ id: 'late', status: 'follow-up', nextFollowUpAt: ist('2026-08-20') }),
        enquiry({ id: 'later', status: 'follow-up', nextFollowUpAt: ist('2026-08-28') }),
      ],
      NOW,
    );

    expect(summary.followUpsDueToday.map((item) => item.id)).toEqual(['today']);
    expect(summary.followUpsOverdue.map((item) => item.id)).toEqual(['late']);
  });

  it('ignores follow-up dates on enquiries that are finished', () => {
    const summary = summariseEnquiries(
      [
        enquiry({
          id: 'converted',
          status: 'converted',
          convertedJobId: 'j1',
          nextFollowUpAt: ist('2026-08-20'),
        }),
        enquiry({ id: 'lost', status: 'lost', lostReason: 'x', nextFollowUpAt: ist('2026-08-24') }),
      ],
      NOW,
    );

    expect(summary.followUpsDueToday).toEqual([]);
    expect(summary.followUpsOverdue).toEqual([]);
  });

  it('orders overdue follow-ups oldest first', () => {
    const summary = summariseEnquiries(
      [
        enquiry({ id: 'recent', status: 'new', nextFollowUpAt: ist('2026-08-23') }),
        enquiry({ id: 'ancient', status: 'new', nextFollowUpAt: ist('2026-08-01') }),
      ],
      NOW,
    );

    expect(summary.followUpsOverdue.map((item) => item.id)).toEqual(['ancient', 'recent']);
  });
});

describe('job KPIs', () => {
  const jobs = [
    job({ id: 'j1', status: 'open' }),
    job({ id: 'j2', status: 'in-progress' }),
    job({ id: 'j3', status: 'ready' }),
    job({ id: 'j4', status: 'delivered' }),
    job({ id: 'j5', status: 'on-hold' }),
    job({ id: 'j6', status: 'cancelled' }),
  ];

  it('counts every status', () => {
    expect(summariseJobs(jobs, NOW).byStatus).toEqual({
      open: 1,
      'in-progress': 1,
      ready: 1,
      delivered: 1,
      'on-hold': 1,
      cancelled: 1,
    });
  });

  it('counts open, in progress, ready and on hold as active', () => {
    const summary = summariseJobs(jobs, NOW);
    expect(summary.active).toBe(4);
    expect(summary.ready).toBe(1);
  });

  it('keeps due soon and overdue apart, so nothing is counted twice', () => {
    const summary = summariseJobs(
      [
        job({ id: 'today', expectedDeliveryDate: ist('2026-08-24') }),
        job({ id: 'third-day', expectedDeliveryDate: ist('2026-08-27') }),
        job({ id: 'fourth-day', expectedDeliveryDate: ist('2026-08-28') }),
        job({ id: 'late', expectedDeliveryDate: ist('2026-08-21') }),
      ],
      NOW,
    );

    expect(summary.dueSoon.map((item) => item.id)).toEqual(['today', 'third-day']);
    expect(summary.overdue.map((item) => item.id)).toEqual(['late']);

    const dueSoonIds = new Set(summary.dueSoon.map((item) => item.id));
    for (const overdue of summary.overdue) {
      expect(dueSoonIds.has(overdue.id)).toBe(false);
    }
  });

  it('ignores delivery dates on finished jobs', () => {
    const summary = summariseJobs(
      [
        job({ id: 'delivered', status: 'delivered', expectedDeliveryDate: ist('2026-08-20') }),
        job({ id: 'cancelled', status: 'cancelled', expectedDeliveryDate: ist('2026-08-24') }),
      ],
      NOW,
    );

    expect(summary.dueSoon).toEqual([]);
    expect(summary.overdue).toEqual([]);
    expect(summary.upcomingDeliveries).toEqual([]);
  });

  it('lists urgent and unassigned active jobs', () => {
    const summary = summariseJobs(
      [
        job({ id: 'urgent', priority: 'urgent' }),
        job({ id: 'assigned', assignedToId: 'uid-1', assignedToName: 'Imran' }),
        job({ id: 'urgent-done', priority: 'urgent', status: 'delivered' }),
      ],
      NOW,
    );

    expect(summary.urgent.map((item) => item.id)).toEqual(['urgent']);
    expect(summary.unassigned.map((item) => item.id)).toEqual(['urgent']);
  });

  it('orders upcoming deliveries soonest first, overdue included', () => {
    const summary = summariseJobs(
      [
        job({ id: 'later', expectedDeliveryDate: ist('2026-09-10') }),
        job({ id: 'late', expectedDeliveryDate: ist('2026-08-20') }),
        job({ id: 'soon', expectedDeliveryDate: ist('2026-08-25') }),
        job({ id: 'no-date' }),
      ],
      NOW,
    );

    expect(summary.upcomingDeliveries.map((item) => item.id)).toEqual(['late', 'soon', 'later']);
  });

  it('handles an empty job list', () => {
    const summary = summariseJobs([], NOW);
    expect(summary.active).toBe(0);
    expect(summary.dueSoon).toEqual([]);
    expect(summary.upcomingDeliveries).toEqual([]);
  });
});
