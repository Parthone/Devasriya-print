import { isDemoMode } from '@/config/demo';
import { demoFileUrl, rememberDemoFile } from '@/features/demo/demo-store';
import { extensionForMimeType } from '@/lib/audio/recording';
import type { LocalRecording } from '@/lib/audio/use-audio-recorder';
import { newId } from '@/lib/ids';
import { getSupabase } from '@/lib/supabase/client';
import { toAppError } from '@/lib/supabase/errors';
import { BUCKETS, SIGNED_URL_TTL_SECONDS, type BucketName } from '@/services/base/tables';
import type { AudioAttachment, AudioSource } from '@/types/attachments';
import { AppError, type Id } from '@/types/common';

/**
 * Which kind of record the recording belongs to.
 *
 * Enquiry audio and job audio live in separate buckets, not separate folders.
 * That split is a hard security boundary, not tidiness: converting an enquiry
 * copies the bytes to a job owned object precisely so that seeing jobs never
 * grants sight of enquiries.
 */
export type RequirementOwner = 'enquiries' | 'jobs';

const BUCKET_FOR: Record<RequirementOwner, BucketName> = {
  enquiries: BUCKETS.enquiryAudio,
  jobs: BUCKETS.jobAudio,
};

/**
 * Immutable path for one recording.
 *
 * The attachment id is part of the path, so replacing a recording writes a new
 * object instead of overwriting the old one. A job converted from an enquiry
 * therefore keeps playing the exact audio that existed at conversion time. The
 * first folder segment is the owning record's id, which is what the storage
 * policy reads to decide whether the customer asking owns that order.
 */
export function buildAudioPath(ownerId: Id, attachmentId: Id, mimeType: string): string {
  return `${ownerId}/${attachmentId}.${extensionForMimeType(mimeType)}`;
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
  const id = newId();
  const storagePath = buildAudioPath(ownerId, id, recording.mimeType);

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
    rememberDemoFile(id, recording.url);
    return attachment;
  }

  try {
    const { error } = await getSupabase()
      .storage.from(BUCKET_FOR[owner])
      .upload(storagePath, recording.blob, {
        contentType: recording.mimeType,
        upsert: false,
      });
    if (error) throw error;
    return attachment;
  } catch (error) {
    throw toAppError(error);
  }
}

/**
 * Copies a recording to an object owned by another record.
 *
 * Used when an enquiry becomes a job: the bytes are duplicated into the job
 * bucket so that seeing jobs never grants sight of enquiry storage. The copy is
 * byte-for-byte, keeps the original format, length and recording time, and the
 * source object is left completely untouched - replacing the enquiry recording
 * afterwards cannot change what the job plays.
 */
export async function copyRequirementAudio(
  source: AudioAttachment,
  targetOwner: RequirementOwner,
  targetOwnerId: Id,
): Promise<AudioAttachment> {
  const id = newId();
  const storagePath = buildAudioPath(targetOwnerId, id, source.mimeType);
  const copy: AudioAttachment = { ...source, id, storagePath };

  if (isDemoMode()) {
    const url = demoFileUrl(source.id);
    if (url) rememberDemoFile(id, url);
    return copy;
  }

  try {
    const supabase = getSupabase();
    // Read from the enquiry bucket and write to the job bucket. Supabase's
    // server-side copy cannot cross buckets, and crossing buckets is the whole
    // point of this function.
    const download = await supabase.storage.from(BUCKETS.enquiryAudio).download(source.storagePath);
    if (download.error) throw download.error;

    const { error } = await supabase.storage
      .from(BUCKET_FOR[targetOwner])
      .upload(storagePath, download.data, { contentType: source.mimeType, upsert: false });
    if (error) throw error;

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
    await getSupabase().storage.from(BUCKETS.jobAudio).remove([attachment.storagePath]);
  } catch {
    // Nothing references it; a leftover object is not worth failing the caller.
  }
}

/**
 * Resolves a playable URL for the signed-in user.
 *
 * Deliberately not stored on the record: a signed URL is a bearer token that
 * would outlive the permission check that produced it. It is minted when
 * somebody presses play and expires shortly afterwards.
 *
 * Which bucket to look in is read from the path's owner - an enquiry recording
 * and the job copy of it are different objects in different buckets.
 */
export async function resolveAudioUrl(
  attachment: AudioAttachment,
  owner: RequirementOwner = 'jobs',
): Promise<string> {
  if (isDemoMode()) {
    const url = demoFileUrl(attachment.id);
    if (!url)
      throw new AppError('not-found', 'This sample recording is not available in the demo.');
    return url;
  }

  try {
    const { data, error } = await getSupabase()
      .storage.from(BUCKET_FOR[owner])
      .createSignedUrl(attachment.storagePath, SIGNED_URL_TTL_SECONDS);
    if (error) throw error;
    return data.signedUrl;
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
  owner: RequirementOwner = 'enquiries',
): Promise<void> {
  if (isReferencedElsewhere || isDemoMode()) return;

  try {
    await getSupabase().storage.from(BUCKET_FOR[owner]).remove([attachment.storagePath]);
  } catch {
    // Cleanup is best effort: the new recording is already saved and correct.
  }
}
