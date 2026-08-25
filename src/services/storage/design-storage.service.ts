import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { isDemoMode } from '@/config/demo';
import { demoFileUrl, rememberDemoFile } from '@/features/demo/demo-store';
import { getFirebaseStorage } from '@/lib/firebase/client';
import { toAppError } from '@/lib/firebase/errors';
import {
  DESIGN_FILE_EXTENSIONS,
  DESIGN_MIME_TYPES,
  MAX_DESIGN_BYTES,
  isDesignMimeType,
  previewKindFor,
  type DesignAttachment,
  type DesignMimeType,
  type DesignPreview,
} from '@/types/attachments';
import { AppError, type Id } from '@/types/common';

function newAttachmentId(): Id {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `dsn-${String(Date.now())}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Immutable path for one design file.
 *
 * The design id and the attachment id are both in the path, so a revision never
 * writes over the file an earlier version points at - which is what makes an
 * approved design a record of what was actually approved. Storage rules refuse
 * a write when the object already exists, so this is enforced rather than
 * merely intended.
 */
export function buildDesignPath(
  jobId: Id,
  designId: Id,
  attachmentId: Id,
  mimeType: DesignMimeType,
): string {
  return `designs/${jobId}/${designId}/${attachmentId}.${DESIGN_FILE_EXTENSIONS[mimeType]}`;
}

export function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type DesignFileCheck =
  { ok: true; mimeType: DesignMimeType } | { ok: false; message: string };

/**
 * Checks a chosen file before anything is uploaded.
 *
 * The same limits are written into storage.rules, so a client that skips this
 * is refused by the bucket; this exists to say why, in words, before the
 * customer is waiting on a failed upload.
 */
export function checkDesignFile(file: { type: string; size: number }): DesignFileCheck {
  if (!isDesignMimeType(file.type)) {
    const accepted = DESIGN_MIME_TYPES.map((type) => DESIGN_FILE_EXTENSIONS[type].toUpperCase());
    return {
      ok: false,
      message: `Designs must be ${accepted.join(', ')}. Send source files another way.`,
    };
  }

  if (file.size > MAX_DESIGN_BYTES) {
    return {
      ok: false,
      message: `That file is ${humanFileSize(file.size)}. The limit is ${humanFileSize(MAX_DESIGN_BYTES)}.`,
    };
  }

  if (file.size === 0) {
    return { ok: false, message: 'That file is empty.' };
  }

  return { ok: true, mimeType: file.type };
}

/** Measures an image so the review screen can reserve the right space. */
export async function measurePreview(file: Blob, mimeType: DesignMimeType): Promise<DesignPreview> {
  const kind = previewKindFor(mimeType);
  if (
    kind !== 'image' ||
    typeof Image === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return { kind, width: null, height: null };
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<DesignPreview>((resolve) => {
      const image = new Image();
      image.onload = () => {
        resolve({ kind, width: image.naturalWidth || null, height: image.naturalHeight || null });
      };
      image.onerror = () => {
        resolve({ kind, width: null, height: null });
      };
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface UploadDesignFileInput {
  jobId: Id;
  designId: Id;
  file: Blob & { name?: string };
  mimeType: DesignMimeType;
  originalFileName: string;
  uploadedById: Id;
}

/**
 * Uploads one design file and returns the metadata to store on the version.
 *
 * The caller writes the Firestore document only after this resolves, so a
 * failed upload never leaves a version pointing at a file that is not there.
 */
export async function uploadDesignFile({
  jobId,
  designId,
  file,
  mimeType,
  originalFileName,
  uploadedById,
}: UploadDesignFileInput): Promise<DesignAttachment> {
  if (file.size > MAX_DESIGN_BYTES) {
    throw new AppError('invalid-input', 'That design file is too large.');
  }

  const id = newAttachmentId();
  const attachment: DesignAttachment = {
    id,
    storagePath: buildDesignPath(jobId, designId, id, mimeType),
    mimeType,
    sizeBytes: file.size,
    originalFileName,
    uploadedAt: new Date(),
    uploadedById,
  };

  if (isDemoMode()) {
    // The demo keeps the blob in the browser; Storage is never contacted.
    if (typeof URL.createObjectURL === 'function') {
      rememberDemoFile(id, URL.createObjectURL(file));
    }
    return attachment;
  }

  try {
    await uploadBytes(ref(getFirebaseStorage(), attachment.storagePath), file, {
      contentType: mimeType,
    });
    return attachment;
  } catch (error) {
    throw toAppError(error);
  }
}

/**
 * Resolves a viewable URL for whoever is signed in - staff or customer.
 *
 * Never persisted on the document: a Storage download URL is a bearer token
 * that would outlive the permission check that produced it, and a design is
 * exactly the kind of thing that must not leak to another customer.
 */
export async function resolveDesignUrl(attachment: DesignAttachment): Promise<string> {
  if (isDemoMode()) {
    const url = demoFileUrl(attachment.id);
    if (!url) throw new AppError('not-found', 'This sample design is not available in the demo.');
    return url;
  }

  try {
    return await getDownloadURL(ref(getFirebaseStorage(), attachment.storagePath));
  } catch (error) {
    throw toAppError(error);
  }
}

/**
 * Tidies up a file whose version document then failed to write.
 *
 * Storage refuses every delete under `designs/`, deliberately: a rule that let
 * anybody remove a design object would also let somebody remove the artwork an
 * approved version points at. So this usually leaves an unreferenced object
 * behind, and that is the trade we want - an orphaned file costs storage, a
 * deletable one costs the guarantee that an approval means something.
 */
export async function discardDesignFile(attachment: DesignAttachment): Promise<void> {
  if (isDemoMode()) return;
  try {
    await deleteObject(ref(getFirebaseStorage(), attachment.storagePath));
  } catch {
    // Expected: design objects are immutable. Nothing references this one.
  }
}
