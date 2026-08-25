import { getSupabase } from '@/lib/supabase/client';
import { toAppError } from '@/lib/supabase/errors';
import type { AuthAccount } from '@/types/auth';
import { AppError } from '@/types/common';

function toAccount(user: { id: string; email?: string | null }): AuthAccount {
  return { uid: user.id, email: user.email ?? null };
}

/**
 * Session persistence.
 *
 * Configured once when the client is created: Supabase keeps a refresh token
 * (never the password) in local storage and rotates the access token in the
 * background, which is what a shop-floor application needs across refreshes and
 * browser restarts. This function stays for the callers that expect it.
 */
export async function ensurePersistence(): Promise<void> {
  getSupabase();
  return Promise.resolve();
}

/** Fires immediately with the restored session, then on every change. */
export function observeAuthState(listener: (account: AuthAccount | null) => void): () => void {
  const supabase = getSupabase();

  // onAuthStateChange fires on subscribe only once the client has finished
  // reading storage, so the initial session is fetched explicitly to match the
  // "fires immediately" contract the session provider is written against.
  let settled = false;
  void supabase.auth.getSession().then(({ data }) => {
    if (settled) return;
    settled = true;
    listener(data.session ? toAccount(data.session.user) : null);
  });

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    settled = true;
    listener(session ? toAccount(session.user) : null);
  });

  return () => {
    data.subscription.unsubscribe();
  };
}

export async function signInWithEmail(email: string, password: string): Promise<AuthAccount> {
  try {
    const { data, error } = await getSupabase().auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw error;
    if (!data.user) throw new AppError('unauthenticated', 'Sign in did not complete.');
    return toAccount(data.user);
  } catch (error) {
    throw toAppError(error);
  }
}

export async function signOutCurrentUser(): Promise<void> {
  try {
    const { error } = await getSupabase().auth.signOut();
    if (error) throw error;
  } catch (error) {
    throw toAppError(error);
  }
}

/**
 * Sends the "set your password" / "reset password" email.
 *
 * The same link serves both: a new employee or customer has an account with a
 * password nobody knows, and this is how they choose one. Deliberately silent
 * about whether the address exists - answering that would turn the sign-in
 * screen into a way of finding out who works here.
 */
export async function sendPasswordSetupEmail(email: string): Promise<void> {
  try {
    const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/login`,
    });
    if (error) throw error;
  } catch (error) {
    throw toAppError(error);
  }
}

/** Sets a new password for the signed-in user, after a reset link. */
export async function updatePassword(password: string): Promise<void> {
  try {
    const { error } = await getSupabase().auth.updateUser({ password });
    if (error) throw error;
  } catch (error) {
    throw toAppError(error);
  }
}

/** The current access token, for callers that need to talk to an Edge Function. */
export async function getCurrentIdToken(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}
