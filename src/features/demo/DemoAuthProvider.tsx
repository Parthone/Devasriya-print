import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { AuthContext, type AuthContextValue } from '@/features/auth/context/auth-context';
import { toAuthenticatedUser } from '@/features/auth/session';
import { DEMO_OWNER_PROFILE, DEMO_OWNER_UID } from '@/features/demo/demo-data';
import type { SessionState } from '@/types/auth';

const DEMO_SESSION_KEY = 'devasriya-print.demo-session';

function readStoredSession(): boolean {
  try {
    return sessionStorage.getItem(DEMO_SESSION_KEY) === 'active';
  } catch {
    // Private mode or storage disabled: the demo simply starts signed out.
    return false;
  }
}

function writeStoredSession(active: boolean): void {
  try {
    if (active) {
      sessionStorage.setItem(DEMO_SESSION_KEY, 'active');
    } else {
      sessionStorage.removeItem(DEMO_SESSION_KEY);
    }
  } catch {
    // Persisting the demo session is best effort.
  }
}

/**
 * Stand-in for `AuthProvider` while demo mode is on.
 *
 * It satisfies the same context contract, so every screen, guard and permission
 * check works unchanged - the difference is that the session is a local
 * fabricated owner instead of a Firebase account. No Firebase Auth call is made
 * from here, and none of the real authentication code is loaded into the flow.
 *
 * The session is kept in `sessionStorage`, so a refresh keeps the demo going
 * for that browser tab and closing it ends the demo.
 */
export function DemoAuthProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState<boolean>(readStoredSession);

  const enterDemo = useCallback(() => {
    writeStoredSession(true);
    setIsActive(true);
  }, []);

  const signIn = useCallback(async () => {
    // Credentials are ignored on purpose: demo mode never authenticates.
    enterDemo();
    return Promise.resolve();
  }, [enterDemo]);

  const signOut = useCallback(async () => {
    writeStoredSession(false);
    setIsActive(false);
    return Promise.resolve();
  }, []);

  const sendPasswordReset = useCallback(async () => Promise.resolve(), []);
  const refreshProfile = useCallback(async () => Promise.resolve(), []);

  const session = useMemo<SessionState>(() => {
    if (!isActive) return { status: 'unauthenticated', rejection: null };
    return {
      status: 'authenticated',
      user: toAuthenticatedUser(
        { uid: DEMO_OWNER_UID, email: DEMO_OWNER_PROFILE.email },
        DEMO_OWNER_PROFILE,
      ),
    };
  }, [isActive]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, signIn, signOut, sendPasswordReset, refreshProfile }),
    [session, signIn, signOut, sendPasswordReset, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
