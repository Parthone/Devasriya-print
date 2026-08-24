import type { ReactNode } from 'react';

import { QueryProvider } from '@/app/providers/QueryProvider';
import { ThemeProvider } from '@/app/providers/ThemeProvider';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';

/** Every cross-cutting provider, in one place and in a fixed order. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
