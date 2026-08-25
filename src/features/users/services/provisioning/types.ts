import type { Id } from '@/types/common';

export interface ProvisionedAccount {
  uid: Id;
}

/**
 * Creation of sign-in accounts, behind an interface.
 *
 * The production implementation calls a server-side Edge Function, because
 * creating an auth user needs the service role key and that key bypasses every
 * security policy in the database. Demo mode substitutes a local stand-in.
 * Neither the user-management UI, the hooks nor the profile service knows which
 * one it is talking to.
 */
export interface UserAccountProvisioner {
  /** Identifier used in logs and diagnostics. */
  readonly name: string;
  /**
   * Creates the sign-in account. Implementations must not disturb the session
   * of the administrator performing the action.
   */
  createAccount(email: string): Promise<ProvisionedAccount>;
  /** Creates the sign-in account for a customer portal login. */
  createCustomerAccount(email: string): Promise<ProvisionedAccount>;
  /** Emails a link so the person sets their own password. */
  sendPasswordSetupEmail(email: string): Promise<void>;
  /**
   * Whether this implementation can delete or disable the underlying auth
   * account. True for the Edge Function, which holds the service role key.
   */
  readonly canManageAccountState: boolean;
}
