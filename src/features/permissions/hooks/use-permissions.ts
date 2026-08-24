import { useMemo } from 'react';

import { useAuth } from '@/features/auth/hooks/use-auth';
import type { Permission } from '@/features/permissions/catalogue';
import { hasAllPermissions, hasAnyPermission, hasPermission } from '@/features/permissions/helpers';

export interface PermissionsApi {
  permissions: readonly Permission[];
  can: (permission: Permission) => boolean;
  canAll: (permissions: readonly Permission[]) => boolean;
  canAny: (permissions: readonly Permission[]) => boolean;
}

const NONE: readonly Permission[] = [];

/**
 * Permissions of the signed-in user.
 *
 * Safe to call anywhere: a signed-out user simply has no permissions, so
 * `can()` is false rather than throwing.
 */
export function usePermissions(): PermissionsApi {
  const { session } = useAuth();
  const permissions = session.status === 'authenticated' ? session.user.permissions : NONE;

  return useMemo(
    () => ({
      permissions,
      can: (permission: Permission) => hasPermission(permissions, permission),
      canAll: (required: readonly Permission[]) => hasAllPermissions(permissions, required),
      canAny: (required: readonly Permission[]) => hasAnyPermission(permissions, required),
    }),
    [permissions],
  );
}

/** Convenience for a single check: `const canEdit = usePermission('jobs:edit')`. */
export function usePermission(permission: Permission): boolean {
  const { can } = usePermissions();
  return can(permission);
}
