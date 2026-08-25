import type { Customer } from '@/features/customers/types';

export type CustomerStatusFilter = 'active' | 'archived' | 'all';

export interface CustomerQuery {
  term: string;
  status: CustomerStatusFilter;
  page: number;
  pageSize: number;
}

export interface CustomerPage {
  items: Customer[];
  /** Number of customers matching the filters, before pagination. */
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}

export const DEFAULT_PAGE_SIZE = 25;

/**
 * Fields a search term is matched against. Substring matching, because a user
 * typing "kumar" expects to find "Ravi Kumar", and typing the last digits of a
 * number expects to find that customer.
 */
function haystack(customer: Customer): string {
  return [
    customer.name,
    customer.businessName ?? '',
    customer.mobile,
    customer.alternateMobile ?? '',
    customer.email ?? '',
    customer.gstin ?? '',
    customer.city,
  ]
    .join(' ')
    .toLowerCase();
}

export function matchesTerm(customer: Customer, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;

  const hay = haystack(customer);
  if (hay.includes(needle)) return true;

  // A number typed with spaces, a leading zero or +91 still matches the stored
  // ten digit form, and a partial number matches as a substring.
  const digits = needle.replace(/\D/g, '');
  if (digits.length < 4) return false;

  const candidates = new Set([digits]);
  if (digits.length > 10) candidates.add(digits.slice(-10));
  if (digits.length === 11 && digits.startsWith('0')) candidates.add(digits.slice(1));

  return [...candidates].some((candidate) => hay.includes(candidate));
}

export function matchesStatus(customer: Customer, status: CustomerStatusFilter): boolean {
  if (status === 'all') return true;
  return status === 'archived' ? customer.isArchived : !customer.isArchived;
}

export function filterCustomers(
  customers: readonly Customer[],
  term: string,
  status: CustomerStatusFilter,
): Customer[] {
  return customers.filter(
    (customer) => matchesStatus(customer, status) && matchesTerm(customer, term),
  );
}

/**
 * Filters, then pages, in the browser.
 *
 * Pure and separate from the data access so that moving search to Firestore
 * queries later replaces this function without touching the UI.
 */
export function queryCustomers(
  customers: readonly Customer[],
  { term, status, page, pageSize }: CustomerQuery,
): CustomerPage {
  const matches = filterCustomers(customers, term, status);
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

/**
 * Other customers already using this primary mobile number.
 *
 * Duplicates are allowed - families and small businesses share numbers - but
 * the form warns and links to the existing record so staff can decide.
 */
export function findDuplicateMobile(
  customers: readonly Customer[],
  mobile: string,
  excludeId?: string,
): Customer[] {
  const digits = mobile.replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return [];
  return customers.filter((customer) => customer.mobile === digits && customer.id !== excludeId);
}
