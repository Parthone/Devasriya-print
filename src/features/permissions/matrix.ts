import { ALL_PERMISSIONS, PERMISSIONS, type Permission } from '@/features/permissions/catalogue';
import type { UserRole } from '@/types/auth';

/**
 * Permissions reserved for the owner.
 *
 * These are the actions that could lock a business out of its own software, so
 * they never belong to a role that the owner can be talked into handing out.
 */
export const OWNER_ONLY_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.employeesManageAdmins,
  PERMISSIONS.settingsManage,
];

const SALES_PERMISSIONS: Permission[] = [
  PERMISSIONS.dashboardView,
  PERMISSIONS.customersView,
  PERMISSIONS.customersCreate,
  PERMISSIONS.customersEdit,
  PERMISSIONS.enquiriesView,
  PERMISSIONS.enquiriesCreate,
  PERMISSIONS.enquiriesEdit,
  PERMISSIONS.jobsView,
  PERMISSIONS.jobsCreate,
  PERMISSIONS.jobsEdit,
  PERMISSIONS.estimatesView,
  PERMISSIONS.estimatesCreate,
  PERMISSIONS.estimatesEdit,
  // Sales records the approval the customer gives, for estimates and artwork.
  PERMISSIONS.estimatesApprove,
  PERMISSIONS.designsView,
  PERMISSIONS.designsApprove,
  PERMISSIONS.productionView,
  PERMISSIONS.billingView,
  PERMISSIONS.inventoryView,
  PERMISSIONS.reportsView,
];

const DESIGNER_PERMISSIONS: Permission[] = [
  PERMISSIONS.dashboardView,
  PERMISSIONS.customersView,
  PERMISSIONS.enquiriesView,
  PERMISSIONS.jobsView,
  PERMISSIONS.designsView,
  PERMISSIONS.designsUpload,
  PERMISSIONS.productionView,
  PERMISSIONS.productionUpdate,
  PERMISSIONS.inventoryView,
];

const PRODUCTION_PERMISSIONS: Permission[] = [
  PERMISSIONS.dashboardView,
  PERMISSIONS.customersView,
  PERMISSIONS.enquiriesView,
  PERMISSIONS.jobsView,
  PERMISSIONS.jobsEdit,
  PERMISSIONS.designsView,
  PERMISSIONS.productionView,
  PERMISSIONS.productionUpdate,
  // Sees who is available to work on a job, but cannot change staff records.
  PERMISSIONS.employeesView,
  PERMISSIONS.inventoryView,
  PERMISSIONS.inventoryManage,
  PERMISSIONS.reportsView,
];

const ACCOUNTS_PERMISSIONS: Permission[] = [
  PERMISSIONS.dashboardView,
  PERMISSIONS.customersView,
  PERMISSIONS.jobsView,
  PERMISSIONS.estimatesView,
  PERMISSIONS.billingView,
  PERMISSIONS.billingCreate,
  PERMISSIONS.billingEdit,
  PERMISSIONS.inventoryView,
  PERMISSIONS.reportsView,
];

const VIEWER_PERMISSIONS: Permission[] = [
  PERMISSIONS.dashboardView,
  PERMISSIONS.customersView,
  PERMISSIONS.enquiriesView,
  PERMISSIONS.jobsView,
  PERMISSIONS.estimatesView,
  PERMISSIONS.designsView,
  PERMISSIONS.productionView,
  PERMISSIONS.reportsView,
];

const ADMIN_PERMISSIONS: Permission[] = ALL_PERMISSIONS.filter(
  (permission) => !OWNER_ONLY_PERMISSIONS.includes(permission),
);

/**
 * Default permissions per role.
 *
 * This is the single source of truth for who can do what. It is deliberately
 * data, not logic, so it can be rendered in the UI, asserted in tests, and one
 * day overridden from Settings.
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  owner: ALL_PERMISSIONS,
  admin: ADMIN_PERMISSIONS,
  sales: SALES_PERMISSIONS,
  designer: DESIGNER_PERMISSIONS,
  production: PRODUCTION_PERMISSIONS,
  accounts: ACCOUNTS_PERMISSIONS,
  viewer: VIEWER_PERMISSIONS,
};

/**
 * Per-role adjustments on top of the defaults.
 *
 * Nothing produces overrides yet - there is no override document and no editor.
 * The shape exists so that a future Settings screen (for example, granting
 * `jobs:assign` to a production supervisor) can be added without touching any
 * feature code: it will supply this object, and `resolvePermissions` will apply
 * it. Grants are applied first, then revocations, and owner always keeps
 * everything.
 */
export interface PermissionOverrides {
  granted?: Partial<Record<UserRole, readonly Permission[]>>;
  revoked?: Partial<Record<UserRole, readonly Permission[]>>;
}

/** Resolves the effective permissions for a role. */
export function resolvePermissions(
  role: UserRole,
  overrides?: PermissionOverrides,
): readonly Permission[] {
  // The owner is never restricted, by override or by anything else.
  if (role === 'owner') return ALL_PERMISSIONS;

  const granted = overrides?.granted?.[role] ?? [];
  const revoked = new Set(overrides?.revoked?.[role] ?? []);
  const effective = new Set<Permission>([...ROLE_PERMISSIONS[role], ...granted]);

  for (const permission of revoked) {
    effective.delete(permission);
  }

  // Owner-only permissions can never be granted to another role by override.
  for (const permission of OWNER_ONLY_PERMISSIONS) {
    effective.delete(permission);
  }

  return ALL_PERMISSIONS.filter((permission) => effective.has(permission));
}

/** Roles a user may assign to somebody else, given their own permissions. */
export function assignableRoles(canManageAdmins: boolean): UserRole[] {
  const roles: UserRole[] = ['sales', 'designer', 'production', 'accounts', 'viewer'];
  return canManageAdmins ? ['owner', 'admin', ...roles] : roles;
}
