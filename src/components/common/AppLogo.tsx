import { Printer } from 'lucide-react';

import { APP_CONFIG } from '@/config/app.config';
import { cn } from '@/lib/utils';

interface AppLogoProps {
  className?: string;
  showTagline?: boolean;
}

export function AppLogo({ className, showTagline = false }: AppLogoProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Printer className="size-5" aria-hidden="true" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="font-semibold tracking-tight">{APP_CONFIG.name}</span>
        {showTagline ? (
          <span className="text-xs text-muted-foreground">{APP_CONFIG.tagline}</span>
        ) : null}
      </span>
    </div>
  );
}
