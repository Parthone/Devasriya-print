import type { ReactNode } from 'react';

import type { Permission } from '@/types/auth';

interface ProtectedRouteProps {
  children: ReactNode;
  /** Permissions the route will require once the permissions module lands. */
  requires?: Permission[];
}

/**
 * Route guard seam.
 *
 * MODULE 0: pass-through. The shape is fixed now so that Module 1
 * (authentication) and Module 2 (permissions) only have to fill in the body -
 * redirect unauthenticated users to /login, and send users without the required
 * permission to /forbidden - without touching the route table.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  return <>{children}</>;
}
