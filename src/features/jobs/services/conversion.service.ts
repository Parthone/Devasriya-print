import { isDemoMode } from '@/config/demo';
import {
  addDemoJob,
  demoEnquiry,
  demoJobs,
  nextDemoNumber,
  updateDemoEnquiry,
  updateDemoJob,
} from '@/features/demo/demo-store';
import type { ActorSnapshot } from '@/features/enquiries/services/enquiry.service';
import type { Enquiry } from '@/features/enquiries/types';
import { EMPTY_PICKUP, type PickupSnapshot } from '@/features/locations/types';
import type { Job, JobPriority, JobStatus } from '@/features/jobs/types';
import { newJobId } from '@/features/jobs/services/job.service';
import { fromAudioAttachment, toJob, type JobRow } from '@/features/jobs/services/job.rows';
import { financialYearKey } from '@/lib/financial-year';
import { getSupabase } from '@/lib/supabase/client';
import { toAppError, unwrap } from '@/lib/supabase/errors';
import { fromDate } from '@/lib/supabase/rows';
import { copyRequirementAudio, discardAudio } from '@/services/storage/audio-storage.service';
import type { AudioAttachment } from '@/types/attachments';
import { AppError } from '@/types/common';

export interface ConvertEnquiryInput {
  enquiry: Enquiry;
  title: string;
  jobDate: Date;
  priority: JobPriority;
  expectedDeliveryDate: Date | null;
  internalNotes?: string | undefined;
  pickup?: PickupSnapshot;
  actor: ActorSnapshot;
}

/**
 * Turns an enquiry into a job.
 *
 * Everything happens in one database transaction: the job number is allocated,
 * the job is written, and the enquiry is stamped as converted. Either all three
 * land or none of them do, so an enquiry can never be marked converted without
 * the job that it points at.
 *
 * A requirement recording is copied to a job-owned storage path first, so that
 * playing it needs only jobs:view and never reaches into enquiry storage. The
 * copy is taken at this moment and lives at an immutable path, so replacing the
 * enquiry recording later cannot change what this job plays. If the transaction
 * then fails, the copy is discarded rather than left orphaned.
 */
export async function convertEnquiryToJob({
  enquiry,
  title,
  jobDate,
  priority,
  expectedDeliveryDate,
  internalNotes,
  pickup = EMPTY_PICKUP,
  actor,
}: ConvertEnquiryInput): Promise<Job> {
  if (enquiry.convertedJobId) {
    throw new AppError(
      'conflict',
      `This enquiry was already converted to job ${enquiry.convertedJobId}.`,
    );
  }

  const yearKey = financialYearKey(jobDate);
  const now = new Date();
  const status: JobStatus = 'open';

  const buildBase = (audio: AudioAttachment | null) => ({
    customerId: enquiry.customerId,
    customerName: enquiry.customerName,
    customerMobile: enquiry.customerMobile,
    enquiryId: enquiry.id,
    enquiryNumber: enquiry.enquiryNumber,
    jobDate,
    title: title.trim(),
    requirementText: enquiry.requirementText,
    // The job owned copy of the recording as it was at conversion time.
    requirementAudio: audio,
    priority,
    expectedDeliveryDate,
    assignedToId: null,
    assignedToName: null,
    status,
    ...pickup,
    ...(internalNotes?.trim() ? { internalNotes: internalNotes.trim() } : {}),
  });

  if (isDemoMode()) {
    const current = demoEnquiry(enquiry.id);
    if (current?.convertedJobId) {
      throw new AppError('conflict', 'This enquiry was already converted to a job.');
    }

    const number = nextDemoNumber(
      'JOB',
      yearKey,
      demoJobs().map((job) => job.jobNumber),
    );
    const job = addDemoJob({
      ...buildBase(null),
      jobNumber: number,
      createdAt: now,
      createdBy: actor.uid,
      updatedAt: now,
      updatedBy: actor.uid,
    });

    // Copied under the job's own id, as production does, so the demo shows the
    // same isolation: the job plays its own object, never the enquiry's.
    if (enquiry.requirementAudio) {
      const demoAudio = await copyRequirementAudio(enquiry.requirementAudio, 'jobs', job.id);
      updateDemoJob(job.id, { requirementAudio: demoAudio });
      job.requirementAudio = demoAudio;
    }
    updateDemoEnquiry(enquiry.id, {
      status: 'converted',
      convertedJobId: job.id,
      convertedAt: now,
      updatedBy: actor.uid,
    });
    return job;
  }

  const jobId = newJobId();

  // Copy the recording into the job bucket before touching the database. If this
  // fails, nothing has been written yet and the enquiry stays exactly as it was.
  const audio: AudioAttachment | null = enquiry.requirementAudio
    ? await copyRequirementAudio(enquiry.requirementAudio, 'jobs', jobId)
    : null;

  const base = buildBase(audio);

  try {
    // The job number, the job row and the stamp on the enquiry all land in one
    // transaction inside the database, and the enquiry is locked while it runs,
    // so two people converting at the same moment cannot both succeed.
    const row = unwrap(
      await getSupabase()
        .rpc('convert_enquiry_to_job', {
          p_enquiry_id: enquiry.id,
          p_payload: {
            id: jobId,
            customer_id: base.customerId,
            customer_name: base.customerName,
            customer_mobile: base.customerMobile,
            job_date: fromDate(base.jobDate),
            title: base.title,
            requirement_text: base.requirementText,
            ...fromAudioAttachment(audio),
            priority: base.priority,
            expected_delivery_date: fromDate(base.expectedDeliveryDate),
            internal_notes: base.internalNotes ?? null,
            pickup_location_id: base.pickupLocationId,
            pickup_location_name: base.pickupLocationName,
            contact_person_id: base.contactPersonId,
            contact_person_name: base.contactPersonName,
            contact_person_mobile: base.contactPersonMobile,
            assigned_to_id: null,
            assigned_to_name: null,
            status: base.status,
          },
          p_year_key: yearKey,
        })
        .single<JobRow>(),
    );

    return toJob(row);
  } catch (error) {
    // The job was never written, so the copy belongs to nothing. Remove it.
    // The enquiry recording itself is untouched either way.
    if (audio) await discardAudio(audio);
    throw toAppError(error);
  }
}
