import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';

import { isDemoMode } from '@/config/demo';
import {
  addDemoJob,
  demoEnquiry,
  demoJobs,
  nextDemoNumber,
  updateDemoEnquiry,
} from '@/features/demo/demo-store';
import type { ActorSnapshot } from '@/features/enquiries/services/enquiry.service';
import type { Enquiry } from '@/features/enquiries/types';
import { EMPTY_PICKUP, type PickupSnapshot } from '@/features/locations/types';
import type { Job, JobPriority, JobStatus } from '@/features/jobs/types';
import { newJobId } from '@/features/jobs/services/job.service';
import { financialYearKey } from '@/lib/financial-year';
import { getDb } from '@/lib/firebase/client';
import { toAppError } from '@/lib/firebase/errors';
import { COLLECTIONS } from '@/services/base/collections';
import { allocateNumberInTransaction } from '@/services/base/counters';
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
 * Everything happens in one Firestore transaction: the job number is allocated,
 * the job is written, and the enquiry is stamped as converted. Either all three
 * land or none of them do, so an enquiry can never be marked converted without
 * the job that it points at.
 *
 * A requirement recording is copied to a job-owned storage path first, so that
 * playing it needs only jobs:view and never reaches into enquiry storage. The
 * copy is taken at this moment and lives at an immutable path, so replacing the
 * enquiry recording later cannot change what this job plays. If the Firestore
 * transaction then fails, the copy is discarded rather than left orphaned.
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
    const demoAudio = enquiry.requirementAudio
      ? await copyRequirementAudio(enquiry.requirementAudio, 'jobs', `demo-job-${number}`)
      : null;

    const job = addDemoJob({
      ...buildBase(demoAudio),
      jobNumber: number,
      createdAt: now,
      createdBy: actor.uid,
      updatedAt: now,
      updatedBy: actor.uid,
    });
    updateDemoEnquiry(enquiry.id, {
      status: 'converted',
      convertedJobId: job.id,
      convertedAt: now,
      updatedBy: actor.uid,
    });
    return job;
  }

  const jobId = newJobId();

  // Copy the recording to a job owned path before touching Firestore. If this
  // fails, nothing has been written yet and the enquiry stays exactly as it was.
  const audio: AudioAttachment | null = enquiry.requirementAudio
    ? await copyRequirementAudio(enquiry.requirementAudio, 'jobs', jobId)
    : null;

  const base = buildBase(audio);

  try {
    const jobNumber = await runTransaction(getDb(), async (transaction) => {
      const enquiryRef = doc(getDb(), COLLECTIONS.enquiries, enquiry.id);
      const snapshot = await transaction.get(enquiryRef);

      if (!snapshot.exists()) {
        throw new AppError('not-found', 'This enquiry no longer exists.');
      }
      // Re-checked inside the transaction: two people converting at the same
      // moment cannot both succeed.
      if (snapshot.data().convertedJobId) {
        throw new AppError('conflict', 'This enquiry was already converted to a job.');
      }

      const number = await allocateNumberInTransaction(transaction, 'jobs', yearKey);

      transaction.set(doc(getDb(), COLLECTIONS.jobs, jobId), {
        ...base,
        jobNumber: number,
        createdAt: serverTimestamp(),
        createdBy: actor.uid,
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
      });

      transaction.update(enquiryRef, {
        status: 'converted',
        convertedJobId: jobId,
        convertedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
      });

      return number;
    });

    return {
      ...base,
      id: jobId,
      jobNumber,
      createdAt: now,
      createdBy: actor.uid,
      updatedAt: now,
      updatedBy: actor.uid,
    };
  } catch (error) {
    // The job was never written, so the copy belongs to nothing. Remove it.
    // The enquiry recording itself is untouched either way.
    if (audio) await discardAudio(audio);
    throw toAppError(error);
  }
}
