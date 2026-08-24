import type { Permission } from '@/features/permissions/catalogue';

/** True when the permission list contains the required permission. */
export function hasPermission(
  permissions: readonly Permission[],
  required: Permission | undefined,
): boolean {
  if (!required) return true;
  return permissions.includes(required);
}

export function hasAllPermissions(
  permissions: readonly Permission[],
  required: readonly Permission[],
): boolean {
  return required.every((permission) => hasPermission(permissions, permission));
}

export function hasAnyPermission(
  permissions: readonly Permission[],
  required: readonly Permission[],
): boolean {
  if (required.length === 0) return true;
  return required.some((permission) => hasPermission(permissions, permission));
}
