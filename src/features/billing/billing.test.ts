import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  countByStatus,
  matchesFilter,
  outstandingTotal,
  queryInvoices,
} from '@/features/billing/services/billing-search';
import {
  createInvoice,
  findInvoice,
  listInvoices,
  listPayments,
  recordPayment,
} from '@/features/billing/services/billing.service';
import { outstandingOf, paymentStatusFor, type Invoice } from '@/features/billing/types';
import { demoJob, demoJobPricing, resetDemoStore } from '@/features/demo/demo-store';
import { money } from '@/lib/money';
import { AppError } from '@/types/common';

/**
 * Billing, against the demo store.
 *
 * The demo store is the same service code with a memory backend, so the rules
 * exercised here are the ones the application applies. The database enforces
 * every one of them again, under a row lock - see the integration suite.
 */
vi.mock('@/config/demo', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isDemoMode: () => true,
}));

const ACTOR = { uid: 'demo-owner', name: 'Demo Owner' };
const PAID_ON = new Date('2026-08-26T10:00:00.000Z');

beforeEach(() => {
  resetDemoStore();
});

async function partlyPaid(): Promise<Invoice> {
  const invoice = await findInvoice('demo-invoice-1');
  if (!invoice) throw new Error('demo invoice missing');
  return invoice;
}

describe('payment totals', () => {
  it('reports what is still owed, not what was billed', async () => {
    const invoice = await partlyPaid();

    expect(invoice.total.paise).toBe(525_000);
    expect(invoice.paid.paise).toBe(200_000);
    expect(outstandingOf(invoice).paise).toBe(325_000);
  });

  it('moves an invoice from unpaid to partly paid to paid', () => {
    const total = money(1000);
    expect(paymentStatusFor(total, money(0))).toBe('unpaid');
    expect(paymentStatusFor(total, money(400))).toBe('partial');
    expect(paymentStatusFor(total, money(1000))).toBe('paid');
  });

  it('adds a receipt to the running total and the history', async () => {
    const invoice = await partlyPaid();

    await recordPayment({
      invoice,
      amount: money(100_000),
      paidAt: PAID_ON,
      mode: 'cash',
      actor: ACTOR,
    });

    const updated = await partlyPaid();
    expect(updated.paid.paise).toBe(300_000);
    expect(updated.status).toBe('partial');

    const history = await listPayments(invoice.id);
    expect(history).toHaveLength(2);
    expect(history[0]?.recordedBy).toBe('Demo Owner');
  });

  it('settles the invoice when the last of the balance comes in', async () => {
    const invoice = await partlyPaid();

    await recordPayment({
      invoice,
      amount: outstandingOf(invoice),
      paidAt: PAID_ON,
      mode: 'upi',
      actor: ACTOR,
    });

    const updated = await partlyPaid();
    expect(updated.status).toBe('paid');
    expect(outstandingOf(updated).paise).toBe(0);
  });
});

describe('overpayment', () => {
  it('refuses more than the outstanding balance', async () => {
    const invoice = await partlyPaid();

    await expect(
      recordPayment({
        invoice,
        amount: money(325_001),
        paidAt: PAID_ON,
        mode: 'cash',
        actor: ACTOR,
      }),
    ).rejects.toBeInstanceOf(AppError);

    const unchanged = await partlyPaid();
    expect(unchanged.paid.paise).toBe(200_000);
  });

  it('refuses a second receipt that would take it past the total', async () => {
    const invoice = await partlyPaid();

    await recordPayment({
      invoice,
      amount: money(325_000),
      paidAt: PAID_ON,
      mode: 'cash',
      actor: ACTOR,
    });

    const settled = await partlyPaid();
    await expect(
      recordPayment({
        invoice: settled,
        amount: money(1),
        paidAt: PAID_ON,
        mode: 'cash',
        actor: ACTOR,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('refuses a zero or negative amount', async () => {
    const invoice = await partlyPaid();

    await expect(
      recordPayment({ invoice, amount: money(0), paidAt: PAID_ON, mode: 'cash', actor: ACTOR }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe('raising an invoice', () => {
  it('copies the job pricing and applies the discount to the total', async () => {
    const job = demoJob('demo-job-1');
    const pricing = demoJobPricing('demo-job-1');
    if (!job || !pricing) throw new Error('demo job pricing missing');

    const invoice = await createInvoice({
      job,
      pricing,
      customer: null,
      discount: money(50_000),
      discountReason: 'Bulk order',
      actor: ACTOR,
    });

    expect(invoice.lines).toHaveLength(pricing.lines.length);
    expect(invoice.subtotal.paise).toBe(pricing.total.paise);
    expect(invoice.discount?.amount.paise).toBe(50_000);
    expect(invoice.total.paise).toBe(pricing.total.paise - 50_000);
    expect(invoice.status).toBe('unpaid');
    expect(invoice.paid.paise).toBe(0);
  });

  it('refuses a discount that would wipe out the bill', async () => {
    const job = demoJob('demo-job-1');
    const pricing = demoJobPricing('demo-job-1');
    if (!job || !pricing) throw new Error('demo job pricing missing');

    await expect(
      createInvoice({
        job,
        pricing,
        customer: null,
        discount: money(pricing.total.paise),
        discountReason: 'Free',
        actor: ACTOR,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('refuses to bill a job that has not been priced', async () => {
    const job = demoJob('demo-job-1');
    if (!job) throw new Error('demo job missing');

    await expect(
      createInvoice({
        job,
        pricing: {
          id: job.id,
          jobId: job.id,
          lines: [],
          subtotal: money(0),
          adjustment: null,
          total: money(0),
          createdAt: PAID_ON,
          createdBy: ACTOR.uid,
          updatedAt: PAID_ON,
          updatedBy: ACTOR.uid,
        },
        customer: null,
        actor: ACTOR,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe('the billing list', () => {
  it('filters by payment status', async () => {
    const { invoices } = await listInvoices();

    expect(queryInvoices(invoices, { filter: 'unpaid' }).every((i) => i.status === 'unpaid')).toBe(
      true,
    );
    expect(
      queryInvoices(invoices, { filter: 'partial' }).every((i) => i.status === 'partial'),
    ).toBe(true);
    expect(
      queryInvoices(invoices, { filter: 'outstanding' }).every((i) => i.status !== 'paid'),
    ).toBe(true);
    expect(queryInvoices(invoices, { filter: 'all' })).toHaveLength(invoices.length);
  });

  it('searches the invoice number, job and customer', async () => {
    const { invoices } = await listInvoices();

    expect(queryInvoices(invoices, { query: 'INV-2627-0001' })).toHaveLength(1);
    expect(queryInvoices(invoices, { query: 'shreeji' })).toHaveLength(1);
    expect(queryInvoices(invoices, { query: 'nothing here' })).toHaveLength(0);
  });

  it('totals what is outstanding across open invoices only', async () => {
    const { invoices } = await listInvoices();
    const counts = countByStatus(invoices);

    // 3,250.00 still owed on the part-paid bill plus 3,000.00 on the unpaid one.
    expect(outstandingTotal(invoices).paise).toBe(325_000 + 300_000);
    expect(counts.unpaid).toBe(1);
    expect(counts.partial).toBe(1);

    const paid = invoices.map((invoice) => ({
      ...invoice,
      paid: invoice.total,
      status: 'paid' as const,
    }));
    expect(outstandingTotal(paid).paise).toBe(0);
    expect(paid.every((invoice) => matchesFilter(invoice, 'outstanding'))).toBe(false);
  });
});
