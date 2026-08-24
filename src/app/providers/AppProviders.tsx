import type { ReactNode } from 'react';

import { QueryProvider } from '@/app/providers/QueryProvider';
import { ThemeProvider } from '@/app/providers/ThemeProvider';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/features/auth/providers/AuthProvider';

/**
 * Every cross-cutting provider, in one place and in a fixed order.
 *
 * Auth sits inside Query so that authenticated data hooks share one cache, and
 * inside the error boundary so a failure while restoring a session is caught.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryProvider>
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        </QueryProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
