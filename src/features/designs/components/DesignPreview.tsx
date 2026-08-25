import { useQuery } from '@tanstack/react-query';
import { ExternalLink, FileText, ImageOff, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Design } from '@/features/designs/types';
import { resolveDesignUrl } from '@/services/storage/design-storage.service';
import { humanFileSize } from '@/services/storage/design-storage.service';

/**
 * Shows a design file.
 *
 * The viewable URL is resolved when the component mounts, for whoever is signed
 * in - it is never stored on the document, so a link cannot be lifted out of
 * Firestore and used by somebody the rules would refuse. Images render inline;
 * a PDF gets an open action, which is the browser's own viewer rather than a
 * bundled one.
 */
export function DesignPreview({
  design,
  openLabel,
  unavailableLabel,
  className,
}: {
  design: Design;
  openLabel: string;
  unavailableLabel: string;
  className?: string;
}) {
  const url = useQuery({
    queryKey: ['design-file', design.file.id],
    queryFn: () => resolveDesignUrl(design.file),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return (
    <div className={className}>
      <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
        {url.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : url.isError || !url.data ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <ImageOff className="size-5" aria-hidden="true" />
            <p>{unavailableLabel}</p>
          </div>
        ) : design.preview.kind === 'image' ? (
          <img
            src={url.data}
            alt={design.file.originalFileName}
            className="max-h-[70vh] w-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-3 p-8 text-center text-sm text-muted-foreground">
            <FileText className="size-8" aria-hidden="true" />
            <p>{design.file.originalFileName}</p>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">
          {design.file.originalFileName} - {humanFileSize(design.file.sizeBytes)}
        </span>
        {url.data ? (
          <Button asChild variant="outline" size="sm">
            <a href={url.data} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" aria-hidden="true" /> {openLabel}
            </a>
          </Button>
        ) : url.isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : null}
      </div>
    </div>
  );
}
