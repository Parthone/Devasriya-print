import { AlertCircle, Loader2, Play } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/audio/recording';
import { resolveAudioUrl } from '@/services/storage/audio-storage.service';
import type { AudioAttachment } from '@/types/attachments';

/**
 * Plays a stored requirement recording.
 *
 * The URL is resolved on demand through the storage service - components never
 * touch Storage, and no long-lived download URL is kept on the document.
 */
export function AudioPlayer({ attachment }: { attachment: AudioAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setUrl(await resolveAudioUrl(attachment));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the recording.');
    } finally {
      setLoading(false);
    }
  };

  if (url) {
    return (
      <audio controls src={url} className="w-full max-w-sm">
        <track kind="captions" />
      </audio>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isLoading}
        onClick={() => void load()}
      >
        {isLoading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Play className="size-4" aria-hidden="true" />
        )}
        Play recording
      </Button>
      <span className="text-xs text-muted-foreground">
        {formatDuration(attachment.durationSeconds)}
        {attachment.source === 'customer' ? ' - recorded by the customer' : ''}
      </span>
      {error ? (
        <span role="alert" className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="size-3" aria-hidden="true" /> {error}
        </span>
      ) : null}
    </div>
  );
}
