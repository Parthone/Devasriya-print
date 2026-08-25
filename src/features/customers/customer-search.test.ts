import { describe, expect, it } from 'vitest';

import {
  filterCustomers,
  findDuplicateMobile,
  queryCustomers,
} from '@/features/customers/services/customer-search';
import type { Customer } from '@/features/customers/types';

const NOW = new Date('2026-08-24T10:00:00.000Z');

function customer(overrides: Partial<Customer> & { id: string; name: string }): Customer {
  return {
    type: 'individual',
    mobile: '9876500001',
    address: '12 Station Road',
    city: 'Jaipur',
    state: 'Rajasthan',
    pincode: '302001',
    preferredLanguage: 'hi',
    isArchived: false,
    portalUserId: null,
    nameLower: overrides.name.toLowerCase(),
    createdAt: NOW,
    createdBy: 'uid-owner',
    updatedAt: NOW,
    updatedBy: 'uid-owner',
    ...overrides,
  };
}

const RAVI = customer({
  id: 'c1',
  name: 'Ravi Kumar',
  mobile: '9876500001',
  email: 'ravi@example.com',
});
const SHREE = customer({
  id: 'c2',
  name: 'Shreeji Traders',
  businessName: 'Shreeji Traders Pvt Ltd',
  type: 'business',
  mobile: '9812345678',
  gstin: '08AABCU9603R1ZM',
  city: 'Udaipur',
});
const ARCHIVED = customer({
  id: 'c3',
  name: 'Old Customer',
  mobile: '9800000000',
  isArchived: true,
});

const ALL = [RAVI, SHREE, ARCHIVED];

describe('customer search', () => {
  it('matches anywhere in the name, not just the start', () => {
    expect(filterCustomers(ALL, 'kumar', 'all')).toEqual([RAVI]);
    expect(filterCustomers(ALL, 'ravi', 'all')).toEqual([RAVI]);
  });

  it('matches business name, email, GSTIN and city', () => {
    expect(filterCustomers(ALL, 'pvt ltd', 'all')).toEqual([SHREE]);
    expect(filterCustomers(ALL, 'ravi@example', 'all')).toEqual([RAVI]);
    expect(filterCustomers(ALL, '08AABCU', 'all')).toEqual([SHREE]);
    expect(filterCustomers(ALL, 'udaipur', 'all')).toEqual([SHREE]);
  });

  it('matches a mobile number typed with spaces or a country code', () => {
    expect(filterCustomers(ALL, '98123 45678', 'all')).toEqual([SHREE]);
    expect(filterCustomers(ALL, '+91 98765 00001', 'all')).toEqual([RAVI]);
    expect(filterCustomers(ALL, '345678', 'all')).toEqual([SHREE]);
  });

  it('is case insensitive and ignores surrounding spaces', () => {
    expect(filterCustomers(ALL, '  SHREEJI  ', 'all')).toEqual([SHREE]);
  });

  it('returns nothing for a term that matches nobody', () => {
    expect(filterCustomers(ALL, 'nobody here', 'all')).toEqual([]);
  });

  it('filters by status independently of the term', () => {
    expect(filterCustomers(ALL, '', 'active')).toEqual([RAVI, SHREE]);
    expect(filterCustomers(ALL, '', 'archived')).toEqual([ARCHIVED]);
    expect(filterCustomers(ALL, '', 'all')).toHaveLength(3);
  });
});

describe('pagination', () => {
  const many = Array.from({ length: 57 }, (_, index) =>
    customer({ id: `c${String(index)}`, name: `Customer ${String(index).padStart(3, '0')}` }),
  );

  it('pages the filtered result', () => {
    const first = queryCustomers(many, { term: '', status: 'all', page: 1, pageSize: 25 });
    expect(first.items).toHaveLength(25);
    expect(first.total).toBe(57);
    expect(first.pageCount).toBe(3);

    const last = queryCustomers(many, { term: '', status: 'all', page: 3, pageSize: 25 });
    expect(last.items).toHaveLength(7);
    expect(last.page).toBe(3);
  });

  it('clamps a page number that is out of range', () => {
    expect(queryCustomers(many, { term: '', status: 'all', page: 99, pageSize: 25 }).page).toBe(3);
    expect(queryCustomers(many, { term: '', status: 'all', page: 0, pageSize: 25 }).page).toBe(1);
  });

  it('reports one empty page when nothing matches', () => {
    const result = queryCustomers(ALL, { term: 'zzz', status: 'all', page: 1, pageSize: 25 });
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.pageCount).toBe(1);
  });
});

describe('duplicate mobile detection', () => {
  it('finds another customer with the same primary number', () => {
    const twin = customer({ id: 'c4', name: 'Ravi Kumar Junior', mobile: '9876500001' });
    expect(findDuplicateMobile([RAVI, twin], '9876500001', 'c4')).toEqual([RAVI]);
  });

  it('ignores the customer being edited', () => {
    expect(findDuplicateMobile([RAVI], '9876500001', 'c1')).toEqual([]);
  });

  it('normalises the typed number before comparing', () => {
    expect(findDuplicateMobile([RAVI], '+91 98765 00001')).toEqual([RAVI]);
  });

  it('says nothing while the number is still incomplete', () => {
    expect(findDuplicateMobile([RAVI], '98765')).toEqual([]);
  });
});
