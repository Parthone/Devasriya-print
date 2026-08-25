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
      'Build tooling, app shell, routing, backend integration layer, design system and shared types.',
    status: 'done',
    scope: [
      'Vite + React + TypeScript with strict compiler settings',
      'Tailwind CSS and shadcn/ui design tokens',
      'Routing, providers, error boundary and app shell',
      'Supabase client, SQL migrations and deny-all row level security',
      'Data-access layer, shared types, money and date formatting',
    ],
  },
  {
    index: 1,
    id: 'auth',
    title: 'Authentication & Users',
    description:
      'Supabase Authentication, employee profiles, sessions, route protection and staff account management.',
    status: 'done',
    route: ROUTES.users,
    scope: [
      'Email/password sign-in, sign-out and session restore',
      'Employee profile rows keyed to the Supabase Auth uid',
      'Protected routes with an admin-only staff directory',
      'Admin-created accounts with password setup by email',
      'Account activation and deactivation',
    ],
  },
  {
    index: 2,
    id: 'permissions',
    title: 'Roles & Permissions',
    description:
      'Granular permission catalogue, permission-guarded routes and navigation, matching security rules and an audit trail.',
    status: 'done',
    route: ROUTES.roles,
    scope: [
      'Typed permission catalogue and default role matrix',
      'Permission helpers, hooks and the Can gate',
      'Route guards and permission-filtered navigation',
      'Row level security policies mirroring the matrix',
      'Append-only audit trail of role and status changes',
    ],
  },
  {
    index: 3,
    id: 'customers',
    title: 'Customer Management',
    description: 'Customer directory with search, contacts, GST details and archiving.',
    status: 'done',
    route: ROUTES.customers,
    scope: [
      'Customer directory with search, filters and pagination',
      'Contacts, addresses, GSTIN and preferred language',
      'Add, edit and archive; customers are never deleted',
      'Permission-gated actions and matching security rules',
    ],
  },
  {
    index: 4,
    id: 'enquiries',
    title: 'Enquiries & Jobs',
    description:
      'Enquiry intake with voice requirements, follow-ups, and conversion into jobs and orders.',
    status: 'done',
    route: ROUTES.enquiries,
    scope: [
      'Enquiry directory with numbered enquiries and follow-ups',
      'Typed and voice requirements recorded in the browser',
      'Atomic conversion to a job with its own number',
      'Direct jobs for walk-in repeat orders',
      'Pickup office and contact person on every job',
    ],
  },
  {
    index: 5,
    id: 'pricing',
    title: 'Measurements & Price Calculation',
    description: 'Measurement units, a rate card and decimal-safe price calculation on every job.',
    status: 'done',
    route: ROUTES.measurements,
    scope: [
      'Rate card of products with default rates',
      'Area, running length, per piece and flat pricing',
      'Exact unit conversion and integer paise arithmetic',
      'Rate snapshots so old jobs never re-price',
      'Job pricing lines with subtotal, adjustment and total',
    ],
  },
  {
    index: 6,
    id: 'estimates',
    title: 'Estimates & Quotations',
    description: 'Quotation documents made from a priced job, sent, and decided by the customer.',
    status: 'done',
    route: ROUTES.estimates,
    scope: [
      'Quotation created from the job pricing snapshot',
      'Prices frozen at creation, unaffected by later rate changes',
      'Draft, sent, approved, rejected, expired and cancelled states',
      'Customer approval or rejection recorded with who and when',
      'Print-friendly quotation document',
    ],
  },
  {
    index: 7,
    id: 'designs',
    title: 'Design Uploads & Approvals',
    description:
      'Design versions, a customer review portal in Hindi and English, and the approval trail.',
    status: 'done',
    route: ROUTES.designs,
    scope: [
      'Immutable design files in Cloud Storage, one per version',
      'Version history that a revision never overwrites',
      'Customer review portal with its own login, separate from staff',
      'Approve, ask for changes or reject - always with a comment',
      'Hindi and English on every customer-facing screen',
    ],
  },
  {
    index: 8,
    id: 'production',
    title: 'Department Workflow',
    description:
      'Configurable production stages, sequential work on the shop floor, and an append-only history.',
    status: 'done',
    route: ROUTES.production,
    scope: [
      'Stages configured by the owner, in the order work moves through them',
      'One production run per job, one task per stage',
      'Sequential flow: finishing a stage unlocks the next',
      'Holding or skipping a stage always records why',
      'Job status kept in step with the shop floor',
      'The approved artwork snapshotted when the run starts',
    ],
  },
  {
    index: 9,
    id: 'assignments',
    title: 'Operations Control',
    description: 'Who is doing what, what nobody has picked up, and what is running late.',
    status: 'done',
    route: ROUTES.scheduling,
    scope: [
      'Assign and reassign stages to active employees only',
      'My work, unassigned work, and per-employee workload counts',
      'Department and employee filters on the board',
      'Overdue, due today and due soon, with priority highlighting',
      'Reassignment recorded in the production history, from and to',
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
    status: 'done',
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
    status: 'done',
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
