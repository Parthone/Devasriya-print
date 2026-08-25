import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { FullPageLoader } from '@/components/common/FullPageLoader';
import { ROUTES } from '@/constants/routes';
import { useAuth } from '@/features/auth/hooks/use-auth';

/**
 * The gate in front of the customer review portal.
 *
 * The mirror image of `ProtectedRoute`: only a customer session gets through.
 * A staff session is sent back to the staff application rather than being shown
 * a customer's screens, which keeps the two sides of the software from quietly
 * blending into one another.
 */
export function CustomerRoute({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const location = useLocation();

  if (session.status === 'loading') {
    return <FullPageLoader label="Checking your session..." />;
  }

  if (session.status === 'authenticated') {
    return <Navigate to={ROUTES.dashboard} replace />;
  }

  if (session.status === 'unauthenticated') {
    return (
      <Navigate
        to={ROUTES.portalLogin}
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <>{children}</>;
}
