import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { AuthContext, type AuthContextValue } from '@/features/auth/context/auth-context';
import {
  observeAuthState,
  sendPasswordSetupEmail,
  signInWithEmail,
  signOutCurrentUser,
} from '@/features/auth/services/auth.service';
import { resolveSession } from '@/features/auth/session';
import { getUserProfile } from '@/features/users/services/user-profile.service';
import {
  SESSION_REJECTION_MESSAGES,
  type AuthAccount,
  type SessionRejectionReason,
  type SessionState,
  type UserProfile,
} from '@/types/auth';
import { AppError } from '@/types/common';

/**
 * Owns the authentication session.
 *
 * Being signed in to Firebase is not enough to be signed in to Devasriya Print:
 * a user must also have a profile document, and it must be active. Any account
 * that fails those checks is signed out immediately - on login and on session
 * restore - and the reason is kept so the sign-in screen can explain it.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AuthAccount | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [rejection, setRejection] = useState<SessionRejectionReason | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const rejectSession = useCallback(async (reason: SessionRejectionReason) => {
    setAccount(null);
    setProfile(null);
    setRejection(reason);
    await signOutCurrentUser().catch(() => undefined);
  }, []);

  useEffect(() => {
    const unsubscribe = observeAuthState((nextAccount) => {
      void (async () => {
        if (!nextAccount) {
          if (!isMounted.current) return;
          setAccount(null);
          setProfile(null);
          setIsRestoring(false);
          return;
        }

        const nextProfile = await getUserProfile(nextAccount.uid).catch(() => null);
        if (!isMounted.current) return;

        const session = resolveSession({ account: nextAccount, profile: nextProfile });
        if (session.status === 'authenticated') {
          setAccount(nextAccount);
          setProfile(session.user.profile);
          setRejection(null);
        } else if (session.rejection) {
          await rejectSession(session.rejection);
        }

        if (isMounted.current) setIsRestoring(false);
      })();
    });

    return unsubscribe;
  }, [rejectSession]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setRejection(null);
      const nextAccount = await signInWithEmail(email, password);
      const nextProfile = await getUserProfile(nextAccount.uid).catch(() => null);
      const session = resolveSession({ account: nextAccount, profile: nextProfile });

      if (session.status !== 'authenticated') {
        const reason = session.rejection ?? 'no-profile';
        await rejectSession(reason);
        throw new AppError('permission-denied', SESSION_REJECTION_MESSAGES[reason]);
      }

      setAccount(nextAccount);
      setProfile(session.user.profile);
    },
    [rejectSession],
  );

  const signOut = useCallback(async () => {
    await signOutCurrentUser();
    setAccount(null);
    setProfile(null);
    setRejection(null);
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    await sendPasswordSetupEmail(email);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!account) return;
    const nextProfile = await getUserProfile(account.uid).catch(() => null);
    const session = resolveSession({ account, profile: nextProfile });
    if (session.status === 'authenticated') {
      setProfile(session.user.profile);
    } else if (session.rejection) {
      await rejectSession(session.rejection);
    }
  }, [account, rejectSession]);

  const session = useMemo<SessionState>(() => {
    if (isRestoring) return { status: 'loading' };
    if (!account || !profile) return { status: 'unauthenticated', rejection };
    return resolveSession({ account, profile });
  }, [account, profile, rejection, isRestoring]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, signIn, signOut, sendPasswordReset, refreshProfile }),
    [session, signIn, signOut, sendPasswordReset, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
