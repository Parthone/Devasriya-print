import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { FullPageLoader } from '@/components/common/FullPageLoader';
import { ROUTES } from '@/constants/routes';
import { useAuth } from '@/features/auth/hooks/use-auth';
import type { Permission } from '@/types/auth';

interface ProtectedRouteProps {
  children: ReactNode;
  /** Restricts the route to owner and admin roles. */
  requiresAdmin?: boolean;
  /**
   * Granular permissions, enforced from Module 2. Declared now so routes can be
   * annotated as they are built without another signature change.
   */
  requires?: Permission[];
}

/**
 * The gate in front of every authenticated route.
 *
 * While the session is being restored nothing is rendered but a loader - that
 * avoids bouncing a signed-in user to the login screen on a page refresh.
 * Unauthenticated users are sent to /login with the path they wanted, so they
 * land back on it after signing in.
 */
export function ProtectedRoute({ children, requiresAdmin = false }: ProtectedRouteProps) {
  const { session } = useAuth();
  const location = useLocation();

  if (session.status === 'loading') {
    return <FullPageLoader label="Restoring your session..." />;
  }

  if (session.status === 'unauthenticated') {
    return (
      <Navigate
        to={ROUTES.login}
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  if (requiresAdmin && !session.user.isAdmin) {
    return <Navigate to={ROUTES.forbidden} replace />;
  }

  return <>{children}</>;
}
