import type { Department, Designation } from '@/constants/organization';
import type { Entity, Id } from '@/types/common';

/**
 * Role vocabulary.
 *
 * Module 1 gates on the role only (admin area vs everything else). Module 2
 * layers granular permissions on top of exactly these role values.
 */
export const USER_ROLES = [
  'owner',
  'admin',
  'sales',
  'designer',
  'production',
  'accounts',
  'viewer',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Owner',
  admin: 'Administrator',
  sales: 'Sales / Front Desk',
  designer: 'Designer',
  production: 'Production',
  accounts: 'Accounts',
  viewer: 'Viewer',
};

/** Roles allowed to manage staff accounts. Mirrored in firestore.rules. */
export const ADMIN_ROLES: readonly UserRole[] = ['owner', 'admin'];

export function isAdminRole(role: UserRole): boolean {
  return ADMIN_ROLES.includes(role);
}

/** `resource:action`, e.g. "job:create". Enforced from Module 2. */
export type Permission = `${string}:${string}`;

/**
 * Firestore profile document at `users/{uid}`. The document id is always the
 * Firebase Auth UID - that link is what the security rules are built on.
 */
export interface UserProfile extends Entity {
  name: string;
  email: string;
  /** Ten digit Indian mobile number, stored without country code. */
  mobile: string;
  designation: Designation;
  department: Department;
  role: UserRole;
  isActive: boolean;
}

/** The Firebase Auth account, independent of the Firestore profile. */
export interface AuthAccount {
  uid: Id;
  email: string | null;
}

/** A fully resolved, allowed-in user: Auth account plus an active profile. */
export interface AuthenticatedUser {
  uid: Id;
  email: string;
  name: string;
  role: UserRole;
  isAdmin: boolean;
  profile: UserProfile;
}

/** Why an authenticated Firebase user is still not allowed into the app. */
export type SessionRejectionReason = 'no-profile' | 'inactive';

/** A session that has finished resolving: either allowed in, or not. */
export type ResolvedSession =
  | { status: 'unauthenticated'; rejection: SessionRejectionReason | null }
  | { status: 'authenticated'; user: AuthenticatedUser };

export type SessionState = { status: 'loading' } | ResolvedSession;

export const SESSION_REJECTION_MESSAGES: Record<SessionRejectionReason, string> = {
  'no-profile':
    'This account has no employee profile. Ask an administrator to set up your account.',
  inactive: 'This account has been deactivated. Contact an administrator.',
};
