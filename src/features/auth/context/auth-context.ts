import { createContext } from 'react';

import type { SessionState } from '@/types/auth';

export interface AuthContextValue {
  session: SessionState;
  /** Signs in and verifies the profile. Throws an AppError on any rejection. */
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  /** Re-reads the profile of the signed-in user, e.g. after an admin edit. */
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
