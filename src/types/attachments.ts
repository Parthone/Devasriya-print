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
