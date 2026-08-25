import { QueryClient } from '@tanstack/react-query';

import { AppError } from '@/types/common';

/** Errors that will never succeed on retry. */
const NON_RETRYABLE = new Set([
  'permission-denied',
  'unauthenticated',
  'not-found',
  'invalid-input',
]);

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Job and production data changes through the day; a short stale window
        // keeps screens responsive without hammering the database on every mount.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          if (error instanceof AppError && NON_RETRYABLE.has(error.code)) return false;
          return failureCount < 2;
        },
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

/** Query keys are declared per feature; this is the shared root helper. */
export const queryKeys = {
  all: ['devasriya'] as const,
  scope: (feature: string) => [...queryKeys.all, feature] as const,
};
