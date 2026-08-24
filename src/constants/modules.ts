import { ROUTES } from '@/constants/routes';

export type ModuleStatus = 'done' | 'in-progress' | 'planned';

export interface ModuleDefinition {
  /** Module number used in the roadmap and in commit messages. */
  index: number;
  id: string;
  title: string;
  description: string;
  status: ModuleStatus;
  /** Route the module owns, when it has one. */
  route?: string;
  scope: string[];
}

/**
 * The build roadmap - one entry per module, in the order they will be built.
 *
 * This is the single source of truth referenced by docs/MODULES.md, the
 * dashboard roadmap card and the "not implemented" placeholder pages. Each
 * module flips its own status when it is delivered.
 */
export const MODULES: ModuleDefinition[] = [
  {
    index: 0,
    id: 'foundation',
    title: 'Project Foundation',
    description:
      'Build tooling, app shell, routing, Firebase integration layer, design system and shared types.',
    status: 'done',
    scope: [
      'Vite + React + TypeScript with strict compiler settings',
      'Tailwind CSS and shadcn/ui design tokens',
      'Routing, providers, error boundary and app shell',
      'Firebase client, emulator wiring and deny-all security rules',
      'Data-access layer, shared types, money and date formatting',
    ],
  },
  {
    index: 1,
    id: 'auth',
    title: 'Authentication & Users',
    description:
      'Firebase Authentication, employee profiles, sessions, route protection and staff account management.',
    status: 'done',
    route: ROUTES.users,
    scope: [
      'Email/password sign-in, sign-out and session restore',
      'Employee profile documents keyed to the Firebase Auth UID',
      'Protected routes with an admin-only staff directory',
      'Admin-created accounts with password setup by email',
      'Account activation and deactivation',
    ],
  },
  {
    index: 2,
    id: 'permissions',
    title: 'Roles & Permissions',
    description: 'Role-based access control across the UI and Firestore security rules.',
    status: 'planned',
    route: ROUTES.settings,
    scope: [
      'Role assignment per user',
      'Permission checks in the UI',
      'Matching Firestore and Storage rules',
      'Audit of who changed what',
    ],
  },
  {
    index: 3,
    id: 'customers',
    title: 'Customer Management',
    description: 'Customer records, contacts, GST details and history.',
    status: 'planned',
    route: ROUTES.customers,
    scope: [
      'Customer directory with search',
      'Contacts, addresses and GSTIN',
      'Credit terms and outstanding summary',
      'Per-customer job and billing history',
    ],
  },
  {
    index: 4,
    id: 'enquiries',
    title: 'Enquiries & Jobs',
    description: 'Enquiry intake and conversion into jobs and orders.',
    status: 'planned',
    route: ROUTES.enquiries,
    scope: [
      'Enquiry capture and follow-up',
      'Conversion to a job with a job number',
      'Job status lifecycle',
      'Linked customer, estimate and production records',
    ],
  },
  {
    index: 5,
    id: 'pricing',
    title: 'Measurements & Price Calculation',
    description: 'Custom print measurements with automatic price calculation.',
    status: 'planned',
    route: ROUTES.measurements,
    scope: [
      'Material and finishing rate cards',
      'Width x height area pricing with unit conversion',
      'Quantity slabs, wastage and minimum charges',
      'Taxes and per-job pricing breakdown',
    ],
  },
  {
    index: 6,
    id: 'estimates',
    title: 'Estimates & Quotations',
    description: 'Quotation documents, revisions, approval and PDF output.',
    status: 'planned',
    route: ROUTES.estimates,
    scope: [
      'Quotation builder from priced line items',
      'Versioning and revision history',
      'Customer approval status',
      'Printable and shareable quotation',
    ],
  },
  {
    index: 7,
    id: 'designs',
    title: 'Design Uploads & Approvals',
    description: 'Artwork uploads, proof revisions and customer approval trail.',
    status: 'planned',
    route: ROUTES.designs,
    scope: [
      'File uploads to Cloud Storage',
      'Revision history with previews',
      'Approval and rejection with remarks',
      'Locking approved artwork for production',
    ],
  },
  {
    index: 8,
    id: 'production',
    title: 'Department Workflow',
    description: 'Department-wise production stages and job movement.',
    status: 'planned',
    route: ROUTES.production,
    scope: [
      'Configurable departments and stages',
      'Job movement between departments',
      'Stage-level status and remarks',
      'Rework and hold handling',
    ],
  },
  {
    index: 9,
    id: 'assignments',
    title: 'Employee Assignment',
    description: 'Assigning jobs and stages to employees with workload visibility.',
    status: 'planned',
    scope: [
      'Employee records linked to users',
      'Job and stage assignment',
      'Workload per employee',
      'Handover and reassignment',
    ],
  },
  {
    index: 10,
    id: 'deadlines',
    title: 'Deadlines & Pending Work',
    description: 'Due dates, pending work queues and overdue alerts.',
    status: 'planned',
    route: ROUTES.scheduling,
    scope: [
      'Delivery dates per job and stage',
      'Pending and overdue queues',
      'Daily work list per department',
      'Escalation for missed deadlines',
    ],
  },
  {
    index: 11,
    id: 'billing',
    title: 'Billing & Payments',
    description: 'Invoices, advances, part payments and outstanding tracking.',
    status: 'planned',
    route: ROUTES.billing,
    scope: [
      'Invoice generation from completed jobs',
      'Advance and part payment recording',
      'Outstanding and ageing view',
      'Payment receipts',
    ],
  },
  {
    index: 12,
    id: 'inventory',
    title: 'Inventory & Materials',
    description: 'Material stock, consumption against jobs and reorder levels.',
    status: 'planned',
    route: ROUTES.inventory,
    scope: [
      'Material master with units and rates',
      'Stock in and stock out entries',
      'Consumption linked to jobs',
      'Low-stock alerts',
    ],
  },
  {
    index: 13,
    id: 'reports',
    title: 'Dashboard & Reports',
    description: 'Business dashboard and operational reports.',
    status: 'planned',
    route: ROUTES.reports,
    scope: [
      'Daily and monthly business summary',
      'Sales, production and outstanding reports',
      'Department and employee performance',
      'Export to CSV and print',
    ],
  },
];

export function getModuleByRoute(route: string): ModuleDefinition | undefined {
  return MODULES.find((module) => module.route === route);
}

export const MODULE_STATUS_LABELS: Record<ModuleStatus, string> = {
  done: 'Delivered',
  'in-progress': 'In progress',
  planned: 'Planned',
};
