import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  HAS_BACKEND,
  SKIP_MESSAGE,
  adminClient,
  assertNoError,
  assertOk,
  seedCustomerAccount,
  seedStaff,
  signedInAs,
  type TestAccount,
} from '@/test/integration/harness';

/**
 * Money, against a real database.
 *
 * The rules that have to hold whoever is calling, and whatever the browser
 * believes: a bill cannot be overpaid, what has been received is never written
 * by a client, payment history cannot be edited or deleted, and the snapshot on
 * the invoice cannot be rewritten after the fact.
 */
const describeIf = HAS_BACKEND ? describe : describe.skip;

let admin: SupabaseClient;
let owner: TestAccount;
let accounts: TestAccount;
let sales: TestAccount;
let production: TestAccount;
let viewer: TestAccount;
let portal: TestAccount;

const CUSTOMER = 'dddddddd-0000-4000-8000-00000000000d';
const FY = '2627';

interface InvoiceRow {
  id: string;
  invoice_number: string;
  subtotal_paise: number;
  discount_paise: number | null;
  total_paise: number;
  paid_paise: number;
  status: string;
}

async function makeJob(title: string) {
  return assertOk(
    await sales.client
      .rpc('create_job', {
        p_payload: {
          customer_id: CUSTOMER,
          customer_name: 'Billing Fixtures',
          customer_mobile: '9812300022',
          job_date: new Date().toISOString(),
          title,
          requirement_text: 'Fixture',
          status: 'open',
        },
        p_year_key: FY,
      })
      .single<{ id: string; job_number: string }>(),
    'create_job',
  );
}

async function priceJob(jobId: string, amountPaise: number) {
  assertNoError(
    await owner.client.rpc('save_job_pricing', {
      p_job_id: jobId,
      p_pricing: {
        subtotal_paise: amountPaise,
        adjustment_paise: null,
        adjustment_reason: null,
        total_paise: amountPaise,
        lines: [
          {
            product_name: 'Flex Print 440 GSM',
            pricing_method: 'per-square-foot',
            measurement_unit: 'foot',
            width: 6,
            height: 4,
            length: null,
            quantity: 2,
            rate_paise: Math.round(amountPaise / 24),
            rate_unit: 'sq-ft',
            calculated_area: 24,
            calculated_length: null,
            line_amount_paise: amountPaise,
            notes: null,
          },
        ],
      },
    }),
    'save_job_pricing',
  );
}

/** A priced job billed in full, ready to receive money against. */
async function billedJob(title: string, amountPaise: number, discountPaise: number | null = null) {
  const job = await makeJob(title);
  await priceJob(job.id, amountPaise);
  const invoice = assertOk(
    await accounts.client
      .rpc('create_invoice', {
        p_job_id: job.id,
        p_discount_paise: discountPaise,
        p_discount_reason: discountPaise ? 'Fixture discount' : null,
        p_notes: null,
        p_terms: 'Payment due on delivery.',
        p_year_key: FY,
      })
      .single<InvoiceRow>(),
    'create_invoice',
  );
  return { job, invoice };
}

async function readInvoice(id: string) {
  return assertOk(
    await accounts.client
      .from('invoices')
      .select('id, invoice_number, subtotal_paise, discount_paise, total_paise, paid_paise, status')
      .eq('id', id)
      .single<InvoiceRow>(),
    'read invoice',
  );
}

async function pay(client: SupabaseClient, invoiceId: string, amountPaise: number) {
  return client
    .rpc('record_payment', {
      p_invoice_id: invoiceId,
      p_amount_paise: amountPaise,
      p_paid_at: new Date().toISOString(),
      p_mode: 'cash',
      p_reference: null,
      p_note: null,
    })
    .single<{ id: string; amount_paise: number; recorded_by: string }>();
}

beforeAll(async () => {
  if (!HAS_BACKEND) {
    console.warn(SKIP_MESSAGE);
    return;
  }
  admin = adminClient();

  owner = await signedInAs(admin, 'owner.bill@devasriya.test', 'Owner@12345678');
  accounts = await signedInAs(admin, 'acct.bill@devasriya.test', 'Acct@12345678');
  sales = await signedInAs(admin, 'sales.bill@devasriya.test', 'Sales@12345678');
  production = await signedInAs(admin, 'prod.bill@devasriya.test', 'Prod@12345678');
  viewer = await signedInAs(admin, 'view.bill@devasriya.test', 'Viewer@1234567');
  portal = await signedInAs(admin, 'portal.bill@customer.test', 'Portal@1234567');

  await seedStaff(admin, owner, 'owner');
  await seedStaff(admin, accounts, 'accounts');
  await seedStaff(admin, sales, 'sales');
  await seedStaff(admin, production, 'production');
  await seedStaff(admin, viewer, 'viewer');

  assertNoError(
    await admin.from('customers').upsert({
      id: CUSTOMER,
      name: 'Billing Fixtures',
      type: 'business',
      mobile: '9829100088',
      address: '12 Bank Street',
      city: 'Udaipur',
      state: 'Rajasthan',
      pincode: '313001',
      preferred_language: 'hi',
      created_by: owner.uid,
      updated_by: owner.uid,
    }),
    'seed billing customer',
  );
  await seedCustomerAccount(admin, portal, CUSTOMER, 'Billing Fixtures');
});

afterAll(async () => {
  if (!HAS_BACKEND) return;
  for (const account of [owner, accounts, sales, production, viewer, portal]) {
    await account?.client.auth.signOut();
  }
});

describeIf('raising a bill', () => {
  it('copies the priced lines and numbers the invoice', async () => {
    const { job, invoice } = await billedJob('Billing snapshot', 500_000);

    expect(invoice.invoice_number).toMatch(/^INV-\d{4}-\d{4}$/);
    expect(invoice.subtotal_paise).toBe(500_000);
    expect(invoice.total_paise).toBe(500_000);
    expect(invoice.paid_paise).toBe(0);
    expect(invoice.status).toBe('unpaid');

    const lines = assertOk(
      await accounts.client
        .from('invoice_lines')
        .select('product_name, line_amount_paise')
        .eq('invoice_id', invoice.id)
        .returns<{ product_name: string; line_amount_paise: number }[]>(),
      'read invoice lines',
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]?.line_amount_paise).toBe(500_000);
    expect(job.job_number).toMatch(/^JOB-/);
  });

  it('takes the discount off the total and refuses one that swallows the bill', async () => {
    const { invoice } = await billedJob('Billing discount', 500_000, 50_000);
    expect(invoice.discount_paise).toBe(50_000);
    expect(invoice.total_paise).toBe(450_000);

    const job = await makeJob('Billing whole discount');
    await priceJob(job.id, 500_000);
    const refused = await accounts.client.rpc('create_invoice', {
      p_job_id: job.id,
      p_discount_paise: 500_000,
      p_discount_reason: 'Free',
      p_notes: null,
      p_terms: null,
      p_year_key: FY,
    });
    expect(refused.error?.message).toMatch(/whole bill/i);
  });

  it('refuses to bill a job that has not been priced', async () => {
    const job = await makeJob('Billing unpriced');
    const refused = await accounts.client.rpc('create_invoice', {
      p_job_id: job.id,
      p_discount_paise: null,
      p_discount_reason: null,
      p_notes: null,
      p_terms: null,
      p_year_key: FY,
    });
    expect(refused.error?.message).toMatch(/price the job/i);
  });
});

describeIf('receiving money', () => {
  it('moves the invoice through partly paid to paid, and names who received it', async () => {
    const { invoice } = await billedJob('Billing part payment', 400_000);

    const first = assertOk(await pay(accounts.client, invoice.id, 150_000), 'record_payment');
    expect(first.recorded_by).toBe('accounts user');

    let current = await readInvoice(invoice.id);
    expect(current.paid_paise).toBe(150_000);
    expect(current.status).toBe('partial');

    assertOk(await pay(accounts.client, invoice.id, 250_000), 'record_payment');
    current = await readInvoice(invoice.id);
    expect(current.paid_paise).toBe(400_000);
    expect(current.status).toBe('paid');
  });

  it('refuses more than the outstanding balance and leaves the invoice alone', async () => {
    const { invoice } = await billedJob('Billing overpayment', 300_000);

    const tooMuch = await pay(accounts.client, invoice.id, 300_001);
    expect(tooMuch.error?.message).toMatch(/more than the balance/i);

    assertOk(await pay(accounts.client, invoice.id, 300_000), 'record_payment');
    const another = await pay(accounts.client, invoice.id, 1);
    expect(another.error?.message).toMatch(/more than the balance/i);

    const current = await readInvoice(invoice.id);
    expect(current.paid_paise).toBe(300_000);
    expect(current.status).toBe('paid');
  });

  it('refuses a zero or negative amount', async () => {
    const { invoice } = await billedJob('Billing zero payment', 100_000);

    expect((await pay(accounts.client, invoice.id, 0)).error?.message).toMatch(/amount received/i);
    expect((await pay(accounts.client, invoice.id, -500)).error).not.toBeNull();
  });
});

describeIf('what a client may write', () => {
  it('will not let anyone write the paid figure or the status directly', async () => {
    const { invoice } = await billedJob('Billing tamper paid', 200_000);

    // paid_paise and status carry no update grant at all: not for accounts,
    // and not for the owner either.
    for (const account of [accounts, owner]) {
      const forged = await account.client
        .from('invoices')
        .update({ paid_paise: 200_000, status: 'paid', updated_by: account.uid })
        .eq('id', invoice.id);
      expect(forged.error).not.toBeNull();
    }

    const current = await readInvoice(invoice.id);
    expect(current.paid_paise).toBe(0);
    expect(current.status).toBe('unpaid');
  });

  it('will not let the snapshot on a raised invoice be rewritten', async () => {
    const { invoice } = await billedJob('Billing tamper snapshot', 250_000);

    const forged = await accounts.client
      .from('invoices')
      .update({ subtotal_paise: 1, customer_name: 'Somebody else', updated_by: accounts.uid })
      .eq('id', invoice.id);
    expect(forged.error).not.toBeNull();

    expect((await readInvoice(invoice.id)).subtotal_paise).toBe(250_000);
  });

  it('freezes the discount once money has been received', async () => {
    const { invoice } = await billedJob('Billing frozen discount', 200_000, 20_000);

    // Before any payment the discount can still be corrected, and the total
    // follows it rather than being typed.
    assertNoError(
      await accounts.client
        .from('invoices')
        .update({ discount_paise: 10_000, updated_by: accounts.uid })
        .eq('id', invoice.id),
      'correct the discount',
    );
    expect((await readInvoice(invoice.id)).total_paise).toBe(190_000);

    assertOk(await pay(accounts.client, invoice.id, 50_000), 'record_payment');

    const refused = await accounts.client
      .from('invoices')
      .update({ discount_paise: 100_000, updated_by: accounts.uid })
      .eq('id', invoice.id);
    expect(refused.error?.message).toMatch(/no longer change/i);
    expect((await readInvoice(invoice.id)).total_paise).toBe(190_000);
  });

  it('keeps payment history append-only', async () => {
    const { invoice } = await billedJob('Billing immutable history', 150_000);
    const payment = assertOk(await pay(accounts.client, invoice.id, 50_000), 'record_payment');

    const edited = await accounts.client
      .from('payments')
      .update({ amount_paise: 1 })
      .eq('id', payment.id);
    expect(edited.error).not.toBeNull();

    const removed = await accounts.client.from('payments').delete().eq('id', payment.id);
    expect(removed.error).not.toBeNull();

    const stillThere = assertOk(
      await accounts.client
        .from('payments')
        .select('amount_paise')
        .eq('id', payment.id)
        .single<{ amount_paise: number }>(),
      'read payment back',
    );
    expect(stillThere.amount_paise).toBe(50_000);
  });

  it('does not allow an invoice to be deleted', async () => {
    const { invoice } = await billedJob('Billing no delete', 100_000);

    const removed = await owner.client.from('invoices').delete().eq('id', invoice.id);
    expect(removed.error).not.toBeNull();
    expect((await readInvoice(invoice.id)).id).toBe(invoice.id);
  });
});

describeIf('who may do what', () => {
  it('lets sales read a bill but never raise one or take money', async () => {
    const { invoice } = await billedJob('Billing sales read', 100_000);

    const read = await sales.client
      .from('invoices')
      .select('id')
      .eq('id', invoice.id)
      .maybeSingle();
    expect(read.error).toBeNull();
    expect(read.data).not.toBeNull();

    const job = await makeJob('Billing sales create');
    await priceJob(job.id, 100_000);
    const raised = await sales.client.rpc('create_invoice', {
      p_job_id: job.id,
      p_discount_paise: null,
      p_discount_reason: null,
      p_notes: null,
      p_terms: null,
      p_year_key: FY,
    });
    expect(raised.error).not.toBeNull();

    expect((await pay(sales.client, invoice.id, 1_000)).error).not.toBeNull();
  });

  it('shows nothing at all to roles without billing:view', async () => {
    const { invoice } = await billedJob('Billing hidden', 100_000);
    assertOk(await pay(accounts.client, invoice.id, 10_000), 'record_payment');

    // Row level security answers "no rows", not "forbidden", so the check is
    // that nothing comes back rather than that an error does.
    for (const account of [production, viewer, portal]) {
      const invoices = await account.client.from('invoices').select('id').eq('id', invoice.id);
      expect(invoices.data ?? []).toHaveLength(0);

      const payments = await account.client
        .from('payments')
        .select('id')
        .eq('invoice_id', invoice.id);
      expect(payments.data ?? []).toHaveLength(0);
    }
  });

  it('refuses a payment recorded under another employee name', async () => {
    const { invoice } = await billedJob('Billing forged payer', 100_000);

    const forged = await accounts.client.from('payments').insert({
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      job_id: invoice.id,
      customer_id: CUSTOMER,
      amount_paise: 1_000,
      paid_at: new Date().toISOString(),
      mode: 'cash',
      recorded_by_id: owner.uid,
      recorded_by: 'owner user',
      created_by: accounts.uid,
    });
    expect(forged.error).not.toBeNull();
  });
});
