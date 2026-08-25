import { deleteObject, getBytes, getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { isDemoMode } from '@/config/demo';
import { demoAudioUrl, rememberDemoAudio } from '@/features/demo/demo-store';
import { extensionForMimeType } from '@/lib/audio/recording';
import type { LocalRecording } from '@/lib/audio/use-audio-recorder';
import { getFirebaseStorage } from '@/lib/firebase/client';
import { toAppError } from '@/lib/firebase/errors';
import type { AudioAttachment, AudioSource } from '@/types/attachments';
import { type Id } from '@/types/common';

/** Which kind of record the recording belongs to. Mirrored in storage.rules. */
export type RequirementOwner = 'enquiries' | 'jobs';

function newAttachmentId(): Id {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `att-${String(Date.now())}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Immutable path for one recording.
 *
 * The attachment id is part of the path, so replacing a recording writes a new
 * object instead of overwriting the old one. A job converted from an enquiry
 * therefore keeps playing the exact audio that existed at conversion time.
 */
export function buildAudioPath(
  owner: RequirementOwner,
  ownerId: Id,
  attachmentId: Id,
  mimeType: string,
): string {
  return `${owner}/${ownerId}/requirement/${attachmentId}.${extensionForMimeType(mimeType)}`;
}

export interface UploadRequirementAudioInput {
  owner: RequirementOwner;
  ownerId: Id;
  recording: LocalRecording;
  uploadedById: Id;
  source?: AudioSource;
}

/**
 * Uploads a recording and returns the metadata to store on the record.
 *
 * The caller writes the metadata only after this resolves, so a failed upload
 * never leaves a record pointing at a file that does not exist.
 */
export async function uploadRequirementAudio({
  owner,
  ownerId,
  recording,
  uploadedById,
  source = 'staff',
}: UploadRequirementAudioInput): Promise<AudioAttachment> {
  const id = newAttachmentId();
  const storagePath = buildAudioPath(owner, ownerId, id, recording.mimeType);

  const attachment: AudioAttachment = {
    id,
    storagePath,
    mimeType: recording.mimeType,
    durationSeconds: Math.round(recording.durationSeconds),
    sizeBytes: recording.sizeBytes,
    recordedAt: recording.recordedAt,
    uploadedById,
    source,
  };

  if (isDemoMode()) {
    // Demo mode keeps the blob in the browser; Storage is never contacted.
    rememberDemoAudio(id, recording.url);
    return attachment;
  }

  try {
    await uploadBytes(ref(getFirebaseStorage(), storagePath), recording.blob, {
      contentType: recording.mimeType,
    });
    return attachment;
  } catch (error) {
    throw toAppError(error);
  }
}

/**
 * Copies a recording to a path owned by another record.
 *
 * Used when an enquiry becomes a job: the bytes are duplicated to a job-owned
 * path so that seeing jobs never grants sight of enquiry storage. The copy is
 * byte-for-byte, keeps the original format, length and recording time, and the
 * source file is left completely untouched - replacing the enquiry recording
 * afterwards cannot change what the job plays.
 */
export async function copyRequirementAudio(
  source: AudioAttachment,
  targetOwner: RequirementOwner,
  targetOwnerId: Id,
): Promise<AudioAttachment> {
  const id = newAttachmentId();
  const storagePath = buildAudioPath(targetOwner, targetOwnerId, id, source.mimeType);

  const copy: AudioAttachment = {
    ...source,
    id,
    storagePath,
  };

  if (isDemoMode()) {
    const url = demoAudioUrl(source.id);
    if (url) rememberDemoAudio(id, url);
    return copy;
  }

  try {
    const bytes = await getBytes(ref(getFirebaseStorage(), source.storagePath));
    await uploadBytes(ref(getFirebaseStorage(), storagePath), bytes, {
      contentType: source.mimeType,
    });
    return copy;
  } catch (error) {
    throw toAppError(error);
  }
}

/**
 * Removes a file that was written but is no longer wanted - for example an
 * audio copy whose conversion then failed. Best effort by design.
 */
export async function discardAudio(attachment: AudioAttachment): Promise<void> {
  if (isDemoMode()) return;
  try {
    await deleteObject(ref(getFirebaseStorage(), attachment.storagePath));
  } catch {
    // Nothing references it; a leftover file is not worth failing the caller.
  }
}

/**
 * Resolves a playable URL for the signed-in user.
 *
 * Deliberately not stored on the document: a Storage download URL is a bearer
 * token that would outlive the permission check that produced it.
 */
export async function resolveAudioUrl(attachment: AudioAttachment): Promise<string> {
  if (isDemoMode()) {
    const url = demoAudioUrl(attachment.id);
    if (!url) throw new Error('This sample recording is not available in the demo.');
    return url;
  }

  try {
    return await getDownloadURL(ref(getFirebaseStorage(), attachment.storagePath));
  } catch (error) {
    throw toAppError(error);
  }
}

/**
 * Deletes a superseded recording.
 *
 * Only ever called with `isReferencedElsewhere: false`. A recording that a job
 * still points at is left in place - a broken reference in a job is worse than
 * an unused file.
 */
export async function deleteSupersededAudio(
  attachment: AudioAttachment,
  isReferencedElsewhere: boolean,
): Promise<void> {
  if (isReferencedElsewhere || isDemoMode()) return;

  try {
    await deleteObject(ref(getFirebaseStorage(), attachment.storagePath));
  } catch {
    // Cleanup is best effort: the new recording is already saved and correct.
  }
}
