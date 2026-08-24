import type { Id } from '@/types/common';

export interface ProvisionedAccount {
  uid: Id;
}

/**
 * Creation of Firebase Auth accounts for staff, behind an interface.
 *
 * Module 1 ships the client-side secondary-app implementation. Moving to a
 * Cloud Function with the Admin SDK later means adding one more implementation
 * of this interface and swapping the default export in `index.ts` - no change
 * to the user-management UI, hooks or profile service.
 */
export interface UserAccountProvisioner {
  /** Identifier used in logs and diagnostics. */
  readonly name: string;
  /**
   * Creates the sign-in account. Implementations must not disturb the session
   * of the administrator performing the action.
   */
  createAccount(email: string): Promise<ProvisionedAccount>;
  /** Emails a link so the employee sets their own password. */
  sendPasswordSetupEmail(email: string): Promise<void>;
  /**
   * Whether this implementation can delete or disable the underlying Auth
   * account. False for the client-side implementation; a Cloud Function
   * implementation would set it true.
   */
  readonly canManageAccountState: boolean;
}
