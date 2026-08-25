import { fromAudioAttachment, toAudioAttachment } from '@/features/enquiries/services/enquiry.rows';
import {
  parseJob,
  type Job,
  type JobInput,
  type JobPriority,
  type JobStatus,
} from '@/features/jobs/types';
import {
  fromDate,
  toAudit,
  toDate,
  toDateOrNull,
  toOptional,
  type AuditRow,
} from '@/lib/supabase/rows';
import type { AudioSource } from '@/types/attachments';
import type { Id } from '@/types/common';

export interface JobRow extends AuditRow {
  id: string;
  job_number: string;
  customer_id: string;
  customer_name: string;
  customer_mobile: string;
  enquiry_id: string | null;
  enquiry_number: string | null;
  job_date: string;
  title: string;
  requirement_text: string;
  requirement_audio_id: string | null;
  requirement_audio_path: string | null;
  requirement_audio_mime: string | null;
  requirement_audio_duration_s: number | null;
  requirement_audio_size_bytes: number | null;
  requirement_audio_recorded_at: string | null;
  requirement_audio_uploaded_by: string | null;
  requirement_audio_source: AudioSource | null;
  priority: JobPriority;
  expected_delivery_date: string | null;
  internal_notes: string | null;
  pickup_location_id: string | null;
  pickup_location_name: string | null;
  contact_person_id: string | null;
  contact_person_name: string | null;
  contact_person_mobile: string | null;
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  status: JobStatus;
}

export const JOB_COLUMNS =
  'id, job_number, customer_id, customer_name, customer_mobile, enquiry_id, enquiry_number,' +
  ' job_date, title, requirement_text, requirement_audio_id, requirement_audio_path,' +
  ' requirement_audio_mime, requirement_audio_duration_s, requirement_audio_size_bytes,' +
  ' requirement_audio_recorded_at, requirement_audio_uploaded_by, requirement_audio_source,' +
  ' priority, expected_delivery_date, internal_notes, pickup_location_id,' +
  ' pickup_location_name, contact_person_id, contact_person_name, contact_person_mobile,' +
  ' assigned_to_id, assigned_to_name, status, created_at, created_by, updated_at, updated_by';

export function toJob(row: JobRow): Job {
  return parseJob(
    {
      id: row.id,
      jobNumber: row.job_number,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerMobile: row.customer_mobile,
      enquiryId: row.enquiry_id,
      enquiryNumber: row.enquiry_number,
      jobDate: toDate(row.job_date),
      title: row.title,
      requirementText: row.requirement_text,
      requirementAudio: toAudioAttachment(row),
      priority: row.priority,
      expectedDeliveryDate: toDateOrNull(row.expected_delivery_date),
      internalNotes: toOptional(row.internal_notes),
      pickupLocationId: row.pickup_location_id,
      pickupLocationName: row.pickup_location_name,
      contactPersonId: row.contact_person_id,
      contactPersonName: row.contact_person_name,
      contactPersonMobile: row.contact_person_mobile,
      assignedToId: row.assigned_to_id,
      assignedToName: row.assigned_to_name,
      status: row.status,
      ...toAudit(row),
    },
    row.id,
  );
}

export { fromAudioAttachment };

/** The editable columns for a job. */
export function toJobRow(input: JobInput, customer: { id: Id; name: string; mobile: string }) {
  return {
    customer_id: customer.id,
    customer_name: customer.name,
    customer_mobile: customer.mobile,
    job_date: fromDate(input.jobDate),
    title: input.title,
    requirement_text: input.requirementText,
    priority: input.priority,
    expected_delivery_date: fromDate(input.expectedDeliveryDate ?? null),
    internal_notes: input.internalNotes ?? null,
    pickup_location_id: input.pickupLocationId,
    pickup_location_name: input.pickupLocationName,
    contact_person_id: input.contactPersonId,
    contact_person_name: input.contactPersonName,
    contact_person_mobile: input.contactPersonMobile,
    status: input.status,
  };
}
