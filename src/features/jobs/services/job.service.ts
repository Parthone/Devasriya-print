import { doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';

import { isDemoMode } from '@/config/demo';
import {
  addDemoJob,
  demoJob,
  demoJobs,
  nextDemoNumber,
  updateDemoJob,
} from '@/features/demo/demo-store';
import type {
  ActorSnapshot,
  CustomerSnapshot,
} from '@/features/enquiries/services/enquiry.service';
import { parseJob, type Job, type JobInput } from '@/features/jobs/types';
import { financialYearKey } from '@/lib/financial-year';
import { getDb } from '@/lib/firebase/client';
import { toAppError } from '@/lib/firebase/errors';
import { COLLECTIONS } from '@/services/base/collections';
import { allocateNumberInTransaction } from '@/services/base/counters';
import { FirestoreRepository, orderBy } from '@/services/base/repository';
import type { AudioAttachment } from '@/types/attachments';
import { type Id } from '@/types/common';

export const jobRepository = new FirestoreRepository<Job>(COLLECTIONS.jobs, parseJob);

export const JOB_FETCH_CAP = 500;

export interface JobDirectory {
  jobs: Job[];
  capReached: boolean;
  cap: number;
}

export async function listJobs(): Promise<JobDirectory> {
  if (isDemoMode()) return { jobs: demoJobs(), capReached: false, cap: JOB_FETCH_CAP };

  const page = await jobRepository.list({
    constraints: [orderBy('jobDate', 'desc')],
    pageSize: JOB_FETCH_CAP,
  });

  if (page.hasMore) {
    console.warn(
      `[jobs] more than ${String(JOB_FETCH_CAP)} jobs exist; the list shows the most recent only.`,
    );
  }

  return { jobs: page.items, capReached: page.hasMore, cap: JOB_FETCH_CAP };
}

export async function findJob(id: Id): Promise<Job | null> {
  if (isDemoMode()) return demoJob(id);
  return jobRepository.findById(id);
}

/** A new job id, needed before uploading audio to its immutable path. */
export function newJobId(): Id {
  if (isDemoMode()) return `demo-job-pending-${String(Date.now())}`;
  return jobRepository.newId();
}

export interface CreateJobInput {
  id: Id;
  input: JobInput;
  customer: CustomerSnapshot;
  audio: AudioAttachment | null;
  actor: ActorSnapshot;
}

/** Creates a job directly, without an enquiry - a walk-in repeat order. */
export async function createJob({
  id,
  input,
  customer,
  audio,
  actor,
}: CreateJobInput): Promise<Job> {
  const yearKey = financialYearKey(input.jobDate);
  const now = new Date();

  const base = {
    ...input,
    customerId: customer.id,
    customerName: customer.name,
    customerMobile: customer.mobile,
    enquiryId: null,
    enquiryNumber: null,
    requirementAudio: audio,
    assignedToId: null,
    assignedToName: null,
  };

  if (isDemoMode()) {
    const number = nextDemoNumber(
      'JOB',
      yearKey,
      demoJobs().map((job) => job.jobNumber),
    );
    return addDemoJob({
      ...base,
      jobNumber: number,
      createdAt: now,
      createdBy: actor.uid,
      updatedAt: now,
      updatedBy: actor.uid,
    });
  }

  try {
    const jobNumber = await runTransaction(getDb(), async (transaction) => {
      const number = await allocateNumberInTransaction(transaction, 'jobs', yearKey);
      transaction.set(doc(getDb(), COLLECTIONS.jobs, id), {
        ...base,
        jobNumber: number,
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
      jobNumber,
      createdAt: now,
      createdBy: actor.uid,
      updatedAt: now,
      updatedBy: actor.uid,
    };
  } catch (error) {
    throw toAppError(error);
  }
}

export interface UpdateJobInput {
  previous: Job;
  input: JobInput;
  customer: CustomerSnapshot;
  audio?: AudioAttachment | null | undefined;
  actor: ActorSnapshot;
}

export async function updateJob({
  previous,
  input,
  customer,
  audio,
  actor,
}: UpdateJobInput): Promise<void> {
  const changes = {
    ...input,
    customerId: customer.id,
    customerName: customer.name,
    customerMobile: customer.mobile,
    internalNotes: input.internalNotes ?? null,
    ...(audio === undefined ? {} : { requirementAudio: audio }),
  };

  if (isDemoMode()) {
    updateDemoJob(previous.id, {
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
    await updateDoc(doc(getDb(), COLLECTIONS.jobs, previous.id), {
      ...changes,
      updatedAt: serverTimestamp(),
      updatedBy: actor.uid,
    });
  } catch (error) {
    throw toAppError(error);
  }
}

/** Assigning work needs jobs:assign, which is owner and admin only. */
export async function assignJob(
  jobId: Id,
  assignee: { id: Id; name: string } | null,
  actor: ActorSnapshot,
): Promise<void> {
  const changes = {
    assignedToId: assignee?.id ?? null,
    assignedToName: assignee?.name ?? null,
  };

  if (isDemoMode()) {
    updateDemoJob(jobId, { ...changes, updatedBy: actor.uid });
    return;
  }

  try {
    await updateDoc(doc(getDb(), COLLECTIONS.jobs, jobId), {
      ...changes,
      updatedAt: serverTimestamp(),
      updatedBy: actor.uid,
    });
  } catch (error) {
    throw toAppError(error);
  }
}
