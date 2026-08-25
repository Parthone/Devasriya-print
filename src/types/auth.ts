import type { Department, Designation } from '@/constants/organization';
import type { CustomerSession } from '@/features/customer-portal/types';
import type { Permission } from '@/features/permissions/catalogue';
import type { Entity, Id } from '@/types/common';

export type { Permission };

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

/** Roles allowed to manage staff accounts. Mirrored in the RLS policies. */
export const ADMIN_ROLES: readonly UserRole[] = ['owner', 'admin'];

export function isAdminRole(role: UserRole): boolean {
  return ADMIN_ROLES.includes(role);
}

/**
 * The employee profile row at `staff_profiles`. Its primary key is always the
 * Supabase Auth uid - that link is what the security policies are built on.
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

/** The Supabase Auth account, independent of the profile row. */
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
  /** Owner or admin. Convenience only - authorise with `permissions`. */
  isAdmin: boolean;
  /** Effective permissions, resolved from the role matrix. */
  permissions: readonly Permission[];
  profile: UserProfile;
}

/** Why an authenticated user is still not allowed into the app. */
export type SessionRejectionReason = 'no-profile' | 'inactive';

/**
 * A session that has finished resolving.
 *
 * `authenticated` is a staff member; `customer` is somebody signed in to the
 * review portal. They are separate variants on purpose: a customer has no role
 * and no permissions, so there is no way to write a check that accidentally
 * treats one as the other. Existing staff code narrows on `'authenticated'` and
 * is unaffected by the customer variant.
 */
export type ResolvedSession =
  | { status: 'unauthenticated'; rejection: SessionRejectionReason | null }
  | { status: 'authenticated'; user: AuthenticatedUser }
  | { status: 'customer'; customer: CustomerSession };

export type SessionState = { status: 'loading' } | ResolvedSession;

export const SESSION_REJECTION_MESSAGES: Record<SessionRejectionReason, string> = {
  'no-profile':
    'This account has no employee profile. Ask an administrator to set up your account.',
  inactive: 'This account has been deactivated. Contact an administrator.',
};
