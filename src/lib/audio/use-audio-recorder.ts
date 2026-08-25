import { useCallback, useEffect, useRef, useState } from 'react';

import {
  pickRecordingMimeType,
  validateRecording,
  type RecordingRejection,
} from '@/lib/audio/recording';
import { MAX_AUDIO_SECONDS } from '@/types/attachments';

export interface LocalRecording {
  blob: Blob;
  /** Object URL for playback before saving. Revoked when replaced. */
  url: string;
  mimeType: string;
  durationSeconds: number;
  sizeBytes: number;
  recordedAt: Date;
}

export type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'ready' | 'error';

export interface AudioRecorderApi {
  status: RecorderStatus;
  elapsedSeconds: number;
  recording: LocalRecording | null;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  clear: () => void;
}

/**
 * Browser audio recording.
 *
 * Everything stays in the browser: the blob and its object URL are local, and
 * nothing is uploaded until the surrounding form is saved. Recording stops
 * automatically at the maximum length.
 */
export function useAudioRecorder(
  onRejected?: (reason: RecordingRejection) => void,
): AudioRecorderApi {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [elapsedSeconds, setElapsed] = useState(0);
  const [recording, setRecording] = useState<LocalRecording | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const urlRef = useRef<string | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      stopTimer();
      releaseUrl();
      recorderRef.current?.stream.getTracks().forEach((track) => {
        track.stop();
      });
    },
    [stopTimer, releaseUrl],
  );

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    stopTimer();
  }, [stopTimer]);

  const clear = useCallback(() => {
    releaseUrl();
    setRecording(null);
    setElapsed(0);
    setStatus('idle');
    setError(null);
  }, [releaseUrl]);

  const start = useCallback(async () => {
    const mimeType = pickRecordingMimeType();
    if (!mimeType) {
      setStatus('error');
      setError('Recording is not supported in this browser.');
      return;
    }

    setStatus('requesting');
    setError(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setStatus('error');
      setError('Microphone permission was refused.');
      return;
    }

    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    chunksRef.current = [];
    startedAtRef.current = Date.now();

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      stream.getTracks().forEach((track) => {
        track.stop();
      });
      const durationSeconds = (Date.now() - startedAtRef.current) / 1000;
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const rejection = validateRecording(blob.size, durationSeconds);

      if (rejection) {
        onRejected?.(rejection);
        setStatus('idle');
        return;
      }

      releaseUrl();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setRecording({
        blob,
        url,
        mimeType,
        durationSeconds,
        sizeBytes: blob.size,
        recordedAt: new Date(),
      });
      setStatus('ready');
    };

    recorder.start();
    setStatus('recording');
    setElapsed(0);

    timerRef.current = setInterval(() => {
      const seconds = (Date.now() - startedAtRef.current) / 1000;
      setElapsed(seconds);
      if (seconds >= MAX_AUDIO_SECONDS) stop();
    }, 250);
  }, [onRejected, releaseUrl, stop]);

  return { status, elapsedSeconds, recording, error, start, stop, clear };
}
