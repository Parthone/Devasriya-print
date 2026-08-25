import type { ReactNode } from 'react';

import type { Permission } from '@/features/permissions/catalogue';
import { usePermissions } from '@/features/permissions/hooks/use-permissions';

interface CanProps {
  /** Single permission required to render the children. */
  permission?: Permission;
  /** All of these permissions are required. */
  all?: readonly Permission[];
  /** Any one of these permissions is enough. */
  any?: readonly Permission[];
  /** Rendered when the check fails. Nothing by default. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Renders children only when the signed-in user holds the permission.
 *
 * This hides UI; it does not secure anything on its own. Every gated action
 * must also be enforced by a route guard and by a row level security policy.
 */
export function Can({ permission, all, any, fallback = null, children }: CanProps) {
  const { can, canAll, canAny } = usePermissions();

  const allowed =
    (permission ? can(permission) : true) &&
    (all ? canAll(all) : true) &&
    (any ? canAny(any) : true);

  return <>{allowed ? children : fallback}</>;
}

/** Alias, for code that reads better as a gate than as a sentence. */
export const PermissionGate = Can;
