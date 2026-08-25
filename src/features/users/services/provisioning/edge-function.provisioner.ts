import { getCurrentIdToken, sendPasswordSetupEmail } from '@/features/auth/services/auth.service';
import type {
  ProvisionedAccount,
  UserAccountProvisioner,
} from '@/features/users/services/provisioning/types';
import { parseSupabaseEnv } from '@/config/env';
import { getSupabase } from '@/lib/supabase/client';
import { toAppError } from '@/lib/supabase/errors';
import { AppError } from '@/types/common';

/** Which kind of principal the new account will be. Decided server side. */
export type ProvisionKind = 'staff' | 'customer';

/**
 * Creates sign-in accounts through the `provision-account` Edge Function.
 *
 * Creating an auth user needs the service role key, and that key bypasses every
 * row level security policy in the database - it can never be in the browser
 * bundle. So the browser asks a server-side function, which checks the caller
 * may do this before it touches the key.
 *
 * The account is created with a throwaway password and the person is emailed a
 * link to choose their own, so nobody here ever knows anybody else's password.
 */
async function provision(email: string, kind: ProvisionKind): Promise<ProvisionedAccount> {
  const config = parseSupabaseEnv();
  if (!config.ok) throw new AppError('invalid-input', config.message);

  const token = await getCurrentIdToken();
  if (!token) throw new AppError('unauthenticated', 'You are signed out. Please sign in again.');

  try {
    const response = await getSupabase().functions.invoke('provision-account', {
      body: { email: email.trim().toLowerCase(), kind },
    });

    if (response.error) throw response.error;

    const body = response.data as { uid?: string; error?: string } | null;
    if (!body?.uid) {
      throw new AppError('unknown', body?.error ?? 'The account could not be created.');
    }
    return { uid: body.uid };
  } catch (error) {
    throw toAppError(error);
  }
}

export const edgeFunctionProvisioner: UserAccountProvisioner = {
  name: 'edge-function',
  // The function holds the service role key, so it can disable and remove
  // accounts as well as create them.
  canManageAccountState: true,

  createAccount(email: string): Promise<ProvisionedAccount> {
    return provision(email, 'staff');
  },

  createCustomerAccount(email: string): Promise<ProvisionedAccount> {
    return provision(email, 'customer');
  },

  sendPasswordSetupEmail(email: string): Promise<void> {
    return sendPasswordSetupEmail(email);
  },
};
