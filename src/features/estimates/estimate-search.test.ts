import { describe, expect, it } from 'vitest';

import {
  expiredEstimates,
  filterEstimates,
  matchesEstimateTerm,
  queryEstimates,
} from '@/features/estimates/services/estimate-search';
import type { Estimate, EstimateStatus } from '@/features/estimates/types';
import { fromRupees } from '@/lib/money';

const NOW = new Date('2026-08-24T10:00:00.000Z');

function estimate(overrides: Partial<Estimate> = {}): Estimate {
  return {
    id: 'estimate-1',
    estimateNumber: 'EST-2627-0001',
    jobId: 'job-1',
    jobNumber: 'JOB-2627-0001',
    jobTitle: 'Shop board',
    customerId: 'customer-1',
    customerName: 'Ravi Kumar',
    customerMobile: '9812300011',
    customerBusinessName: 'Shreeji Traders',
    estimateDate: NOW,
    validUntil: new Date('2026-09-08T10:00:00.000Z'),
    lines: [],
    subtotal: fromRupees(5000),
    adjustment: null,
    total: fromRupees(5000),
    status: 'draft',
    sentAt: null,
    decision: null,
    cancelledAt: null,
    createdAt: NOW,
    createdBy: 'uid-owner',
    updatedAt: NOW,
    updatedBy: 'uid-owner',
    ...overrides,
  };
}

describe('searching quotations', () => {
  it('finds one by quotation number, job number, customer or business name', () => {
    const record = estimate();

    expect(matchesEstimateTerm(record, 'est-2627')).toBe(true);
    expect(matchesEstimateTerm(record, 'JOB-2627-0001')).toBe(true);
    expect(matchesEstimateTerm(record, 'ravi')).toBe(true);
    expect(matchesEstimateTerm(record, 'shreeji')).toBe(true);
    expect(matchesEstimateTerm(record, 'board')).toBe(true);
    expect(matchesEstimateTerm(record, 'nothing here')).toBe(false);
  });

  it('matches a mobile number however it was typed', () => {
    const record = estimate();

    expect(matchesEstimateTerm(record, '98123 00011')).toBe(true);
    expect(matchesEstimateTerm(record, '+91 98123 00011')).toBe(true);
    expect(matchesEstimateTerm(record, '098123 00011')).toBe(true);
    expect(matchesEstimateTerm(record, '300011')).toBe(true);
  });

  it('treats an empty search as "everything"', () => {
    expect(matchesEstimateTerm(estimate(), '   ')).toBe(true);
  });
});

describe('filtering by status', () => {
  const records = [
    estimate({ id: 'a', status: 'draft' }),
    estimate({ id: 'b', status: 'sent' }),
    estimate({ id: 'c', status: 'approved' }),
    estimate({ id: 'd', status: 'rejected' }),
    estimate({ id: 'e', status: 'cancelled' }),
  ];

  it('counts draft and sent as still open', () => {
    expect(filterEstimates(records, '', 'open').map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('can pick out one status, or show them all', () => {
    expect(filterEstimates(records, '', 'approved').map((item) => item.id)).toEqual(['c']);
    expect(filterEstimates(records, '', 'all')).toHaveLength(5);
  });
});

describe('paging', () => {
  const records = Array.from({ length: 7 }, (_, index) =>
    estimate({ id: `estimate-${String(index)}` }),
  );

  it('splits results and clamps a page number that has run off the end', () => {
    const page = queryEstimates(records, { term: '', status: 'all', page: 99, pageSize: 3 });

    expect(page.pageCount).toBe(3);
    expect(page.page).toBe(3);
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(7);
  });
});

describe('quotations past their validity date', () => {
  it('counts only sent ones, never drafts or decided ones', () => {
    const stale = new Date('2026-08-01T10:00:00.000Z');
    const records: Estimate[] = (['draft', 'sent', 'approved', 'rejected'] as EstimateStatus[]).map(
      (status) => estimate({ id: status, status, validUntil: stale }),
    );

    expect(expiredEstimates(records, NOW).map((item) => item.id)).toEqual(['sent']);
  });
});
