import type { ReactNode } from 'react';

import { QueryProvider } from '@/app/providers/QueryProvider';
import { ThemeProvider } from '@/app/providers/ThemeProvider';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';
import { isDemoMode } from '@/config/demo';
import { AuthProvider } from '@/features/auth/providers/AuthProvider';
import { DemoAuthProvider } from '@/features/demo/DemoAuthProvider';
import { LanguageBridge } from '@/i18n/LanguageBridge';

/**
 * Every cross-cutting provider, in one place and in a fixed order.
 *
 * Auth sits inside Query so that authenticated data hooks share one cache, and
 * inside the error boundary so a failure while restoring a session is caught.
 * The language layer sits inside auth, because a signed-in customer's preferred
 * language is part of what decides which language the screens open in.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  // Demo mode swaps the session provider only. Everything downstream - guards,
  // permissions, screens - is identical, and the Supabase session provider is simply
  // not mounted, so no auth listener or sign-in call is ever made.
  const SessionProvider = isDemoMode() ? DemoAuthProvider : AuthProvider;

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryProvider>
          <SessionProvider>
            <LanguageBridge>
              {children}
              <Toaster />
            </LanguageBridge>
          </SessionProvider>
        </QueryProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
