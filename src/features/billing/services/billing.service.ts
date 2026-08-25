import { isDemoMode } from '@/config/demo';
import {
  DEFAULT_INVOICE_TERMS,
  outstandingOf,
  paymentStatusFor,
  type Invoice,
  type Payment,
  type PaymentMode,
} from '@/features/billing/types';
import {
  INVOICE_COLUMNS,
  PAYMENT_COLUMNS,
  toInvoice,
  toPayment,
  type InvoiceRow,
  type PaymentRow,
} from '@/features/billing/services/invoice.rows';
import type { Customer } from '@/features/customers/types';
import {
  addDemoInvoice,
  addDemoPayment,
  demoInvoice,
  demoInvoices,
  demoPayments,
  nextDemoNumber,
  updateDemoInvoice,
} from '@/features/demo/demo-store';
import type { ActorSnapshot } from '@/features/enquiries/services/enquiry.service';
import type { JobPricingDocument } from '@/features/jobs/pricing-types';
import type { Job } from '@/features/jobs/types';
import { financialYearKey } from '@/lib/financial-year';
import { addMoney, money, subtractMoney, type Money } from '@/lib/money';
import { getSupabase } from '@/lib/supabase/client';
import { toAppError, unwrap, unwrapMaybe } from '@/lib/supabase/errors';
import { fromDate } from '@/lib/supabase/rows';
import { TABLES } from '@/services/base/tables';
import { AppError, type Id } from '@/types/common';

export const INVOICE_FETCH_CAP = 500;
export const PAYMENT_FETCH_CAP = 1000;

export interface InvoiceDirectory {
  invoices: Invoice[];
  capReached: boolean;
  cap: number;
}

export async function listInvoices(): Promise<InvoiceDirectory> {
  if (isDemoMode()) {
    return { invoices: demoInvoices(), capReached: false, cap: INVOICE_FETCH_CAP };
  }

  const rows = unwrap(
    await getSupabase()
      .from(TABLES.invoices)
      .select(INVOICE_COLUMNS)
      .order('invoice_date', { ascending: false })
      .limit(INVOICE_FETCH_CAP + 1)
      .returns<InvoiceRow[]>(),
  );

  const capReached = rows.length > INVOICE_FETCH_CAP;
  if (capReached) {
    console.warn(
      `[billing] more than ${String(INVOICE_FETCH_CAP)} invoices exist; showing the most recent.`,
    );
  }

  return {
    invoices: rows.slice(0, INVOICE_FETCH_CAP).map(toInvoice),
    capReached,
    cap: INVOICE_FETCH_CAP,
  };
}

export async function findInvoice(id: Id): Promise<Invoice | null> {
  if (isDemoMode()) return demoInvoice(id);

  const row = unwrapMaybe(
    await getSupabase()
      .from(TABLES.invoices)
      .select(INVOICE_COLUMNS)
      .eq('id', id)
      .maybeSingle<InvoiceRow>(),
  );
  return row ? toInvoice(row) : null;
}

/** Every receipt against one invoice, newest first. History is never edited. */
export async function listPayments(invoiceId: Id): Promise<Payment[]> {
  if (isDemoMode()) return demoPayments(invoiceId);

  const rows = unwrap(
    await getSupabase()
      .from(TABLES.payments)
      .select(PAYMENT_COLUMNS)
      .eq('invoice_id', invoiceId)
      .order('paid_at', { ascending: false })
      .limit(PAYMENT_FETCH_CAP)
      .returns<PaymentRow[]>(),
  );
  return rows.map(toPayment);
}

export interface CreateInvoiceInput {
  job: Job;
  pricing: JobPricingDocument;
  customer: Customer | null;
  discount?: Money | undefined;
  discountReason?: string | undefined;
  notes?: string | undefined;
  terms?: string | undefined;
  actor: ActorSnapshot;
}

/**
 * Bills a job from its current pricing.
 *
 * The priced lines and totals are copied exactly as Module 5 calculated them,
 * inside the database, straight from job_pricing_lines - the browser never
 * gets to say what the prices were. That is what makes the bill a record
 * rather than a claim.
 */
export async function createInvoice({
  job,
  pricing,
  customer,
  discount,
  discountReason,
  notes,
  terms,
  actor,
}: CreateInvoiceInput): Promise<Invoice> {
  if (pricing.lines.length === 0) {
    throw new AppError('invalid-input', 'Price the job before billing it.');
  }
  if (pricing.total.paise <= 0) {
    throw new AppError('invalid-input', 'A job priced at zero cannot be billed.');
  }

  const discountPaise = Math.max(discount?.paise ?? 0, 0);
  if (discountPaise >= pricing.total.paise) {
    throw new AppError('invalid-input', 'The discount cannot be the whole bill.');
  }

  const now = new Date();
  const yearKey = financialYearKey(now);
  const finalTerms = terms?.trim() ? terms.trim() : DEFAULT_INVOICE_TERMS;

  if (isDemoMode()) {
    const number = nextDemoNumber(
      'INV',
      yearKey,
      demoInvoices().map((invoice) => invoice.invoiceNumber),
    );
    return addDemoInvoice({
      invoiceNumber: number,
      jobId: job.id,
      jobNumber: job.jobNumber,
      jobTitle: job.title,
      customerId: job.customerId,
      customerName: job.customerName,
      customerMobile: job.customerMobile,
      invoiceDate: now,
      lines: pricing.lines,
      subtotal: pricing.total,
      discount:
        discountPaise > 0
          ? { amount: money(discountPaise), reason: discountReason?.trim() ?? '' }
          : null,
      total: money(pricing.total.paise - discountPaise),
      paid: money(0),
      status: 'unpaid',
      terms: finalTerms,
      ...(customer?.businessName ? { customerBusinessName: customer.businessName } : {}),
      ...(customer
        ? { customerAddress: `${customer.address}, ${customer.city} ${customer.pincode}` }
        : {}),
      ...(customer?.gstin ? { customerGstin: customer.gstin } : {}),
      ...(notes?.trim() ? { notes: notes.trim() } : {}),
      createdAt: now,
      createdBy: actor.uid,
      updatedAt: now,
      updatedBy: actor.uid,
    });
  }

  try {
    const created = unwrap(
      await getSupabase()
        .rpc('create_invoice', {
          p_job_id: job.id,
          p_discount_paise: discountPaise > 0 ? discountPaise : null,
          p_discount_reason: discountReason?.trim() ?? null,
          p_notes: notes?.trim() ?? null,
          p_terms: finalTerms,
          p_year_key: yearKey,
        })
        .single<InvoiceRow>(),
    );

    const full = await findInvoice(created.id);
    if (!full) throw new AppError('not-found', 'The invoice could not be read back.');
    return full;
  } catch (error) {
    throw toAppError(error);
  }
}

export interface RecordPaymentInput {
  invoice: Invoice;
  amount: Money;
  paidAt: Date;
  mode: PaymentMode;
  reference?: string | undefined;
  note?: string | undefined;
  actor: ActorSnapshot;
}

/**
 * Receives money against an invoice.
 *
 * Overpayment is refused here so the message is a useful one, and refused
 * again by the database under a row lock so two people receiving the same
 * balance at the same moment cannot both succeed. The paid figure and the
 * payment status are never written by this application: the database
 * recomputes both from the payment history.
 */
export async function recordPayment({
  invoice,
  amount,
  paidAt,
  mode,
  reference,
  note,
  actor,
}: RecordPaymentInput): Promise<Payment> {
  if (amount.paise <= 0) {
    throw new AppError('invalid-input', 'Enter the amount received.');
  }

  if (amount.paise > outstandingOf(invoice).paise) {
    throw new AppError(
      'invalid-input',
      'That is more than the balance outstanding on this invoice.',
    );
  }

  if (isDemoMode()) {
    const payment = addDemoPayment({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      jobId: invoice.jobId,
      customerId: invoice.customerId,
      amount,
      paidAt,
      mode,
      recordedById: actor.uid,
      recordedBy: actor.name,
      ...(reference?.trim() ? { reference: reference.trim() } : {}),
      ...(note?.trim() ? { note: note.trim() } : {}),
    });

    const paid = addMoney(invoice.paid, amount);
    updateDemoInvoice(invoice.id, {
      paid,
      status: paymentStatusFor(invoice.total, paid),
      updatedBy: actor.uid,
    });
    return payment;
  }

  try {
    const row = unwrap(
      await getSupabase()
        .rpc('record_payment', {
          p_invoice_id: invoice.id,
          p_amount_paise: amount.paise,
          p_paid_at: fromDate(paidAt),
          p_mode: mode,
          p_reference: reference?.trim() ?? null,
          p_note: note?.trim() ?? null,
        })
        .single<PaymentRow>(),
    );
    return toPayment(row);
  } catch (error) {
    throw toAppError(error);
  }
}

export interface UpdateInvoiceInput {
  invoice: Invoice;
  notes?: string | undefined;
  terms?: string | undefined;
  actor: ActorSnapshot;
}

/**
 * Edits the wording on a bill.
 *
 * The lines, the totals and the payment history are the record and are never
 * rewritten. If the price has moved, raise another invoice from the job.
 */
export async function updateInvoiceWording({
  invoice,
  notes,
  terms,
  actor,
}: UpdateInvoiceInput): Promise<void> {
  const trimmedNotes = notes?.trim() ? notes.trim() : undefined;
  const trimmedTerms = terms?.trim() ? terms.trim() : undefined;

  if (isDemoMode()) {
    updateDemoInvoice(invoice.id, {
      notes: trimmedNotes,
      terms: trimmedTerms,
      updatedBy: actor.uid,
    });
    return;
  }

  try {
    const { error } = await getSupabase()
      .from(TABLES.invoices)
      .update({
        notes: trimmedNotes ?? null,
        terms: trimmedTerms ?? null,
        updated_by: actor.uid,
      })
      .eq('id', invoice.id);
    if (error) throw error;
  } catch (error) {
    throw toAppError(error);
  }
}

/** Total still owed across a set of invoices. */
export function totalOutstanding(invoices: Invoice[]): Money {
  return invoices.reduce(
    (running, invoice) => addMoney(running, subtractMoney(invoice.total, invoice.paid)),
    money(0),
  );
}
