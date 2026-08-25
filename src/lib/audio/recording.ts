import { MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS } from '@/types/attachments';

/**
 * Recording formats, in order of preference.
 *
 * Opus in WebM everywhere it exists; Safari records MP4/AAC instead.
 */
const CANDIDATE_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

export function pickRecordingMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return CANDIDATE_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    pickRecordingMimeType() !== null
  );
}

/** File extension for a recording, used in the immutable storage path. */
export function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'bin';
}

export type RecordingRejection = 'too-long' | 'too-large';

/** Checks a finished recording against the agreed limits. */
export function validateRecording(
  sizeBytes: number,
  durationSeconds: number,
): RecordingRejection | null {
  if (durationSeconds > MAX_AUDIO_SECONDS) return 'too-long';
  if (sizeBytes > MAX_AUDIO_BYTES) return 'too-large';
  return null;
}

export const RECORDING_REJECTION_MESSAGES: Record<RecordingRejection, string> = {
  'too-long': `Recording is longer than ${String(Math.round(MAX_AUDIO_SECONDS / 60))} minutes.`,
  'too-large': `Recording is larger than ${String(MAX_AUDIO_BYTES / (1024 * 1024))} MB.`,
};

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes)}:${String(seconds % 60).padStart(2, '0')}`;
}
