import type { Id } from '@/types/common';

/**
 * Placeholder role & permission shapes.
 *
 * MODULE 0 defines the vocabulary only - nothing enforces these yet. The
 * authentication and permissions module implements assignment, enforcement in
 * the UI, and the matching Firestore security rules.
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

/** `resource:action`, e.g. "job:create", "invoice:approve". */
export type Permission = `${string}:${string}`;

/** The signed-in user as the UI sees it. Populated by the auth module. */
export interface AuthUser {
  uid: Id;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  permissions: Permission[];
  isActive: boolean;
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';
