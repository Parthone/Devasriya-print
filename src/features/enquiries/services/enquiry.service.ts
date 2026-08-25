import { doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';

import { isDemoMode } from '@/config/demo';
import {
  addDemoEnquiry,
  demoEnquiries,
  demoEnquiry,
  nextDemoNumber,
  updateDemoEnquiry,
} from '@/features/demo/demo-store';
import {
  MAX_FOLLOW_UPS,
  parseEnquiry,
  type Enquiry,
  type EnquiryInput,
  type FollowUpEntry,
} from '@/features/enquiries/types';
import { financialYearKey } from '@/lib/financial-year';
import { getDb } from '@/lib/firebase/client';
import { toAppError } from '@/lib/firebase/errors';
import { allocateNumberInTransaction } from '@/services/base/counters';
import { COLLECTIONS } from '@/services/base/collections';
import { FirestoreRepository, orderBy } from '@/services/base/repository';
import type { AudioAttachment } from '@/types/attachments';
import { AppError, type Id } from '@/types/common';

export const enquiryRepository = new FirestoreRepository<Enquiry>(
  COLLECTIONS.enquiries,
  parseEnquiry,
);

/** Same approach as the customer directory: one capped fetch, then filter here. */
export const ENQUIRY_FETCH_CAP = 500;

export interface EnquiryDirectory {
  enquiries: Enquiry[];
  capReached: boolean;
  cap: number;
}

export interface CustomerSnapshot {
  id: Id;
  name: string;
  mobile: string;
}

export interface ActorSnapshot {
  uid: Id;
  name: string;
}

export async function listEnquiries(): Promise<EnquiryDirectory> {
  if (isDemoMode()) {
    return { enquiries: demoEnquiries(), capReached: false, cap: ENQUIRY_FETCH_CAP };
  }

  const page = await enquiryRepository.list({
    constraints: [orderBy('enquiryDate', 'desc')],
    pageSize: ENQUIRY_FETCH_CAP,
  });

  if (page.hasMore) {
    console.warn(
      `[enquiries] more than ${String(ENQUIRY_FETCH_CAP)} enquiries exist; the list shows the most recent only.`,
    );
  }

  return { enquiries: page.items, capReached: page.hasMore, cap: ENQUIRY_FETCH_CAP };
}

export async function findEnquiry(id: Id): Promise<Enquiry | null> {
  if (isDemoMode()) return demoEnquiry(id);
  return enquiryRepository.findById(id);
}

/** A new enquiry id, needed before uploading audio to its immutable path. */
export function newEnquiryId(): Id {
  if (isDemoMode()) return `demo-enquiry-pending-${String(Date.now())}`;
  return enquiryRepository.newId();
}

export interface CreateEnquiryInput {
  id: Id;
  input: EnquiryInput;
  customer: CustomerSnapshot;
  audio: AudioAttachment | null;
  actor: ActorSnapshot;
}

export async function createEnquiry({
  id,
  input,
  customer,
  audio,
  actor,
}: CreateEnquiryInput): Promise<Enquiry> {
  const yearKey = financialYearKey(input.enquiryDate);
  const now = new Date();

  const base = {
    ...input,
    customerId: customer.id,
    customerName: customer.name,
    customerMobile: customer.mobile,
    requirementAudio: audio,
    assignedToId: null,
    assignedToName: null,
    followUps: [] as FollowUpEntry[],
    convertedJobId: null,
    convertedAt: null,
  };

  if (isDemoMode()) {
    const number = nextDemoNumber(
      'ENQ',
      yearKey,
      demoEnquiries().map((enquiry) => enquiry.enquiryNumber),
    );
    return addDemoEnquiry({
      ...base,
      enquiryNumber: number,
      createdAt: now,
      createdBy: actor.uid,
      updatedAt: now,
      updatedBy: actor.uid,
    });
  }

  try {
    const enquiryNumber = await runTransaction(getDb(), async (transaction) => {
      const number = await allocateNumberInTransaction(transaction, 'enquiries', yearKey);
      transaction.set(doc(getDb(), COLLECTIONS.enquiries, id), {
        ...base,
        enquiryNumber: number,
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
      enquiryNumber,
      createdAt: now,
      createdBy: actor.uid,
      updatedAt: now,
      updatedBy: actor.uid,
    };
  } catch (error) {
    throw toAppError(error);
  }
}

export interface UpdateEnquiryInput {
  previous: Enquiry;
  input: EnquiryInput;
  customer: CustomerSnapshot;
  /** Present only when the recording was replaced or removed. */
  audio?: AudioAttachment | null | undefined;
  actor: ActorSnapshot;
}

/**
 * Edits an enquiry.
 *
 * A converted enquiry keeps its status: the job it produced is the live record
 * from then on. The security rules enforce the same thing.
 */
export async function updateEnquiry({
  previous,
  input,
  customer,
  audio,
  actor,
}: UpdateEnquiryInput): Promise<void> {
  if (previous.convertedJobId && input.status !== previous.status) {
    throw new AppError(
      'conflict',
      'This enquiry has already been converted to a job, so its status cannot be changed.',
    );
  }
  if (input.status === 'converted' && !previous.convertedJobId) {
    throw new AppError('invalid-input', 'Use "Convert to job" to mark an enquiry converted.');
  }

  const changes = {
    ...input,
    customerId: customer.id,
    customerName: customer.name,
    customerMobile: customer.mobile,
    notes: input.notes ?? null,
    lostReason: input.lostReason ?? null,
    ...(audio === undefined ? {} : { requirementAudio: audio }),
  };

  if (isDemoMode()) {
    updateDemoEnquiry(previous.id, {
      ...input,
      customerId: customer.id,
      customerName: customer.name,
      customerMobile: customer.mobile,
      ...(audio === undefined ? {} : { requirementAudio: audio }),
      updatedBy: actor.uid,
    });
    return;
  }

  try {
    await updateDoc(doc(getDb(), COLLECTIONS.enquiries, previous.id), {
      ...changes,
      updatedAt: serverTimestamp(),
      updatedBy: actor.uid,
    });
  } catch (error) {
    throw toAppError(error);
  }
}

/** Adds a follow-up note, newest first, keeping the most recent entries only. */
export async function addFollowUp(
  enquiry: Enquiry,
  note: string,
  nextFollowUpAt: Date | null,
  actor: ActorSnapshot,
): Promise<void> {
  const entry: FollowUpEntry = {
    at: new Date(),
    byId: actor.uid,
    byName: actor.name,
    note: note.trim(),
  };
  const followUps = [entry, ...enquiry.followUps].slice(0, MAX_FOLLOW_UPS);
  const status = enquiry.status === 'new' ? 'contacted' : enquiry.status;

  if (isDemoMode()) {
    updateDemoEnquiry(enquiry.id, { followUps, nextFollowUpAt, status, updatedBy: actor.uid });
    return;
  }

  try {
    await updateDoc(doc(getDb(), COLLECTIONS.enquiries, enquiry.id), {
      followUps,
      nextFollowUpAt,
      status,
      updatedAt: serverTimestamp(),
      updatedBy: actor.uid,
    });
  } catch (error) {
    throw toAppError(error);
  }
}

/** Assignment is offered only to roles that may already see the staff list. */
export async function assignEnquiry(
  enquiryId: Id,
  assignee: { id: Id; name: string } | null,
  actor: ActorSnapshot,
): Promise<void> {
  const changes = {
    assignedToId: assignee?.id ?? null,
    assignedToName: assignee?.name ?? null,
  };

  if (isDemoMode()) {
    updateDemoEnquiry(enquiryId, { ...changes, updatedBy: actor.uid });
    return;
  }

  try {
    await updateDoc(doc(getDb(), COLLECTIONS.enquiries, enquiryId), {
      ...changes,
      updatedAt: serverTimestamp(),
      updatedBy: actor.uid,
    });
  } catch (error) {
    throw toAppError(error);
  }
}
