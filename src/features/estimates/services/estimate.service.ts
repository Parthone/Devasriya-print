import { deleteField, doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';

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
  parseEstimate,
  type Estimate,
  type EstimateStatus,
} from '@/features/estimates/types';
import type { JobPricingDocument } from '@/features/jobs/pricing-types';
import type { Job } from '@/features/jobs/types';
import { financialYearKey } from '@/lib/financial-year';
import { getDb } from '@/lib/firebase/client';
import { toAppError } from '@/lib/firebase/errors';
import { COLLECTIONS } from '@/services/base/collections';
import { allocateNumberInTransaction } from '@/services/base/counters';
import { FirestoreRepository, orderBy } from '@/services/base/repository';
import { AppError, type Id } from '@/types/common';

export const estimateRepository = new FirestoreRepository<Estimate>(
  COLLECTIONS.estimates,
  parseEstimate,
);

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

  const page = await estimateRepository.list({
    constraints: [orderBy('estimateDate', 'desc')],
    pageSize: ESTIMATE_FETCH_CAP,
  });

  if (page.hasMore) {
    console.warn(
      `[estimates] more than ${String(ESTIMATE_FETCH_CAP)} estimates exist; showing the most recent.`,
    );
  }

  return { estimates: page.items, capReached: page.hasMore, cap: ESTIMATE_FETCH_CAP };
}

export async function findEstimate(id: Id): Promise<Estimate | null> {
  if (isDemoMode()) return demoEstimate(id);
  return estimateRepository.findById(id);
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
    const id = estimateRepository.newId();
    const estimateNumber = await runTransaction(getDb(), async (transaction) => {
      const number = await allocateNumberInTransaction(transaction, 'estimates', yearKey);
      transaction.set(doc(getDb(), COLLECTIONS.estimates, id), {
        ...base,
        estimateNumber: number,
        createdAt: serverTimestamp(),
        createdBy: actor.uid,
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
      });
      return number;
    });

    return {
      ...base,
      id,
      estimateNumber,
      createdAt: now,
      createdBy: actor.uid,
      updatedAt: now,
      updatedBy: actor.uid,
    };
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
    // Cleared wording is removed rather than stored as null - the stored shape
    // stays exactly what the parser expects to read back.
    await updateDoc(doc(getDb(), COLLECTIONS.estimates, estimate.id), {
      validUntil,
      notes: trimmedNotes ?? deleteField(),
      terms: trimmedTerms ?? deleteField(),
      updatedAt: serverTimestamp(),
      updatedBy: actor.uid,
    });
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
    await updateDoc(doc(getDb(), COLLECTIONS.estimates, estimate.id), {
      status: 'sent',
      sentAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: actor.uid,
    });
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
    await updateDoc(doc(getDb(), COLLECTIONS.estimates, estimate.id), {
      status: outcome,
      decision: { ...decision, at: serverTimestamp() },
      updatedAt: serverTimestamp(),
      updatedBy: actor.uid,
    });
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
    await updateDoc(doc(getDb(), COLLECTIONS.estimates, estimate.id), {
      status,
      cancelledAt: status === 'cancelled' ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
      updatedBy: actor.uid,
    });
  } catch (error) {
    throw toAppError(error);
  }
}
