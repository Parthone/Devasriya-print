import {
  BarChart3,
  Building2,
  Calculator,
  ShieldCheck,
  Boxes,
  CalendarClock,
  ClipboardList,
  Factory,
  FileText,
  Images,
  LayoutDashboard,
  MessageSquareText,
  Ruler,
  Settings,
  UserCog,
  Users,
  Wallet,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

/** Every route path in the application. Never hard-code a path in a component. */
export const ROUTES = {
  root: '/',
  login: '/login',
  dashboard: '/dashboard',
  customers: '/customers',
  customerDetail: '/customers/:customerId',
  enquiries: '/enquiries',
  enquiryDetail: '/enquiries/:enquiryId',
  jobs: '/jobs',
  jobDetail: '/jobs/:jobId',
  measurements: '/measurements',
  estimates: '/estimates',
  estimateDetail: '/estimates/:estimateId',
  designs: '/designs',
  designDetail: '/designs/:designId',
  portal: '/portal',
  portalLogin: '/portal/login',
  portalReview: '/portal/designs/:designId',
  production: '/production',
  scheduling: '/scheduling',
  billing: '/billing',
  inventory: '/inventory',
  reports: '/reports',
  settings: '/settings',
  users: '/settings/users',
  locations: '/settings/locations',
  products: '/settings/products',
  workflowStages: '/settings/workflow-stages',
  roles: '/settings/roles',
  forbidden: '/forbidden',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];

import type { Permission } from '@/features/permissions/catalogue';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  /** False until the module that owns this route is implemented. */
  enabled: boolean;
  /**
   * Permission required to see the link and to open the route. The sidebar
   * hides what a user cannot open, and the route guard enforces the same rule
   * for anyone typing the URL directly.
   */
  permission: Permission;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * Navigation model for the app shell.
 *
 * Items are listed with `enabled: false` so the roadmap is visible in the UI;
 * each module flips its own item to `true` when it is implemented.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      {
        label: 'Dashboard',
        path: ROUTES.dashboard,
        icon: LayoutDashboard,
        enabled: true,
        permission: 'dashboard:view',
      },
    ],
  },
  {
    title: 'Sales',
    items: [
      {
        label: 'Customers',
        path: ROUTES.customers,
        icon: Users,
        enabled: true,
        permission: 'customers:view',
      },
      {
        label: 'Enquiries',
        path: ROUTES.enquiries,
        icon: MessageSquareText,
        enabled: true,
        permission: 'enquiries:view',
      },
      {
        label: 'Jobs & Orders',
        path: ROUTES.jobs,
        icon: ClipboardList,
        enabled: true,
        permission: 'jobs:view',
      },
      {
        label: 'Measurements & Pricing',
        path: ROUTES.measurements,
        icon: Ruler,
        enabled: false,
        permission: 'estimates:view',
      },
      {
        label: 'Estimates',
        path: ROUTES.estimates,
        icon: FileText,
        enabled: true,
        permission: 'estimates:view',
      },
    ],
  },
  {
    title: 'Production',
    items: [
      {
        label: 'Designs & Approvals',
        path: ROUTES.designs,
        icon: Images,
        enabled: true,
        permission: 'designs:view',
      },
      {
        label: 'Production',
        path: ROUTES.production,
        icon: Factory,
        enabled: true,
        permission: 'production:view',
      },
      {
        label: 'Deadlines',
        path: ROUTES.scheduling,
        icon: CalendarClock,
        enabled: false,
        permission: 'production:view',
      },
      {
        label: 'Inventory',
        path: ROUTES.inventory,
        icon: Boxes,
        enabled: false,
        permission: 'inventory:view',
      },
    ],
  },
  {
    title: 'Business',
    items: [
      {
        label: 'Billing & Payments',
        path: ROUTES.billing,
        icon: Wallet,
        enabled: false,
        permission: 'billing:view',
      },
      {
        label: 'Employees',
        path: ROUTES.users,
        icon: UserCog,
        enabled: true,
        permission: 'employees:view',
      },
      {
        label: 'Pickup Offices',
        path: ROUTES.locations,
        icon: Building2,
        enabled: true,
        permission: 'settings:manage',
      },
      {
        label: 'Products & Rates',
        path: ROUTES.products,
        icon: Calculator,
        enabled: true,
        permission: 'settings:manage',
      },
      {
        label: 'Production Stages',
        path: ROUTES.workflowStages,
        icon: Workflow,
        enabled: true,
        permission: 'settings:manage',
      },
      {
        label: 'Roles & Permissions',
        path: ROUTES.roles,
        icon: ShieldCheck,
        enabled: true,
        permission: 'settings:view',
      },
      {
        label: 'Reports',
        path: ROUTES.reports,
        icon: BarChart3,
        enabled: false,
        permission: 'reports:view',
      },
      {
        label: 'Settings',
        path: ROUTES.settings,
        icon: Settings,
        enabled: false,
        permission: 'settings:view',
      },
    ],
  },
];
