import { Mic, Square, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { AudioPlayer } from '@/components/audio/AudioPlayer';
import { Button } from '@/components/ui/button';
import {
  formatDuration,
  isRecordingSupported,
  RECORDING_REJECTION_MESSAGES,
  type RecordingRejection,
} from '@/lib/audio/recording';
import { useAudioRecorder, type LocalRecording } from '@/lib/audio/use-audio-recorder';
import { MAX_AUDIO_SECONDS, type AudioAttachment } from '@/types/attachments';

interface AudioRecorderFieldProps {
  /** Recording already stored on the record, if any. */
  existing?: AudioAttachment | null | undefined;
  /** A new take, or null with `removeExisting` when the audio is cleared. */
  onChange: (recording: LocalRecording | null, removeExisting: boolean) => void;
  disabled?: boolean;
}

/**
 * Records the customer requirement in the browser.
 *
 * Nothing is uploaded here: the finished take is handed to the form, which
 * uploads it to an immutable path when the record is saved.
 */
export function AudioRecorderField({
  existing,
  onChange,
  disabled = false,
}: AudioRecorderFieldProps) {
  const onRejected = useCallback((reason: RecordingRejection) => {
    toast.error('Recording not saved', { description: RECORDING_REJECTION_MESSAGES[reason] });
  }, []);

  const recorder = useAudioRecorder(onRejected);
  const supported = isRecordingSupported();
  const reportedRef = useRef<string | null>(null);

  useEffect(() => {
    const take = recorder.recording;
    if (!take) return;
    const key = `${String(take.recordedAt.getTime())}-${String(take.sizeBytes)}`;
    if (reportedRef.current === key) return;
    reportedRef.current = key;
    onChange(take, false);
  }, [recorder.recording, onChange]);

  const handleStart = () => {
    void recorder.start();
  };

  const handleClear = () => {
    reportedRef.current = null;
    recorder.clear();
    onChange(null, true);
  };

  const hasNewTake = recorder.recording !== null;

  return (
    <div className="space-y-2 rounded-md border p-3">
      {hasNewTake ? (
        <>
          <p className="text-sm font-medium">New recording ready</p>
          <audio controls src={recorder.recording?.url} className="w-full max-w-sm">
            <track kind="captions" />
          </audio>
          <p className="text-xs text-muted-foreground">
            {formatDuration(recorder.recording?.durationSeconds ?? 0)} - uploaded when you save.
          </p>
        </>
      ) : existing ? (
        <>
          <p className="text-sm font-medium">Requirement recording</p>
          <AudioPlayer attachment={existing} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No recording yet.</p>
      )}

      {!supported ? (
        <p className="text-xs text-muted-foreground">
          Recording is not supported in this browser. Type the requirement instead.
        </p>
      ) : recorder.status === 'recording' ? (
        <div className="flex items-center gap-2">
          <Button type="button" variant="destructive" size="sm" onClick={recorder.stop}>
            <Square className="size-4" aria-hidden="true" /> Stop
          </Button>
          <span className="text-sm" aria-live="polite">
            Recording {formatDuration(recorder.elapsedSeconds)} of{' '}
            {formatDuration(MAX_AUDIO_SECONDS)}
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleStart}
            disabled={disabled || recorder.status === 'requesting'}
          >
            <Mic className="size-4" aria-hidden="true" />
            {(existing ?? hasNewTake) ? 'Record again' : 'Record requirement'}
          </Button>
          {(existing ?? hasNewTake) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={disabled}
            >
              <Trash2 className="size-4" aria-hidden="true" /> Remove recording
            </Button>
          ) : null}
        </div>
      )}

      {recorder.error ? (
        <p role="alert" className="text-xs text-destructive">
          {recorder.error}
        </p>
      ) : null}
    </div>
  );
}
