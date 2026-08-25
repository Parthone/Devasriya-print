import type {
  ActorSnapshot,
  CustomerSnapshot,
} from '@/features/enquiries/services/enquiry.service';
import type { RecordingChange } from '@/features/enquiries/services/enquiry-workflow';
import { createJob, newJobId, updateJob } from '@/features/jobs/services/job.service';
import type { Job, JobInput } from '@/features/jobs/types';
import type { LocalRecording } from '@/lib/audio/use-audio-recorder';
import {
  deleteSupersededAudio,
  uploadRequirementAudio,
} from '@/services/storage/audio-storage.service';
import type { AudioAttachment } from '@/types/attachments';

export interface CreateJobWorkflowInput {
  input: JobInput;
  customer: CustomerSnapshot;
  recording: LocalRecording | null;
  actor: ActorSnapshot;
}

/** Direct job creation, with an optional requirement recording of its own. */
export async function createJobWithAudio({
  input,
  customer,
  recording,
  actor,
}: CreateJobWorkflowInput): Promise<Job> {
  const id = newJobId();

  const audio: AudioAttachment | null = recording
    ? await uploadRequirementAudio({
        owner: 'jobs',
        ownerId: id,
        recording,
        uploadedById: actor.uid,
      })
    : null;

  return createJob({ id, input, customer, audio, actor });
}

export interface UpdateJobWorkflowInput {
  previous: Job;
  input: JobInput;
  customer: CustomerSnapshot;
  change: RecordingChange;
  actor: ActorSnapshot;
}

export async function updateJobWithAudio({
  previous,
  input,
  customer,
  change,
  actor,
}: UpdateJobWorkflowInput): Promise<void> {
  let audio: AudioAttachment | null | undefined;

  if (change.type === 'remove') {
    audio = null;
  } else if (change.type === 'replace') {
    audio = await uploadRequirementAudio({
      owner: 'jobs',
      ownerId: previous.id,
      recording: change.recording,
      uploadedById: actor.uid,
    });
  }

  await updateJob({ previous, input, customer, audio, actor });

  const superseded = previous.requirementAudio;
  if (superseded && audio !== undefined && audio?.id !== superseded.id) {
    // Conversion copies the recording to a job owned path, so anything under
    // `jobs/` belongs to this job and may go. A path under `enquiries/` would
    // belong to an enquiry and is never touched from here.
    const ownedByEnquiry = superseded.storagePath.startsWith('enquiries/');
    await deleteSupersededAudio(superseded, ownedByEnquiry);
  }
}
