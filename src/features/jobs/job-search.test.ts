import { describe, expect, it } from 'vitest';

import { filterJobs, overdueJobs, queryJobs } from '@/features/jobs/services/job-search';
import type { Job } from '@/features/jobs/types';

const NOW = new Date('2026-08-24T10:00:00.000Z');

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
    requirementText: 'Gold foil on maroon',
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

const OPEN = job({ id: 'j1' });
const DELIVERED = job({
  id: 'j2',
  jobNumber: 'JOB-2627-0002',
  customerName: 'Shreeji Traders',
  customerMobile: '9829100022',
  title: 'Diwali hoardings',
  enquiryId: 'e2',
  enquiryNumber: 'ENQ-2627-0002',
  status: 'delivered',
});
const HOLD = job({
  id: 'j3',
  jobNumber: 'JOB-2627-0003',
  title: 'Shop board',
  status: 'on-hold',
  pickupLocationName: 'City Branch',
});

const ALL = [OPEN, DELIVERED, HOLD];

describe('job search', () => {
  it('finds by job number, enquiry number, customer, mobile and title', () => {
    expect(filterJobs(ALL, 'JOB-2627-0002', 'all')).toEqual([DELIVERED]);
    expect(filterJobs(ALL, 'ENQ-2627-0002', 'all')).toEqual([DELIVERED]);
    expect(filterJobs(ALL, 'shreeji', 'all')).toEqual([DELIVERED]);
    expect(filterJobs(ALL, '9829100022', 'all')).toEqual([DELIVERED]);
    expect(filterJobs(ALL, 'hoardings', 'all')).toEqual([DELIVERED]);
    expect(filterJobs(ALL, 'city branch', 'all')).toEqual([HOLD]);
  });

  it('filters by status with an "active" shortcut', () => {
    expect(filterJobs(ALL, '', 'active')).toEqual([OPEN, HOLD]);
    expect(filterJobs(ALL, '', 'delivered')).toEqual([DELIVERED]);
    expect(filterJobs(ALL, '', 'all')).toHaveLength(3);
  });

  it('pages results', () => {
    const many = Array.from({ length: 26 }, (_, index) => job({ id: `j${String(index)}` }));
    const page = queryJobs(many, { term: '', status: 'all', page: 2, pageSize: 25 });
    expect(page.items).toHaveLength(1);
    expect(page.pageCount).toBe(2);
  });
});

describe('overdue jobs', () => {
  it('lists unfinished jobs past their delivery date', () => {
    const late = job({ id: 'j4', expectedDeliveryDate: new Date('2026-08-01') });
    const soon = job({ id: 'j5', expectedDeliveryDate: new Date('2026-09-01') });
    const deliveredLate = job({
      id: 'j6',
      status: 'delivered',
      expectedDeliveryDate: new Date('2026-08-01'),
    });

    expect(overdueJobs([late, soon, deliveredLate], NOW)).toEqual([late]);
  });
});
