import {
  browserLocalPersistence,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type Unsubscribe,
} from 'firebase/auth';

import { getFirebaseAuth } from '@/lib/firebase/client';
import { toAppError } from '@/lib/firebase/errors';
import type { AuthAccount } from '@/types/auth';

function toAccount(user: { uid: string; email: string | null }): AuthAccount {
  return { uid: user.uid, email: user.email };
}

/**
 * Session persistence.
 *
 * `browserLocalPersistence` keeps the user signed in across refreshes and
 * browser restarts, which is what a shop-floor application needs. Firebase
 * stores a refresh token, not the password, and the ID token is rotated hourly.
 */
export async function ensurePersistence(): Promise<void> {
  try {
    await setPersistence(getFirebaseAuth(), browserLocalPersistence);
  } catch (error) {
    throw toAppError(error);
  }
}

/** Fires immediately with the restored session, then on every change. */
export function observeAuthState(listener: (account: AuthAccount | null) => void): Unsubscribe {
  return onAuthStateChanged(getFirebaseAuth(), (user) => {
    listener(user ? toAccount(user) : null);
  });
}

export async function signInWithEmail(email: string, password: string): Promise<AuthAccount> {
  try {
    await ensurePersistence();
    const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
    return toAccount(credential.user);
  } catch (error) {
    throw toAppError(error);
  }
}

export async function signOutCurrentUser(): Promise<void> {
  try {
    await signOut(getFirebaseAuth());
  } catch (error) {
    throw toAppError(error);
  }
}

/**
 * Sends the "set your password" / "reset password" email.
 *
 * Used both by the forgot-password link and when an administrator creates an
 * employee account - the administrator never learns the password.
 */
export async function sendPasswordSetupEmail(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
  } catch (error) {
    throw toAppError(error);
  }
}

export async function getCurrentIdToken(forceRefresh = false): Promise<string | null> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken(forceRefresh);
  } catch (error) {
    throw toAppError(error);
  }
}
