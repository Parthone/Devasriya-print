import { useContext } from 'react';

import { AuthContext, type AuthContextValue } from '@/features/auth/context/auth-context';
import type { CustomerSession } from '@/features/customer-portal/types';
import type { AuthenticatedUser } from '@/types/auth';

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return context;
}

/**
 * The signed-in user, for code that only ever runs inside a protected route.
 * Throws if called while signed out, which is a programming error.
 */
export function useAuthenticatedUser(): AuthenticatedUser {
  const { session } = useAuth();
  if (session.status !== 'authenticated') {
    throw new Error('useAuthenticatedUser must be used inside a protected route.');
  }
  return session.user;
}

/**
 * The signed-in customer, for code that only ever runs inside the portal.
 * Throws for a staff session, which is a routing mistake rather than a state
 * the portal has to render.
 */
export function useCustomerSession(): CustomerSession {
  const { session } = useAuth();
  if (session.status !== 'customer') {
    throw new Error('useCustomerSession must be used inside a customer portal route.');
  }
  return session.customer;
}
