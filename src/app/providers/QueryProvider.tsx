import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { createQueryClient } from '@/lib/queryClient';

export function QueryProvider({ children }: { children: ReactNode }) {
  // One client per app instance, created lazily so tests get a fresh cache.
  const [queryClient] = useState(createQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
