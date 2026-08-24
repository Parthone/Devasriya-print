import { useContext } from 'react';

import { AuthContext, type AuthContextValue } from '@/features/auth/context/auth-context';
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
