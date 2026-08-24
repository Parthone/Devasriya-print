import { describe, expect, it } from 'vitest';

import { ALL_PERMISSIONS, PERMISSIONS, type Permission } from '@/features/permissions/catalogue';
import { hasAllPermissions, hasAnyPermission, hasPermission } from '@/features/permissions/helpers';
import {
  assignableRoles,
  OWNER_ONLY_PERMISSIONS,
  resolvePermissions,
  ROLE_PERMISSIONS,
} from '@/features/permissions/matrix';
import { USER_ROLES, type UserRole } from '@/types/auth';

/**
 * The approved permission matrix, written out independently of the source.
 *
 * If a permission is added or moved, this table must be updated deliberately -
 * that is the point: an accidental widening of access fails the build.
 */
const EXPECTED: Record<UserRole, Permission[]> = {
  owner: [...ALL_PERMISSIONS],
  admin: ALL_PERMISSIONS.filter(
    (permission) => !['employees:manage-admins', 'settings:manage'].includes(permission),
  ),
  sales: [
    'dashboard:view',
    'customers:view',
    'customers:create',
    'customers:edit',
    'enquiries:view',
    'enquiries:create',
    'enquiries:edit',
    'jobs:view',
    'jobs:create',
    'jobs:edit',
    'estimates:view',
    'estimates:create',
    'estimates:edit',
    'estimates:approve',
    'designs:view',
    'designs:approve',
    'production:view',
    'billing:view',
    'inventory:view',
    'reports:view',
  ],
  designer: [
    'dashboard:view',
    'customers:view',
    'enquiries:view',
    'jobs:view',
    'designs:view',
    'designs:upload',
    'production:view',
    'production:update',
    'inventory:view',
  ],
  production: [
    'dashboard:view',
    'customers:view',
    'enquiries:view',
    'jobs:view',
    'jobs:edit',
    'designs:view',
    'production:view',
    'production:update',
    'employees:view',
    'inventory:view',
    'inventory:manage',
    'reports:view',
  ],
  accounts: [
    'dashboard:view',
    'customers:view',
    'jobs:view',
    'estimates:view',
    'billing:view',
    'billing:create',
    'billing:edit',
    'inventory:view',
    'reports:view',
  ],
  viewer: [
    'dashboard:view',
    'customers:view',
    'enquiries:view',
    'jobs:view',
    'estimates:view',
    'designs:view',
    'production:view',
    'reports:view',
  ],
};

describe('permission matrix', () => {
  it.each(USER_ROLES)('grants %s exactly the approved permissions', (role) => {
    expect([...resolvePermissions(role)].sort()).toEqual([...EXPECTED[role]].sort());
  });

  it.each(USER_ROLES)('denies %s every permission outside its row', (role) => {
    const granted = new Set(resolvePermissions(role));
    const denied = ALL_PERMISSIONS.filter((permission) => !EXPECTED[role].includes(permission));
    for (const permission of denied) {
      expect(granted.has(permission)).toBe(false);
    }
  });

  it('gives the owner every permission in the catalogue', () => {
    expect(resolvePermissions('owner')).toHaveLength(ALL_PERMISSIONS.length);
  });

  it('reserves owner-only permissions for the owner', () => {
    for (const permission of OWNER_ONLY_PERMISSIONS) {
      for (const role of USER_ROLES) {
        expect(resolvePermissions(role).includes(permission)).toBe(role === 'owner');
      }
    }
  });

  it('gives admin everything except the owner-only permissions', () => {
    const admin = resolvePermissions('admin');
    expect(admin).toHaveLength(ALL_PERMISSIONS.length - OWNER_ONLY_PERMISSIONS.length);
    expect(admin).toContain(PERMISSIONS.employeesManage);
    expect(admin).not.toContain(PERMISSIONS.employeesManageAdmins);
    expect(admin).not.toContain(PERMISSIONS.settingsManage);
  });

  it('keeps job assignment with owner and admin only', () => {
    for (const role of USER_ROLES) {
      const expected = role === 'owner' || role === 'admin';
      expect(resolvePermissions(role).includes(PERMISSIONS.jobsAssign)).toBe(expected);
    }
  });

  it('lets production see employees but never manage them', () => {
    const production = resolvePermissions('production');
    expect(production).toContain(PERMISSIONS.employeesView);
    expect(production).not.toContain(PERMISSIONS.employeesManage);
  });

  it('lets sales record customer approvals', () => {
    const sales = resolvePermissions('sales');
    expect(sales).toContain(PERMISSIONS.estimatesApprove);
    expect(sales).toContain(PERMISSIONS.designsApprove);
  });

  it('gives every role the dashboard and nothing to a signed-out user', () => {
    for (const role of USER_ROLES) {
      expect(resolvePermissions(role)).toContain(PERMISSIONS.dashboardView);
    }
    expect(hasPermission([], PERMISSIONS.dashboardView)).toBe(false);
  });

  it('exposes the same data through ROLE_PERMISSIONS', () => {
    for (const role of USER_ROLES) {
      expect([...ROLE_PERMISSIONS[role]].sort()).toEqual([...resolvePermissions(role)].sort());
    }
  });
});

describe('overrides (not exposed yet, but the resolver honours them)', () => {
  it('can grant an extra permission to a role, such as a production supervisor', () => {
    const resolved = resolvePermissions('production', {
      granted: { production: [PERMISSIONS.jobsAssign] },
    });
    expect(resolved).toContain(PERMISSIONS.jobsAssign);
    // Everything else stays as the default matrix says.
    expect(resolved).toContain(PERMISSIONS.productionUpdate);
    expect(resolved).not.toContain(PERMISSIONS.billingCreate);
  });

  it('can revoke a default permission', () => {
    const resolved = resolvePermissions('sales', {
      revoked: { sales: [PERMISSIONS.estimatesApprove] },
    });
    expect(resolved).not.toContain(PERMISSIONS.estimatesApprove);
    expect(resolved).toContain(PERMISSIONS.estimatesCreate);
  });

  it('never lets an override hand out an owner-only permission', () => {
    const resolved = resolvePermissions('admin', {
      granted: { admin: [PERMISSIONS.settingsManage, PERMISSIONS.employeesManageAdmins] },
    });
    expect(resolved).not.toContain(PERMISSIONS.settingsManage);
    expect(resolved).not.toContain(PERMISSIONS.employeesManageAdmins);
  });

  it('never restricts the owner', () => {
    const resolved = resolvePermissions('owner', {
      revoked: { owner: [PERMISSIONS.employeesManage, PERMISSIONS.dashboardView] },
    });
    expect(resolved).toHaveLength(ALL_PERMISSIONS.length);
  });
});

describe('assignableRoles', () => {
  it('hides owner and admin from someone without employees:manage-admins', () => {
    expect(assignableRoles(false)).toEqual([
      'sales',
      'designer',
      'production',
      'accounts',
      'viewer',
    ]);
  });

  it('offers every role to the owner', () => {
    expect(assignableRoles(true)).toContain('owner');
    expect(assignableRoles(true)).toContain('admin');
  });
});

describe('permission helpers', () => {
  const permissions: Permission[] = ['jobs:view', 'jobs:edit'];

  it('checks a single permission', () => {
    expect(hasPermission(permissions, 'jobs:edit')).toBe(true);
    expect(hasPermission(permissions, 'jobs:assign')).toBe(false);
  });

  it('treats an absent requirement as allowed', () => {
    expect(hasPermission(permissions, undefined)).toBe(true);
    expect(hasAllPermissions(permissions, [])).toBe(true);
    expect(hasAnyPermission(permissions, [])).toBe(true);
  });

  it('checks all and any', () => {
    expect(hasAllPermissions(permissions, ['jobs:view', 'jobs:edit'])).toBe(true);
    expect(hasAllPermissions(permissions, ['jobs:view', 'jobs:assign'])).toBe(false);
    expect(hasAnyPermission(permissions, ['jobs:assign', 'jobs:view'])).toBe(true);
    expect(hasAnyPermission(permissions, ['billing:view'])).toBe(false);
  });
});
