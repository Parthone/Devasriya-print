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
  invoiceDetail: '/billing/:invoiceId',
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
 * Every item leads to a screen that exists. While the roadmap was being built
 * items carried an `enabled` flag and unbuilt ones rendered a placeholder; the
 * roadmap is finished, so both are gone.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      {
        label: 'Dashboard',
        path: ROUTES.dashboard,
        icon: LayoutDashboard,
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
        permission: 'customers:view',
      },
      {
        label: 'Enquiries',
        path: ROUTES.enquiries,
        icon: MessageSquareText,
        permission: 'enquiries:view',
      },
      {
        label: 'Jobs & Orders',
        path: ROUTES.jobs,
        icon: ClipboardList,
        permission: 'jobs:view',
      },
      {
        label: 'Estimates',
        path: ROUTES.estimates,
        icon: FileText,
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
        permission: 'designs:view',
      },
      {
        label: 'Production',
        path: ROUTES.production,
        icon: Factory,
        permission: 'production:view',
      },
      {
        label: 'Deadlines',
        path: ROUTES.scheduling,
        icon: CalendarClock,
        permission: 'production:view',
      },
      {
        label: 'Inventory',
        path: ROUTES.inventory,
        icon: Boxes,
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
        permission: 'billing:view',
      },
      {
        label: 'Employees',
        path: ROUTES.users,
        icon: UserCog,
        permission: 'employees:view',
      },
      {
        label: 'Pickup Offices',
        path: ROUTES.locations,
        icon: Building2,
        permission: 'settings:manage',
      },
      {
        label: 'Products & Rates',
        path: ROUTES.products,
        icon: Calculator,
        permission: 'settings:manage',
      },
      {
        label: 'Production Stages',
        path: ROUTES.workflowStages,
        icon: Workflow,
        permission: 'settings:manage',
      },
      {
        label: 'Roles & Permissions',
        path: ROUTES.roles,
        icon: ShieldCheck,
        permission: 'settings:view',
      },
      {
        label: 'Reports',
        path: ROUTES.reports,
        icon: BarChart3,
        permission: 'reports:view',
      },
      {
        label: 'Settings',
        path: ROUTES.settings,
        icon: Settings,
        permission: 'settings:view',
      },
    ],
  },
];
