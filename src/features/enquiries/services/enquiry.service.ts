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
  type Enquiry,
  type EnquiryInput,
  type FollowUpEntry,
} from '@/features/enquiries/types';
import {
  ENQUIRY_COLUMNS,
  fromAudioAttachment,
  toEnquiry,
  toEnquiryRow,
  type EnquiryRow,
} from '@/features/enquiries/services/enquiry.rows';
import { financialYearKey } from '@/lib/financial-year';
import { newId } from '@/lib/ids';
import { getSupabase } from '@/lib/supabase/client';
import { toAppError, unwrap, unwrapMaybe } from '@/lib/supabase/errors';
import { fromDate } from '@/lib/supabase/rows';
import { TABLES } from '@/services/base/tables';
import type { AudioAttachment } from '@/types/attachments';
import { AppError, type Id } from '@/types/common';

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

  const rows = unwrap(
    await getSupabase()
      .from(TABLES.enquiries)
      .select(ENQUIRY_COLUMNS)
      .order('enquiry_date', { ascending: false })
      .limit(ENQUIRY_FETCH_CAP + 1)
      .returns<EnquiryRow[]>(),
  );

  const capReached = rows.length > ENQUIRY_FETCH_CAP;
  if (capReached) {
    console.warn(
      `[enquiries] more than ${String(ENQUIRY_FETCH_CAP)} enquiries exist; the list shows the most recent only.`,
    );
  }

  return {
    enquiries: rows.slice(0, ENQUIRY_FETCH_CAP).map(toEnquiry),
    capReached,
    cap: ENQUIRY_FETCH_CAP,
  };
}

export async function findEnquiry(id: Id): Promise<Enquiry | null> {
  if (isDemoMode()) return demoEnquiry(id);

  const row = unwrapMaybe(
    await getSupabase()
      .from(TABLES.enquiries)
      .select(ENQUIRY_COLUMNS)
      .eq('id', id)
      .maybeSingle<EnquiryRow>(),
  );
  return row ? toEnquiry(row) : null;
}

/** A new enquiry id, needed before uploading audio to its immutable path. */
export function newEnquiryId(): Id {
  if (isDemoMode()) return `demo-enquiry-pending-${String(Date.now())}`;
  return newId();
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
    // The number is allocated and the row written in one transaction, inside
    // the database, so two people taking an enquiry at the same moment cannot
    // be handed the same ENQ number.
    const row = unwrap(
      await getSupabase()
        .rpc('create_enquiry', {
          p_payload: {
            id,
            ...toEnquiryRow(input, customer),
            ...fromAudioAttachment(audio),
            assigned_to_id: null,
            assigned_to_name: null,
            converted_job_id: null,
            converted_at: null,
          },
          p_year_key: yearKey,
        })
        .single<EnquiryRow>(),
    );
    return toEnquiry({ ...row, enquiry_follow_ups: [] });
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
    const { error } = await getSupabase()
      .from(TABLES.enquiries)
      .update({
        ...toEnquiryRow(input, customer),
        ...(audio === undefined ? {} : fromAudioAttachment(audio)),
        updated_by: actor.uid,
      })
      .eq('id', previous.id);
    if (error) throw error;
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
    // The note and the status move land together: an enquiry that says
    // "contacted" with no record of the contact is worse than either half.
    const { error } = await getSupabase().rpc('add_enquiry_follow_up', {
      p_enquiry_id: enquiry.id,
      p_note: entry.note,
      p_by_name: actor.name,
      p_status: status,
      p_next_follow_up_at: fromDate(nextFollowUpAt),
    });
    if (error) throw error;
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
  if (isDemoMode()) {
    updateDemoEnquiry(enquiryId, {
      assignedToId: assignee?.id ?? null,
      assignedToName: assignee?.name ?? null,
      updatedBy: actor.uid,
    });
    return;
  }

  try {
    const { error } = await getSupabase()
      .from(TABLES.enquiries)
      .update({
        assigned_to_id: assignee?.id ?? null,
        assigned_to_name: assignee?.name ?? null,
        updated_by: actor.uid,
      })
      .eq('id', enquiryId);
    if (error) throw error;
  } catch (error) {
    throw toAppError(error);
  }
}
