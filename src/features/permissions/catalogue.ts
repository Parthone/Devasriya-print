/**
 * The permission catalogue.
 *
 * Every capability in the application is named here exactly once, as
 * `resource:action`. Feature code refers to these constants rather than string
 * literals, so a typo is a compile error and the full surface of the system is
 * visible in one file.
 *
 * Adding a permission: add it to PERMISSIONS, give it a label, and grant it in
 * the role matrix (src/features/permissions/matrix.ts).
 */
export const PERMISSIONS = {
  dashboardView: 'dashboard:view',

  customersView: 'customers:view',
  customersCreate: 'customers:create',
  customersEdit: 'customers:edit',

  enquiriesView: 'enquiries:view',
  enquiriesCreate: 'enquiries:create',
  enquiriesEdit: 'enquiries:edit',

  jobsView: 'jobs:view',
  jobsCreate: 'jobs:create',
  jobsEdit: 'jobs:edit',
  jobsAssign: 'jobs:assign',

  estimatesView: 'estimates:view',
  estimatesCreate: 'estimates:create',
  estimatesEdit: 'estimates:edit',
  estimatesApprove: 'estimates:approve',

  designsView: 'designs:view',
  designsUpload: 'designs:upload',
  designsApprove: 'designs:approve',

  productionView: 'production:view',
  productionUpdate: 'production:update',

  employeesView: 'employees:view',
  employeesManage: 'employees:manage',
  employeesManageAdmins: 'employees:manage-admins',

  billingView: 'billing:view',
  billingCreate: 'billing:create',
  billingEdit: 'billing:edit',

  inventoryView: 'inventory:view',
  inventoryManage: 'inventory:manage',

  reportsView: 'reports:view',

  settingsView: 'settings:view',
  settingsManage: 'settings:manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS);

/** Human readable names, used by the roles reference screen and tooltips. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  'dashboard:view': 'View dashboard',

  'customers:view': 'View customers',
  'customers:create': 'Add customers',
  'customers:edit': 'Edit customers',

  'enquiries:view': 'View enquiries',
  'enquiries:create': 'Add enquiries',
  'enquiries:edit': 'Edit enquiries',

  'jobs:view': 'View jobs',
  'jobs:create': 'Create jobs',
  'jobs:edit': 'Edit jobs',
  'jobs:assign': 'Assign jobs to employees',

  'estimates:view': 'View estimates',
  'estimates:create': 'Create estimates',
  'estimates:edit': 'Edit estimates',
  'estimates:approve': 'Record estimate approval',

  'designs:view': 'View designs',
  'designs:upload': 'Upload designs',
  'designs:approve': 'Record design approval',

  'production:view': 'View production',
  'production:update': 'Update production status',

  'employees:view': 'View employees',
  'employees:manage': 'Add and edit employees',
  'employees:manage-admins': 'Assign owner and admin roles',

  'billing:view': 'View billing',
  'billing:create': 'Create invoices and payments',
  'billing:edit': 'Edit invoices and payments',

  'inventory:view': 'View inventory',
  'inventory:manage': 'Manage stock and materials',

  'reports:view': 'View reports',

  'settings:view': 'View settings',
  'settings:manage': 'Change business settings',
};

/** Grouping used to present permissions in a readable order. */
export const PERMISSION_GROUPS: { title: string; permissions: Permission[] }[] = [
  { title: 'Overview', permissions: [PERMISSIONS.dashboardView, PERMISSIONS.reportsView] },
  {
    title: 'Sales',
    permissions: [
      PERMISSIONS.customersView,
      PERMISSIONS.customersCreate,
      PERMISSIONS.customersEdit,
      PERMISSIONS.enquiriesView,
      PERMISSIONS.enquiriesCreate,
      PERMISSIONS.enquiriesEdit,
      PERMISSIONS.estimatesView,
      PERMISSIONS.estimatesCreate,
      PERMISSIONS.estimatesEdit,
      PERMISSIONS.estimatesApprove,
    ],
  },
  {
    title: 'Production',
    permissions: [
      PERMISSIONS.jobsView,
      PERMISSIONS.jobsCreate,
      PERMISSIONS.jobsEdit,
      PERMISSIONS.jobsAssign,
      PERMISSIONS.designsView,
      PERMISSIONS.designsUpload,
      PERMISSIONS.designsApprove,
      PERMISSIONS.productionView,
      PERMISSIONS.productionUpdate,
      PERMISSIONS.inventoryView,
      PERMISSIONS.inventoryManage,
    ],
  },
  {
    title: 'Business',
    permissions: [
      PERMISSIONS.billingView,
      PERMISSIONS.billingCreate,
      PERMISSIONS.billingEdit,
      PERMISSIONS.employeesView,
      PERMISSIONS.employeesManage,
      PERMISSIONS.employeesManageAdmins,
      PERMISSIONS.settingsView,
      PERMISSIONS.settingsManage,
    ],
  },
];
