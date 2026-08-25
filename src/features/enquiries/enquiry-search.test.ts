import { describe, expect, it } from 'vitest';

import {
  dueForFollowUp,
  filterEnquiries,
  queryEnquiries,
} from '@/features/enquiries/services/enquiry-search';
import type { Enquiry } from '@/features/enquiries/types';

const NOW = new Date('2026-08-24T10:00:00.000Z');

function enquiry(overrides: Partial<Enquiry> & { id: string }): Enquiry {
  return {
    enquiryNumber: 'ENQ-2627-0001',
    customerId: 'c1',
    customerName: 'Ravi Kumar',
    customerMobile: '9812300011',
    enquiryDate: NOW,
    source: 'walk-in',
    requirementText: 'Wedding cards with gold foil',
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

const RAVI = enquiry({ id: 'e1' });
const SHREE = enquiry({
  id: 'e2',
  enquiryNumber: 'ENQ-2627-0002',
  customerId: 'c2',
  customerName: 'Shreeji Traders',
  customerMobile: '9829100022',
  requirementText: 'Flex hoardings for Diwali',
  status: 'converted',
  convertedJobId: 'j1',
});
const LOST = enquiry({
  id: 'e3',
  enquiryNumber: 'ENQ-2627-0003',
  customerName: 'Meena Sharma',
  customerMobile: '9887200033',
  status: 'lost',
  lostReason: 'Went with another press',
});

const ALL = [RAVI, SHREE, LOST];

describe('enquiry search', () => {
  it('finds by enquiry number', () => {
    expect(filterEnquiries(ALL, 'ENQ-2627-0002', 'all')).toEqual([SHREE]);
    expect(filterEnquiries(ALL, '0003', 'all')).toEqual([LOST]);
  });

  it('finds by customer name anywhere in the string', () => {
    expect(filterEnquiries(ALL, 'kumar', 'all')).toEqual([RAVI]);
    expect(filterEnquiries(ALL, 'traders', 'all')).toEqual([SHREE]);
  });

  it('finds by customer mobile, however it is typed', () => {
    expect(filterEnquiries(ALL, '9829100022', 'all')).toEqual([SHREE]);
    expect(filterEnquiries(ALL, '+91 98292 00022'.replace(' ', ''), 'all')).toEqual([]);
    expect(filterEnquiries(ALL, '+91 98871 00033', 'all')).toEqual([]);
    expect(filterEnquiries(ALL, '9887200033', 'all')).toEqual([LOST]);
    expect(filterEnquiries(ALL, '300011', 'all')).toEqual([RAVI]);
  });

  it('finds by requirement text', () => {
    expect(filterEnquiries(ALL, 'hoardings', 'all')).toEqual([SHREE]);
  });

  it('filters by status, with an "open" shortcut', () => {
    expect(filterEnquiries(ALL, '', 'open')).toEqual([RAVI]);
    expect(filterEnquiries(ALL, '', 'converted')).toEqual([SHREE]);
    expect(filterEnquiries(ALL, '', 'lost')).toEqual([LOST]);
    expect(filterEnquiries(ALL, '', 'all')).toHaveLength(3);
  });
});

describe('enquiry pagination', () => {
  const many = Array.from({ length: 30 }, (_, index) =>
    enquiry({
      id: `e${String(index)}`,
      enquiryNumber: `ENQ-2627-${String(index).padStart(4, '0')}`,
    }),
  );

  it('pages the filtered result', () => {
    const first = queryEnquiries(many, { term: '', status: 'all', page: 1, pageSize: 25 });
    expect(first.items).toHaveLength(25);
    expect(first.total).toBe(30);
    expect(first.pageCount).toBe(2);
  });

  it('clamps out of range pages', () => {
    expect(queryEnquiries(many, { term: '', status: 'all', page: 9, pageSize: 25 }).page).toBe(2);
  });
});

describe('follow-up due list', () => {
  it('lists open enquiries whose follow-up date has arrived', () => {
    const due = enquiry({ id: 'e4', status: 'follow-up', nextFollowUpAt: new Date('2026-08-20') });
    const later = enquiry({
      id: 'e5',
      status: 'follow-up',
      nextFollowUpAt: new Date('2026-09-20'),
    });
    const convertedDue = enquiry({
      id: 'e6',
      status: 'converted',
      convertedJobId: 'j2',
      nextFollowUpAt: new Date('2026-08-20'),
    });

    const result = dueForFollowUp([due, later, convertedDue], NOW);
    expect(result).toEqual([due]);
  });
});
