import { isDemoMode } from '@/config/demo';
import {
  addDemoEstimate,
  demoEstimate,
  demoEstimates,
  nextDemoNumber,
  updateDemoEstimate,
} from '@/features/demo/demo-store';
import type { Customer } from '@/features/customers/types';
import type { ActorSnapshot } from '@/features/enquiries/services/enquiry.service';
import {
  canTransition,
  DEFAULT_TERMS,
  DEFAULT_VALIDITY_DAYS,
  ESTIMATE_STATUS_LABELS,
  isEditable,
  type Estimate,
  type EstimateStatus,
} from '@/features/estimates/types';
import {
  ESTIMATE_COLUMNS,
  toEstimate,
  type EstimateRow,
} from '@/features/estimates/services/estimate.rows';
import type { JobPricingDocument } from '@/features/jobs/pricing-types';
import type { Job } from '@/features/jobs/types';
import { financialYearKey } from '@/lib/financial-year';
import { getSupabase } from '@/lib/supabase/client';
import { toAppError, unwrap, unwrapMaybe } from '@/lib/supabase/errors';
import { fromDate } from '@/lib/supabase/rows';
import { TABLES } from '@/services/base/tables';
import { AppError, type Id } from '@/types/common';

export const ESTIMATE_FETCH_CAP = 500;

export interface EstimateDirectory {
  estimates: Estimate[];
  capReached: boolean;
  cap: number;
}

export async function listEstimates(): Promise<EstimateDirectory> {
  if (isDemoMode()) {
    return { estimates: demoEstimates(), capReached: false, cap: ESTIMATE_FETCH_CAP };
  }

  const rows = unwrap(
    await getSupabase()
      .from(TABLES.estimates)
      .select(ESTIMATE_COLUMNS)
      .order('estimate_date', { ascending: false })
      .limit(ESTIMATE_FETCH_CAP + 1)
      .returns<EstimateRow[]>(),
  );

  const capReached = rows.length > ESTIMATE_FETCH_CAP;
  if (capReached) {
    console.warn(
      `[estimates] more than ${String(ESTIMATE_FETCH_CAP)} estimates exist; showing the most recent.`,
    );
  }

  return {
    estimates: rows.slice(0, ESTIMATE_FETCH_CAP).map(toEstimate),
    capReached,
    cap: ESTIMATE_FETCH_CAP,
  };
}

export async function findEstimate(id: Id): Promise<Estimate | null> {
  if (isDemoMode()) return demoEstimate(id);

  const row = unwrapMaybe(
    await getSupabase()
      .from(TABLES.estimates)
      .select(ESTIMATE_COLUMNS)
      .eq('id', id)
      .maybeSingle<EstimateRow>(),
  );
  return row ? toEstimate(row) : null;
}

export function defaultValidUntil(from: Date = new Date()): Date {
  const date = new Date(from);
  date.setDate(date.getDate() + DEFAULT_VALIDITY_DAYS);
  return date;
}

export interface CreateEstimateInput {
  job: Job;
  pricing: JobPricingDocument;
  customer: Customer | null;
  validUntil: Date;
  notes?: string | undefined;
  terms?: string | undefined;
  actor: ActorSnapshot;
}

/**
 * Turns the current job pricing into a quotation.
 *
 * The priced lines and totals are copied exactly as Module 5 calculated them -
 * no rate is looked up again and nothing is recomputed, so the quotation keeps
 * saying what it said on the day it was given.
 */
export async function createEstimate({
  job,
  pricing,
  customer,
  validUntil,
  notes,
  terms,
  actor,
}: CreateEstimateInput): Promise<Estimate> {
  if (pricing.lines.length === 0) {
    throw new AppError('invalid-input', 'Price the job before making a quotation for it.');
  }

  const now = new Date();
  const yearKey = financialYearKey(now);

  const base = {
    jobId: job.id,
    jobNumber: job.jobNumber,
    jobTitle: job.title,
    customerId: job.customerId,
    customerName: job.customerName,
    customerMobile: job.customerMobile,
    estimateDate: now,
    validUntil,
    // Copied, not linked.
    lines: pricing.lines,
    subtotal: pricing.subtotal,
    adjustment: pricing.adjustment,
    total: pricing.total,
    status: 'draft' as EstimateStatus,
    sentAt: null,
    decision: null,
    cancelledAt: null,
    ...(customer?.businessName ? { customerBusinessName: customer.businessName } : {}),
    ...(customer
      ? { customerAddress: `${customer.address}, ${customer.city} ${customer.pincode}` }
      : {}),
    ...(customer?.gstin ? { customerGstin: customer.gstin } : {}),
    ...(notes?.trim() ? { notes: notes.trim() } : {}),
    ...(terms?.trim() ? { terms: terms.trim() } : { terms: DEFAULT_TERMS }),
  };

  if (isDemoMode()) {
    const number = nextDemoNumber(
      'EST',
      yearKey,
      demoEstimates().map((estimate) => estimate.estimateNumber),
    );
    return addDemoEstimate({
      ...base,
      estimateNumber: number,
      createdAt: now,
      createdBy: actor.uid,
      updatedAt: now,
      updatedBy: actor.uid,
    });
  }

  try {
    // The lines are copied inside the database, straight from job_pricing_lines,
    // so the client never gets to say what the prices were. That is what makes
    // the snapshot a record rather than a claim.
    const created = unwrap(
      await getSupabase()
        .rpc('create_estimate', {
          p_job_id: job.id,
          p_valid_until: fromDate(validUntil),
          p_notes: notes?.trim() ?? null,
          p_terms: terms?.trim() ? terms.trim() : DEFAULT_TERMS,
          p_year_key: yearKey,
        })
        .single<EstimateRow>(),
    );

    const full = await findEstimate(created.id);
    if (!full) throw new AppError('not-found', 'The quotation could not be read back.');
    return full;
  } catch (error) {
    throw toAppError(error);
  }
}

export interface UpdateDraftInput {
  estimate: Estimate;
  validUntil: Date;
  notes?: string | undefined;
  terms?: string | undefined;
  actor: ActorSnapshot;
}

/**
 * Edits a draft.
 *
 * Only the wording and the validity date can change. The priced lines and the
 * totals are the snapshot and are never rewritten - if the price has moved,
 * make a new quotation from the job rather than changing this one.
 */
export async function updateDraftEstimate({
  estimate,
  validUntil,
  notes,
  terms,
  actor,
}: UpdateDraftInput): Promise<void> {
  if (!isEditable(estimate.status)) {
    throw new AppError(
      'conflict',
      `This quotation is ${ESTIMATE_STATUS_LABELS[estimate.status].toLowerCase()}, so its wording can no longer be changed. Create a new one from the job instead.`,
    );
  }

  const trimmedNotes = notes?.trim() ? notes.trim() : undefined;
  const trimmedTerms = terms?.trim() ? terms.trim() : undefined;

  if (isDemoMode()) {
    updateDemoEstimate(estimate.id, {
      validUntil,
      notes: trimmedNotes,
      terms: trimmedTerms,
      updatedBy: actor.uid,
    });
    return;
  }

  try {
    // Cleared wording is stored as NULL rather than an empty string, so reads
    // stay clean. A trigger refuses this entirely once the quotation has been
    // sent, whatever the caller believes about its status.
    const { error } = await getSupabase()
      .from(TABLES.estimates)
      .update({
        valid_until: fromDate(validUntil),
        notes: trimmedNotes ?? null,
        terms: trimmedTerms ?? null,
        updated_by: actor.uid,
      })
      .eq('id', estimate.id);
    if (error) throw error;
  } catch (error) {
    throw toAppError(error);
  }
}

function assertTransition(estimate: Estimate, next: EstimateStatus): void {
  if (!canTransition(estimate.status, next)) {
    throw new AppError(
      'conflict',
      `A ${ESTIMATE_STATUS_LABELS[estimate.status].toLowerCase()} quotation cannot become ${ESTIMATE_STATUS_LABELS[next].toLowerCase()}.`,
    );
  }
}

/** Records that the quotation went to the customer. */
export async function markEstimateSent(estimate: Estimate, actor: ActorSnapshot): Promise<void> {
  assertTransition(estimate, 'sent');
  const sentAt = new Date();

  if (isDemoMode()) {
    updateDemoEstimate(estimate.id, { status: 'sent', sentAt, updatedBy: actor.uid });
    return;
  }

  try {
    const { error } = await getSupabase()
      .from(TABLES.estimates)
      .update({ status: 'sent', sent_at: fromDate(sentAt), updated_by: actor.uid })
      .eq('id', estimate.id);
    if (error) throw error;
  } catch (error) {
    throw toAppError(error);
  }
}

/**
 * Records what the customer decided.
 *
 * Until the customer portal exists, staff enter this on the customer's behalf,
 * so the record keeps who entered it and when, alongside any comment given.
 */
export async function recordEstimateDecision(
  estimate: Estimate,
  outcome: 'approved' | 'rejected',
  note: string | undefined,
  actor: ActorSnapshot,
): Promise<void> {
  assertTransition(estimate, outcome);

  const decision = {
    outcome,
    at: new Date(),
    byId: actor.uid,
    byName: actor.name,
    ...(note?.trim() ? { note: note.trim() } : {}),
  };

  if (isDemoMode()) {
    updateDemoEstimate(estimate.id, { status: outcome, decision, updatedBy: actor.uid });
    return;
  }

  try {
    const { error } = await getSupabase()
      .from(TABLES.estimates)
      .update({
        status: outcome,
        decision_outcome: outcome,
        decision_at: fromDate(decision.at),
        decision_by_id: actor.uid,
        decision_by_name: actor.name,
        decision_note: note?.trim() ? note.trim() : null,
        updated_by: actor.uid,
      })
      .eq('id', estimate.id);
    if (error) throw error;
  } catch (error) {
    throw toAppError(error);
  }
}

/** Marks a quotation cancelled or expired. Records are never deleted. */
export async function closeEstimate(
  estimate: Estimate,
  status: 'cancelled' | 'expired',
  actor: ActorSnapshot,
): Promise<void> {
  assertTransition(estimate, status);
  const cancelledAt = status === 'cancelled' ? new Date() : null;

  if (isDemoMode()) {
    updateDemoEstimate(estimate.id, { status, cancelledAt, updatedBy: actor.uid });
    return;
  }

  try {
    const { error } = await getSupabase()
      .from(TABLES.estimates)
      .update({
        status,
        cancelled_at: fromDate(cancelledAt),
        updated_by: actor.uid,
      })
      .eq('id', estimate.id);
    if (error) throw error;
  } catch (error) {
    throw toAppError(error);
  }
}
