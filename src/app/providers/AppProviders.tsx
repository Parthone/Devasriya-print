import type { ReactNode } from 'react';

import { QueryProvider } from '@/app/providers/QueryProvider';
import { ThemeProvider } from '@/app/providers/ThemeProvider';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';
import { isDemoMode } from '@/config/demo';
import { AuthProvider } from '@/features/auth/providers/AuthProvider';
import { DemoAuthProvider } from '@/features/demo/DemoAuthProvider';

/**
 * Every cross-cutting provider, in one place and in a fixed order.
 *
 * Auth sits inside Query so that authenticated data hooks share one cache, and
 * inside the error boundary so a failure while restoring a session is caught.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  // Demo mode swaps the session provider only. Everything downstream - guards,
  // permissions, screens - is identical, and the Firebase provider is simply
  // not mounted, so no auth listener or sign-in call is ever made.
  const SessionProvider = isDemoMode() ? DemoAuthProvider : AuthProvider;

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryProvider>
          <SessionProvider>
            {children}
            <Toaster />
          </SessionProvider>
        </QueryProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
