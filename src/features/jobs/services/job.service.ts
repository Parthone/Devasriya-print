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
import type { Job, JobInput } from '@/features/jobs/types';
import {
  JOB_COLUMNS,
  fromAudioAttachment,
  toJob,
  toJobRow,
  type JobRow,
} from '@/features/jobs/services/job.rows';
import { financialYearKey } from '@/lib/financial-year';
import { newId } from '@/lib/ids';
import { getSupabase } from '@/lib/supabase/client';
import { toAppError, unwrap, unwrapMaybe } from '@/lib/supabase/errors';
import { TABLES } from '@/services/base/tables';
import type { AudioAttachment } from '@/types/attachments';
import { type Id } from '@/types/common';

export const JOB_FETCH_CAP = 500;

export interface JobDirectory {
  jobs: Job[];
  capReached: boolean;
  cap: number;
}

export async function listJobs(): Promise<JobDirectory> {
  if (isDemoMode()) return { jobs: demoJobs(), capReached: false, cap: JOB_FETCH_CAP };

  const rows = unwrap(
    await getSupabase()
      .from(TABLES.jobs)
      .select(JOB_COLUMNS)
      .order('job_date', { ascending: false })
      .limit(JOB_FETCH_CAP + 1)
      .returns<JobRow[]>(),
  );

  const capReached = rows.length > JOB_FETCH_CAP;
  if (capReached) {
    console.warn(
      `[jobs] more than ${String(JOB_FETCH_CAP)} jobs exist; the list shows the most recent only.`,
    );
  }

  return { jobs: rows.slice(0, JOB_FETCH_CAP).map(toJob), capReached, cap: JOB_FETCH_CAP };
}

export async function findJob(id: Id): Promise<Job | null> {
  if (isDemoMode()) return demoJob(id);

  const row = unwrapMaybe(
    await getSupabase().from(TABLES.jobs).select(JOB_COLUMNS).eq('id', id).maybeSingle<JobRow>(),
  );
  return row ? toJob(row) : null;
}

/** A new job id, needed before uploading audio to its immutable path. */
export function newJobId(): Id {
  if (isDemoMode()) return `demo-job-pending-${String(Date.now())}`;
  return newId();
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
    const row = unwrap(
      await getSupabase()
        .rpc('create_job', {
          p_payload: {
            id,
            ...toJobRow(input, customer),
            ...fromAudioAttachment(audio),
            enquiry_id: null,
            enquiry_number: null,
            assigned_to_id: null,
            assigned_to_name: null,
          },
          p_year_key: yearKey,
        })
        .single<JobRow>(),
    );
    return toJob(row);
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
    const { error } = await getSupabase()
      .from(TABLES.jobs)
      .update({
        ...toJobRow(input, customer),
        ...(audio === undefined ? {} : fromAudioAttachment(audio)),
        updated_by: actor.uid,
      })
      .eq('id', previous.id);
    if (error) throw error;
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
  if (isDemoMode()) {
    updateDemoJob(jobId, {
      assignedToId: assignee?.id ?? null,
      assignedToName: assignee?.name ?? null,
      updatedBy: actor.uid,
    });
    return;
  }

  try {
    const { error } = await getSupabase()
      .from(TABLES.jobs)
      .update({
        assigned_to_id: assignee?.id ?? null,
        assigned_to_name: assignee?.name ?? null,
        updated_by: actor.uid,
      })
      .eq('id', jobId);
    if (error) throw error;
  } catch (error) {
    throw toAppError(error);
  }
}
