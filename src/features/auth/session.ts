import { toCustomerSession, type CustomerAccount } from '@/features/customer-portal/types';
import { resolvePermissions } from '@/features/permissions/matrix';
import {
  isAdminRole,
  type AuthAccount,
  type AuthenticatedUser,
  type ResolvedSession,
  type UserProfile,
} from '@/types/auth';

export interface ResolveSessionInput {
  /** The Firebase Auth account, or null when signed out. */
  account: AuthAccount | null;
  /** The Firestore profile for that account, or null when it is missing. */
  profile: UserProfile | null;
  /**
   * The portal account for that uid, when the uid belongs to a customer rather
   * than an employee. Only looked up once the staff profile has come back
   * empty, so an ordinary staff sign-in costs no extra read.
   */
  customerAccount?: CustomerAccount | null;
}

/**
 * Decides whether an authenticated Firebase user is allowed into the app.
 *
 * Pure on purpose: this is the security decision of the whole module, so it is
 * unit tested directly rather than only through the UI. Authentication alone is
 * never enough - a user must also have a profile document, and that profile
 * must be active.
 */
export function resolveSession({
  account,
  profile,
  customerAccount = null,
}: ResolveSessionInput): ResolvedSession {
  if (!account) {
    return { status: 'unauthenticated', rejection: null };
  }

  if (profile) {
    if (!profile.isActive) {
      return { status: 'unauthenticated', rejection: 'inactive' };
    }
    return { status: 'authenticated', user: toAuthenticatedUser(account, profile) };
  }

  // No employee profile. The uid may still be a customer with a portal login,
  // which is a session of an entirely different kind: no role, no permissions
  // and no route into the staff application.
  if (customerAccount) {
    if (!customerAccount.isActive) {
      return { status: 'unauthenticated', rejection: 'inactive' };
    }
    return { status: 'customer', customer: toCustomerSession(customerAccount, account.email) };
  }

  return { status: 'unauthenticated', rejection: 'no-profile' };
}

export function toAuthenticatedUser(account: AuthAccount, profile: UserProfile): AuthenticatedUser {
  return {
    uid: account.uid,
    email: account.email ?? profile.email,
    name: profile.name,
    role: profile.role,
    isAdmin: isAdminRole(profile.role),
    permissions: resolvePermissions(profile.role),
    profile,
  };
}
