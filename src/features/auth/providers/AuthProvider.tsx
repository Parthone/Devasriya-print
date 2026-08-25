import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { AuthContext, type AuthContextValue } from '@/features/auth/context/auth-context';
import {
  observeAuthState,
  sendPasswordSetupEmail,
  signInWithEmail,
  signOutCurrentUser,
} from '@/features/auth/services/auth.service';
import { resolveSession } from '@/features/auth/session';
import { findCustomerAccount } from '@/features/customer-portal/services/customer-account.service';
import type { CustomerAccount } from '@/features/customer-portal/types';
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
 * Being signed in to Supabase is not enough to be signed in to Devasriya Print:
 * a user must also have a profile document, and it must be active. Any account
 * that fails those checks is signed out immediately - on login and on session
 * restore - and the reason is kept so the sign-in screen can explain it.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AuthAccount | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [customerAccount, setCustomerAccount] = useState<CustomerAccount | null>(null);
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
    setCustomerAccount(null);
    setRejection(reason);
    await signOutCurrentUser().catch(() => undefined);
  }, []);

  /**
   * Works out what kind of principal a uid is.
   *
   * Employees first, because that is the common case and the only one that
   * costs a read on every sign-in. The portal collection is consulted only when
   * there is no employee profile at all.
   */
  const identify = useCallback(async (uid: string) => {
    const nextProfile = await getUserProfile(uid).catch(() => null);
    if (nextProfile) return { profile: nextProfile, customerAccount: null };
    const nextCustomer = await findCustomerAccount(uid).catch(() => null);
    return { profile: null, customerAccount: nextCustomer };
  }, []);

  useEffect(() => {
    const unsubscribe = observeAuthState((nextAccount) => {
      void (async () => {
        if (!nextAccount) {
          if (!isMounted.current) return;
          setAccount(null);
          setProfile(null);
          setCustomerAccount(null);
          setIsRestoring(false);
          return;
        }

        const identity = await identify(nextAccount.uid);
        if (!isMounted.current) return;

        const session = resolveSession({ account: nextAccount, ...identity });
        if (session.status === 'authenticated') {
          setAccount(nextAccount);
          setProfile(session.user.profile);
          setCustomerAccount(null);
          setRejection(null);
        } else if (session.status === 'customer') {
          setAccount(nextAccount);
          setProfile(null);
          setCustomerAccount(session.customer.account);
          setRejection(null);
        } else if (session.rejection) {
          await rejectSession(session.rejection);
        }

        if (isMounted.current) setIsRestoring(false);
      })();
    });

    return unsubscribe;
  }, [identify, rejectSession]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setRejection(null);
      const nextAccount = await signInWithEmail(email, password);
      const identity = await identify(nextAccount.uid);
      const session = resolveSession({ account: nextAccount, ...identity });

      if (session.status === 'unauthenticated') {
        const reason = session.rejection ?? 'no-profile';
        await rejectSession(reason);
        throw new AppError('permission-denied', SESSION_REJECTION_MESSAGES[reason]);
      }

      setAccount(nextAccount);
      setProfile(session.status === 'authenticated' ? session.user.profile : null);
      setCustomerAccount(session.status === 'customer' ? session.customer.account : null);
    },
    [identify, rejectSession],
  );

  const signOut = useCallback(async () => {
    await signOutCurrentUser();
    setAccount(null);
    setProfile(null);
    setCustomerAccount(null);
    setRejection(null);
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    await sendPasswordSetupEmail(email);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!account) return;
    const identity = await identify(account.uid);
    const session = resolveSession({ account, ...identity });
    if (session.status === 'authenticated') {
      setProfile(session.user.profile);
    } else if (session.status === 'customer') {
      setCustomerAccount(session.customer.account);
    } else if (session.rejection) {
      await rejectSession(session.rejection);
    }
  }, [account, identify, rejectSession]);

  const session = useMemo<SessionState>(() => {
    if (isRestoring) return { status: 'loading' };
    if (!account || (!profile && !customerAccount)) {
      return { status: 'unauthenticated', rejection };
    }
    return resolveSession({ account, profile, customerAccount });
  }, [account, profile, customerAccount, rejection, isRestoring]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, signIn, signOut, sendPasswordReset, refreshProfile }),
    [session, signIn, signOut, sendPasswordReset, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
