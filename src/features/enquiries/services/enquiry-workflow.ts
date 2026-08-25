import {
  createEnquiry,
  newEnquiryId,
  updateEnquiry,
  type ActorSnapshot,
  type CustomerSnapshot,
} from '@/features/enquiries/services/enquiry.service';
import type { Enquiry, EnquiryInput } from '@/features/enquiries/types';
import type { LocalRecording } from '@/lib/audio/use-audio-recorder';
import {
  deleteSupersededAudio,
  uploadRequirementAudio,
} from '@/services/storage/audio-storage.service';
import type { AudioAttachment } from '@/types/attachments';

/** What the form says should happen to the recording. */
export type RecordingChange =
  { type: 'keep' } | { type: 'remove' } | { type: 'replace'; recording: LocalRecording };

export interface CreateEnquiryWorkflowInput {
  input: EnquiryInput;
  customer: CustomerSnapshot;
  recording: LocalRecording | null;
  actor: ActorSnapshot;
}

/**
 * Creates an enquiry, uploading the requirement recording first.
 *
 * The id is generated up front so the audio can be written to its final,
 * immutable path, and the document is only written once the upload succeeded -
 * a record never points at a file that is not there.
 */
export async function createEnquiryWithAudio({
  input,
  customer,
  recording,
  actor,
}: CreateEnquiryWorkflowInput): Promise<Enquiry> {
  const id = newEnquiryId();

  const audio: AudioAttachment | null = recording
    ? await uploadRequirementAudio({
        owner: 'enquiries',
        ownerId: id,
        recording,
        uploadedById: actor.uid,
      })
    : null;

  return createEnquiry({ id, input, customer, audio, actor });
}

export interface UpdateEnquiryWorkflowInput {
  previous: Enquiry;
  input: EnquiryInput;
  customer: CustomerSnapshot;
  change: RecordingChange;
  actor: ActorSnapshot;
}

/**
 * Edits an enquiry, replacing the recording when asked.
 *
 * Replacement writes a new file at a new path and only then updates the
 * document. The previous file is removed afterwards, and only when nothing else
 * can still be pointing at it: once an enquiry has been converted, its job
 * references that exact recording, so the old file stays.
 */
export async function updateEnquiryWithAudio({
  previous,
  input,
  customer,
  change,
  actor,
}: UpdateEnquiryWorkflowInput): Promise<void> {
  let audio: AudioAttachment | null | undefined;

  if (change.type === 'remove') {
    audio = null;
  } else if (change.type === 'replace') {
    audio = await uploadRequirementAudio({
      owner: 'enquiries',
      ownerId: previous.id,
      recording: change.recording,
      uploadedById: actor.uid,
    });
  }

  await updateEnquiry({ previous, input, customer, audio, actor });

  const superseded = previous.requirementAudio;
  if (superseded && audio !== undefined && audio?.id !== superseded.id) {
    const referencedByJob = Boolean(previous.convertedJobId);
    await deleteSupersededAudio(superseded, referencedByJob);
  }
}
