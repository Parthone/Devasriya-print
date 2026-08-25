import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { FullPageLoader } from '@/components/common/FullPageLoader';
import { ROUTES } from '@/constants/routes';
import { useAuth } from '@/features/auth/hooks/use-auth';
import type { Permission } from '@/features/permissions/catalogue';
import { hasAllPermissions } from '@/features/permissions/helpers';

interface ProtectedRouteProps {
  children: ReactNode;
  /** Every one of these permissions is required to open the route. */
  requires?: readonly Permission[];
}

/**
 * The gate in front of every authenticated route.
 *
 * While the session is being restored nothing is rendered but a loader - that
 * avoids bouncing a signed-in user to the login screen on a page refresh.
 * Unauthenticated users are sent to /login with the path they wanted, so they
 * land back on it after signing in. A signed-in user without the required
 * permission gets /forbidden, whether they used the menu or typed the URL.
 */
export function ProtectedRoute({ children, requires = [] }: ProtectedRouteProps) {
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

  // A customer portal session is not a staff session with fewer permissions -
  // it has no role at all. There is nothing here for them to be allowed into,
  // so they go back to their own side of the application.
  if (session.status === 'customer') {
    return <Navigate to={ROUTES.portal} replace />;
  }

  if (!hasAllPermissions(session.user.permissions, requires)) {
    return <Navigate to={ROUTES.forbidden} replace />;
  }

  return <>{children}</>;
}
