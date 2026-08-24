import {
  BarChart3,
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
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/** Every route path in the application. Never hard-code a path in a component. */
export const ROUTES = {
  root: '/',
  login: '/login',
  dashboard: '/dashboard',
  customers: '/customers',
  enquiries: '/enquiries',
  jobs: '/jobs',
  measurements: '/measurements',
  estimates: '/estimates',
  designs: '/designs',
  production: '/production',
  scheduling: '/scheduling',
  billing: '/billing',
  inventory: '/inventory',
  reports: '/reports',
  settings: '/settings',
  forbidden: '/forbidden',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  /** False until the module that owns this route is implemented. */
  enabled: boolean;
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
    items: [{ label: 'Dashboard', path: ROUTES.dashboard, icon: LayoutDashboard, enabled: true }],
  },
  {
    title: 'Sales',
    items: [
      { label: 'Customers', path: ROUTES.customers, icon: Users, enabled: false },
      { label: 'Enquiries', path: ROUTES.enquiries, icon: MessageSquareText, enabled: false },
      { label: 'Jobs & Orders', path: ROUTES.jobs, icon: ClipboardList, enabled: false },
      { label: 'Measurements & Pricing', path: ROUTES.measurements, icon: Ruler, enabled: false },
      { label: 'Estimates', path: ROUTES.estimates, icon: FileText, enabled: false },
    ],
  },
  {
    title: 'Production',
    items: [
      { label: 'Designs & Approvals', path: ROUTES.designs, icon: Images, enabled: false },
      { label: 'Departments', path: ROUTES.production, icon: Factory, enabled: false },
      { label: 'Deadlines', path: ROUTES.scheduling, icon: CalendarClock, enabled: false },
      { label: 'Inventory', path: ROUTES.inventory, icon: Boxes, enabled: false },
    ],
  },
  {
    title: 'Business',
    items: [
      { label: 'Billing & Payments', path: ROUTES.billing, icon: Wallet, enabled: false },
      { label: 'Reports', path: ROUTES.reports, icon: BarChart3, enabled: false },
      { label: 'Settings', path: ROUTES.settings, icon: Settings, enabled: false },
    ],
  },
];
