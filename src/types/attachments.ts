import type { Id } from '@/types/common';

export const AUDIO_SOURCES = ['staff', 'customer'] as const;
export type AudioSource = (typeof AUDIO_SOURCES)[number];

/**
 * A stored audio requirement.
 *
 * Two rules this shape exists to enforce:
 *
 * 1. No download URL is persisted. A Storage URL is a bearer token with a long
 *    life; the playable URL is resolved at runtime for the signed-in user
 *    through the storage service instead.
 * 2. `storagePath` is immutable. Replacing a recording writes a new file with a
 *    new id, so a job that was converted from an enquiry keeps pointing at the
 *    exact audio that existed at conversion time.
 */
export interface AudioAttachment {
  /** Unique per recording; part of the storage path. */
  id: Id;
  storagePath: string;
  mimeType: string;
  durationSeconds: number;
  sizeBytes: number;
  recordedAt: Date;
  uploadedById: Id;
  source: AudioSource;
}

export const MAX_AUDIO_SECONDS = 180;
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

/**
 * A stored design file.
 *
 * Same two rules as `AudioAttachment`: no download URL is ever persisted, and
 * the path is immutable. A revision writes a new file under a new attachment
 * id, so an approved version can never be swapped for different artwork.
 */
export interface DesignAttachment {
  /** Unique per file; part of the storage path. */
  id: Id;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  /** What the designer called it on their machine, kept for recognisability. */
  originalFileName: string;
  uploadedAt: Date;
  uploadedById: Id;
}

/** What the review screen can show inline without downloading a viewer. */
export const DESIGN_PREVIEW_KINDS = ['image', 'pdf'] as const;
export type DesignPreviewKind = (typeof DESIGN_PREVIEW_KINDS)[number];

export interface DesignPreview {
  kind: DesignPreviewKind;
  /** Pixel size, when the browser could measure it. Null for PDFs. */
  width: number | null;
  height: number | null;
}

/**
 * Formats accepted for design review.
 *
 * Deliberately short: what a customer can actually look at and approve. Source
 * files (AI, PSD, CDR) are production assets, not review artefacts, and letting
 * them through would mean uploading things no reviewer can open.
 */
export const DESIGN_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export type DesignMimeType = (typeof DESIGN_MIME_TYPES)[number];

export const DESIGN_FILE_EXTENSIONS: Record<DesignMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export const MAX_DESIGN_BYTES = 25 * 1024 * 1024;

export function isDesignMimeType(value: string): value is DesignMimeType {
  return (DESIGN_MIME_TYPES as readonly string[]).includes(value);
}

export function previewKindFor(mimeType: DesignMimeType): DesignPreviewKind {
  return mimeType === 'application/pdf' ? 'pdf' : 'image';
}
