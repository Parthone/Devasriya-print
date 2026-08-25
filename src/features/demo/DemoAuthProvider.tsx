import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { AuthContext, type AuthContextValue } from '@/features/auth/context/auth-context';
import { toAuthenticatedUser } from '@/features/auth/session';
import { toCustomerSession } from '@/features/customer-portal/types';
import {
  DEMO_CUSTOMER_ACCOUNT,
  DEMO_OWNER_PROFILE,
  DEMO_OWNER_UID,
} from '@/features/demo/demo-data';
import type { SessionState } from '@/types/auth';

const DEMO_SESSION_KEY = 'devasriya-print.demo-session';

/** Which side of the software the demo visitor is looking at. */
type DemoSessionKind = 'staff' | 'customer';

function readStoredSession(): DemoSessionKind | null {
  try {
    const stored = sessionStorage.getItem(DEMO_SESSION_KEY);
    if (stored === 'active' || stored === 'staff') return 'staff';
    if (stored === 'customer') return 'customer';
    return null;
  } catch {
    // Private mode or storage disabled: the demo simply starts signed out.
    return null;
  }
}

function writeStoredSession(kind: DemoSessionKind | null): void {
  try {
    if (kind) {
      sessionStorage.setItem(DEMO_SESSION_KEY, kind);
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
 * fabricated owner instead of a real account. No Supabase Auth call is made
 * from here, and none of the real authentication code is loaded into the flow.
 *
 * The session is kept in `sessionStorage`, so a refresh keeps the demo going
 * for that browser tab and closing it ends the demo.
 */
export function DemoAuthProvider({ children }: { children: ReactNode }) {
  const [kind, setKind] = useState<DemoSessionKind | null>(readStoredSession);

  const enterDemo = useCallback((next: DemoSessionKind = 'staff') => {
    writeStoredSession(next);
    setKind(next);
  }, []);

  // The portal sign-in lives at /portal/login, so which kind of demo session to
  // start can be read straight off the path. Credentials are ignored either
  // way: demo mode never authenticates anything.
  const signIn = useCallback(async () => {
    enterDemo(window.location.pathname.includes('/portal') ? 'customer' : 'staff');
    return Promise.resolve();
  }, [enterDemo]);

  const signOut = useCallback(async () => {
    writeStoredSession(null);
    setKind(null);
    return Promise.resolve();
  }, []);

  const sendPasswordReset = useCallback(async () => Promise.resolve(), []);
  const refreshProfile = useCallback(async () => Promise.resolve(), []);

  const session = useMemo<SessionState>(() => {
    if (!kind) return { status: 'unauthenticated', rejection: null };
    if (kind === 'customer') {
      return {
        status: 'customer',
        customer: toCustomerSession(DEMO_CUSTOMER_ACCOUNT, DEMO_CUSTOMER_ACCOUNT.email),
      };
    }
    return {
      status: 'authenticated',
      user: toAuthenticatedUser(
        { uid: DEMO_OWNER_UID, email: DEMO_OWNER_PROFILE.email },
        DEMO_OWNER_PROFILE,
      ),
    };
  }, [kind]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, signIn, signOut, sendPasswordReset, refreshProfile }),
    [session, signIn, signOut, sendPasswordReset, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
