import type { Permission } from '@/features/permissions/catalogue';

export const REPORT_IDS = [
  'jobs',
  'sales',
  'payments',
  'inventory',
  'workload',
  'overdue',
] as const;
export type ReportId = (typeof REPORT_IDS)[number];

/**
 * One column of a report.
 *
 * `value` is what goes on screen and, unchanged, into the CSV - so the export
 * is exactly what was read rather than a second calculation that can drift.
 * `numeric` only decides alignment.
 */
export interface ReportColumn {
  key: string;
  label: string;
  numeric?: boolean;
}

export interface ReportRow {
  key: string;
  cells: Record<string, string>;
  /** Draws the row's attention state: late, low, unpaid. */
  tone?: 'default' | 'warning' | 'danger';
}

export interface Report {
  id: ReportId;
  title: string;
  description: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  /** One line of totals shown under the table, when the report has any. */
  summary?: string;
}

export interface ReportDefinition {
  id: ReportId;
  title: string;
  description: string;
  /** Every permission needed to build it. Missing any hides the report. */
  requires: Permission[];
  /** False when the report is a snapshot of now rather than a period. */
  usesDateRange: boolean;
  statuses: { value: string; label: string }[];
}

export const ANY_STATUS = 'all';

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: 'jobs',
    title: 'Jobs & production',
    description: 'Every job raised in the period, where it has reached and who is on it.',
    requires: ['jobs:view'],
    usesDateRange: true,
    statuses: [
      { value: ANY_STATUS, label: 'All statuses' },
      { value: 'open', label: 'Open' },
      { value: 'in-progress', label: 'In progress' },
      { value: 'ready', label: 'Ready for delivery' },
      { value: 'delivered', label: 'Delivered' },
      { value: 'on-hold', label: 'On hold' },
      { value: 'cancelled', label: 'Cancelled' },
    ],
  },
  {
    id: 'sales',
    title: 'Sales & customers',
    description: 'What each customer has ordered in the period, and what it came to.',
    requires: ['customers:view', 'jobs:view'],
    usesDateRange: true,
    statuses: [
      { value: ANY_STATUS, label: 'All customers' },
      { value: 'with-jobs', label: 'Ordered in this period' },
      { value: 'billed', label: 'Billed in this period' },
    ],
  },
  {
    id: 'payments',
    title: 'Payments & outstanding',
    description: 'Invoices raised in the period, what has been received and what is still owed.',
    requires: ['billing:view'],
    usesDateRange: true,
    statuses: [
      { value: ANY_STATUS, label: 'All invoices' },
      { value: 'outstanding', label: 'Outstanding' },
      { value: 'unpaid', label: 'Unpaid' },
      { value: 'partial', label: 'Partly paid' },
      { value: 'paid', label: 'Paid' },
    ],
  },
  {
    id: 'inventory',
    title: 'Inventory & low stock',
    description: 'What is on hand right now, and what needs reordering.',
    requires: ['inventory:view'],
    usesDateRange: false,
    statuses: [
      { value: ANY_STATUS, label: 'All materials' },
      { value: 'low', label: 'Low or out of stock' },
      { value: 'out', label: 'Out of stock' },
      { value: 'retired', label: 'No longer in use' },
    ],
  },
  {
    id: 'workload',
    title: 'Employee workload',
    description: 'Open production stages per employee, and how many of them are late.',
    requires: ['employees:view', 'production:view'],
    usesDateRange: false,
    statuses: [
      { value: ANY_STATUS, label: 'All employees' },
      { value: 'busy', label: 'With open work' },
      { value: 'late', label: 'With late work' },
    ],
  },
  {
    id: 'overdue',
    title: 'Overdue & pending work',
    description: 'Jobs past their delivery date or still waiting, with how late they are.',
    requires: ['jobs:view'],
    usesDateRange: false,
    statuses: [
      { value: ANY_STATUS, label: 'Overdue and due soon' },
      { value: 'overdue', label: 'Overdue only' },
      { value: 'unassigned', label: 'Nobody assigned' },
    ],
  },
];

export function reportDefinition(id: ReportId): ReportDefinition {
  const found = REPORT_DEFINITIONS.find((definition) => definition.id === id);
  if (!found) throw new Error(`Unknown report: ${id}`);
  return found;
}
