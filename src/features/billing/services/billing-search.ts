import { outstandingOf, type Invoice, type PaymentStatus } from '@/features/billing/types';
import { addMoney, money, type Money } from '@/lib/money';

export const INVOICE_FILTERS = ['all', 'unpaid', 'partial', 'paid', 'outstanding'] as const;
export type InvoiceFilter = (typeof INVOICE_FILTERS)[number];

export const INVOICE_FILTER_LABELS: Record<InvoiceFilter, string> = {
  all: 'All',
  outstanding: 'Outstanding',
  unpaid: 'Unpaid',
  partial: 'Partly paid',
  paid: 'Paid',
};

export function matchesFilter(invoice: Invoice, filter: InvoiceFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'outstanding') return invoice.status !== 'paid';
  return invoice.status === filter;
}

/**
 * Free text over the fields somebody actually knows off the top of their head:
 * the invoice number, the job number, the customer and their mobile.
 */
export function matchesQuery(invoice: Invoice, query: string): boolean {
  const term = query.trim().toLowerCase();
  if (!term) return true;

  return [
    invoice.invoiceNumber,
    invoice.jobNumber,
    invoice.jobTitle,
    invoice.customerName,
    invoice.customerMobile,
    invoice.customerBusinessName ?? '',
  ].some((field) => field.toLowerCase().includes(term));
}

export interface InvoiceQuery {
  filter?: InvoiceFilter;
  query?: string;
}

export function queryInvoices(invoices: Invoice[], spec: InvoiceQuery = {}): Invoice[] {
  const filter = spec.filter ?? 'all';
  const query = spec.query ?? '';

  return invoices
    .filter((invoice) => matchesFilter(invoice, filter) && matchesQuery(invoice, query))
    .sort((a, b) => b.invoiceDate.getTime() - a.invoiceDate.getTime());
}

export function countByStatus(invoices: Invoice[]): Record<PaymentStatus, number> {
  const counts: Record<PaymentStatus, number> = { unpaid: 0, partial: 0, paid: 0 };
  for (const invoice of invoices) counts[invoice.status] += 1;
  return counts;
}

/** What the business is still owed across every open invoice. */
export function outstandingTotal(invoices: Invoice[]): Money {
  return invoices.reduce((running, invoice) => addMoney(running, outstandingOf(invoice)), money(0));
}
