import { Loader2 } from 'lucide-react';

export function FullPageLoader({ label = 'Loading...' }: { label?: string }) {
  return (
    <div
      className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
