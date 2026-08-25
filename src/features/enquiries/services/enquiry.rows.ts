import {
  parseEnquiry,
  type Enquiry,
  type EnquiryInput,
  type EnquirySource,
  type EnquiryStatus,
  type FollowUpEntry,
} from '@/features/enquiries/types';
import {
  fromDate,
  toAudit,
  toDate,
  toDateOrNull,
  toOptional,
  type AuditRow,
} from '@/lib/supabase/rows';
import type { AudioAttachment, AudioSource } from '@/types/attachments';
import type { Id } from '@/types/common';

interface FollowUpRow {
  id: string;
  at: string;
  by_id: string;
  by_name: string;
  note: string;
}

export interface EnquiryRow extends AuditRow {
  id: string;
  enquiry_number: string;
  customer_id: string;
  customer_name: string;
  customer_mobile: string;
  enquiry_date: string;
  source: EnquirySource;
  requirement_text: string;
  requirement_audio_id: string | null;
  requirement_audio_path: string | null;
  requirement_audio_mime: string | null;
  requirement_audio_duration_s: number | null;
  requirement_audio_size_bytes: number | null;
  requirement_audio_recorded_at: string | null;
  requirement_audio_uploaded_by: string | null;
  requirement_audio_source: AudioSource | null;
  notes: string | null;
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  next_follow_up_at: string | null;
  status: EnquiryStatus;
  lost_reason: string | null;
  converted_job_id: string | null;
  converted_at: string | null;
  enquiry_follow_ups?: FollowUpRow[];
}

export const ENQUIRY_COLUMNS =
  'id, enquiry_number, customer_id, customer_name, customer_mobile, enquiry_date, source,' +
  ' requirement_text, requirement_audio_id, requirement_audio_path, requirement_audio_mime,' +
  ' requirement_audio_duration_s, requirement_audio_size_bytes, requirement_audio_recorded_at,' +
  ' requirement_audio_uploaded_by, requirement_audio_source, notes, assigned_to_id,' +
  ' assigned_to_name, next_follow_up_at, status, lost_reason, converted_job_id, converted_at,' +
  ' created_at, created_by, updated_at, updated_by,' +
  ' enquiry_follow_ups(id, at, by_id, by_name, note)';

/**
 * The recording columns as one attachment, or null.
 *
 * No download URL is ever stored: `storagePath` is what the record keeps, and a
 * signed URL is minted when somebody presses play.
 */
export function toAudioAttachment(row: {
  requirement_audio_id: string | null;
  requirement_audio_path: string | null;
  requirement_audio_mime: string | null;
  requirement_audio_duration_s: number | null;
  requirement_audio_size_bytes: number | null;
  requirement_audio_recorded_at: string | null;
  requirement_audio_uploaded_by: string | null;
  requirement_audio_source: AudioSource | null;
}): AudioAttachment | null {
  if (!row.requirement_audio_id || !row.requirement_audio_path) return null;
  return {
    id: row.requirement_audio_id,
    storagePath: row.requirement_audio_path,
    mimeType: row.requirement_audio_mime ?? 'audio/webm',
    durationSeconds: row.requirement_audio_duration_s ?? 0,
    sizeBytes: row.requirement_audio_size_bytes ?? 0,
    recordedAt: toDate(row.requirement_audio_recorded_at),
    uploadedById: row.requirement_audio_uploaded_by ?? '',
    source: row.requirement_audio_source ?? 'staff',
  };
}

/** The recording as the eight columns a record stores it in. */
export function fromAudioAttachment(audio: AudioAttachment | null) {
  return {
    requirement_audio_id: audio?.id ?? null,
    requirement_audio_path: audio?.storagePath ?? null,
    requirement_audio_mime: audio?.mimeType ?? null,
    requirement_audio_duration_s: audio?.durationSeconds ?? null,
    requirement_audio_size_bytes: audio?.sizeBytes ?? null,
    requirement_audio_recorded_at: audio ? fromDate(audio.recordedAt) : null,
    requirement_audio_uploaded_by: audio?.uploadedById ?? null,
    requirement_audio_source: audio?.source ?? null,
  };
}

function toFollowUps(rows: FollowUpRow[] | undefined): FollowUpEntry[] {
  return (rows ?? [])
    .map((row) => ({
      at: toDate(row.at),
      byId: row.by_id,
      byName: row.by_name,
      note: row.note,
    }))
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

export function toEnquiry(row: EnquiryRow): Enquiry {
  return parseEnquiry(
    {
      id: row.id,
      enquiryNumber: row.enquiry_number,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerMobile: row.customer_mobile,
      enquiryDate: toDate(row.enquiry_date),
      source: row.source,
      requirementText: row.requirement_text,
      requirementAudio: toAudioAttachment(row),
      notes: toOptional(row.notes),
      assignedToId: row.assigned_to_id,
      assignedToName: row.assigned_to_name,
      nextFollowUpAt: toDateOrNull(row.next_follow_up_at),
      followUps: toFollowUps(row.enquiry_follow_ups),
      status: row.status,
      lostReason: toOptional(row.lost_reason),
      convertedJobId: row.converted_job_id,
      convertedAt: toDateOrNull(row.converted_at),
      ...toAudit(row),
    },
    row.id,
  );
}

/** The editable columns for an enquiry. */
export function toEnquiryRow(
  input: EnquiryInput,
  customer: { id: Id; name: string; mobile: string },
) {
  return {
    customer_id: customer.id,
    customer_name: customer.name,
    customer_mobile: customer.mobile,
    enquiry_date: fromDate(input.enquiryDate),
    source: input.source,
    requirement_text: input.requirementText,
    notes: input.notes ?? null,
    next_follow_up_at: fromDate(input.nextFollowUpAt ?? null),
    status: input.status,
    lost_reason: input.lostReason ?? null,
  };
}
