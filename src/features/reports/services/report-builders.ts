import { outstandingOf, PAYMENT_STATUS_LABELS, type Invoice } from '@/features/billing/types';
import type { Customer } from '@/features/customers/types';
import {
  formatStock,
  isLowStock,
  isOutOfStock,
  MATERIAL_CATEGORY_LABELS,
  type InventoryItem,
} from '@/features/inventory/types';
import { JOB_STATUS_LABELS, isJobFinished, type Job } from '@/features/jobs/types';
import type { ProductionRun, ProductionTask } from '@/features/production/types';
import { ANY_STATUS, type Report, type ReportRow } from '@/features/reports/types';
import { withinRange, type DateRange } from '@/features/reports/services/date-range';
import type { UserProfile } from '@/types/auth';
import { daysUntil } from '@/lib/business-day';
import { addMoney, money, type Money } from '@/lib/money';
import { formatDate, formatMoney } from '@/lib/format';

/** Everything the reports read. Each field is null when the role may not see it. */
export interface ReportSources {
  customers: Customer[];
  jobs: Job[];
  invoices: Invoice[];
  inventory: InventoryItem[];
  runs: ProductionRun[];
  employees: UserProfile[];
}

export interface ReportSpec {
  range: DateRange;
  status: string;
  now: Date;
}

const DASH = '-';

function openTasks(run: ProductionRun): ProductionTask[] {
  return run.tasks.filter((task) => task.status !== 'completed' && task.status !== 'skipped');
}

/** The stage a job is actually sitting on, or nothing if it is not in production. */
function currentStage(runs: ProductionRun[], jobId: string): ProductionTask | null {
  const run = runs.find((entry) => entry.jobId === jobId);
  if (!run) return null;
  return openTasks(run)[0] ?? null;
}

function lateBy(job: Job, now: Date): number {
  if (!job.expectedDeliveryDate) return 0;
  const days = daysUntil(job.expectedDeliveryDate, now);
  return days < 0 ? -days : 0;
}

function total(amounts: Money[]): Money {
  return amounts.reduce((running, amount) => addMoney(running, amount), money(0));
}

export function buildJobsReport(sources: ReportSources, spec: ReportSpec): Report {
  const rows: ReportRow[] = sources.jobs
    .filter((job) => withinRange(job.jobDate, spec.range))
    .filter((job) => spec.status === ANY_STATUS || job.status === spec.status)
    .sort((a, b) => b.jobDate.getTime() - a.jobDate.getTime())
    .map((job) => {
      const stage = currentStage(sources.runs, job.id);
      const late = lateBy(job, spec.now);

      return {
        key: job.id,
        tone: late > 0 && !isJobFinished(job.status) ? 'danger' : 'default',
        cells: {
          jobNumber: job.jobNumber,
          date: formatDate(job.jobDate),
          customer: job.customerName,
          title: job.title,
          status: JOB_STATUS_LABELS[job.status],
          priority: job.priority === 'urgent' ? 'Urgent' : 'Normal',
          delivery: job.expectedDeliveryDate ? formatDate(job.expectedDeliveryDate) : DASH,
          stage: stage?.stageName ?? DASH,
          assignee: stage?.assignedToName ?? job.assignedToName ?? DASH,
        },
      };
    });

  const active = rows.filter((row) => row.tone === 'danger').length;

  return {
    id: 'jobs',
    title: 'Jobs & production',
    description: 'Every job raised in the period, where it has reached and who is on it.',
    columns: [
      { key: 'jobNumber', label: 'Job' },
      { key: 'date', label: 'Raised' },
      { key: 'customer', label: 'Customer' },
      { key: 'title', label: 'Work' },
      { key: 'status', label: 'Status' },
      { key: 'priority', label: 'Priority' },
      { key: 'delivery', label: 'Delivery' },
      { key: 'stage', label: 'Current stage' },
      { key: 'assignee', label: 'With' },
    ],
    rows,
    summary: `${String(rows.length)} jobs, ${String(active)} past their delivery date.`,
  };
}

export function buildSalesReport(sources: ReportSources, spec: ReportSpec): Report {
  const rows: ReportRow[] = sources.customers
    .filter((customer) => !customer.isArchived)
    .map((customer) => {
      const jobs = sources.jobs.filter(
        (job) => job.customerId === customer.id && withinRange(job.jobDate, spec.range),
      );
      const invoices = sources.invoices.filter(
        (invoice) =>
          invoice.customerId === customer.id && withinRange(invoice.invoiceDate, spec.range),
      );

      const billed = total(invoices.map((invoice) => invoice.total));
      const received = total(invoices.map((invoice) => invoice.paid));
      const outstanding = total(invoices.map(outstandingOf));

      return {
        customer,
        jobs: jobs.length,
        invoices: invoices.length,
        billed,
        received,
        outstanding,
      };
    })
    .filter((entry) => {
      if (spec.status === 'with-jobs') return entry.jobs > 0;
      if (spec.status === 'billed') return entry.invoices > 0;
      return entry.jobs > 0 || entry.invoices > 0;
    })
    .sort(
      (a, b) => b.billed.paise - a.billed.paise || a.customer.name.localeCompare(b.customer.name),
    )
    .map((entry) => ({
      key: entry.customer.id,
      tone: entry.outstanding.paise > 0 ? ('warning' as const) : ('default' as const),
      cells: {
        customer: entry.customer.businessName ?? entry.customer.name,
        contact: entry.customer.name,
        mobile: entry.customer.mobile,
        jobs: String(entry.jobs),
        invoices: String(entry.invoices),
        billed: formatMoney(entry.billed),
        received: formatMoney(entry.received),
        outstanding: formatMoney(entry.outstanding),
      },
    }));

  const billedTotal = total(
    sources.invoices
      .filter((invoice) => withinRange(invoice.invoiceDate, spec.range))
      .map((invoice) => invoice.total),
  );

  return {
    id: 'sales',
    title: 'Sales & customers',
    description: 'What each customer has ordered in the period, and what it came to.',
    columns: [
      { key: 'customer', label: 'Customer' },
      { key: 'contact', label: 'Contact' },
      { key: 'mobile', label: 'Mobile' },
      { key: 'jobs', label: 'Jobs', numeric: true },
      { key: 'invoices', label: 'Invoices', numeric: true },
      { key: 'billed', label: 'Billed', numeric: true },
      { key: 'received', label: 'Received', numeric: true },
      { key: 'outstanding', label: 'Outstanding', numeric: true },
    ],
    rows,
    summary: `${String(rows.length)} customers, ${formatMoney(billedTotal)} billed in this period.`,
  };
}

export function buildPaymentsReport(sources: ReportSources, spec: ReportSpec): Report {
  const rows: ReportRow[] = sources.invoices
    .filter((invoice) => withinRange(invoice.invoiceDate, spec.range))
    .filter((invoice) => {
      if (spec.status === ANY_STATUS) return true;
      if (spec.status === 'outstanding') return invoice.status !== 'paid';
      return invoice.status === spec.status;
    })
    .sort((a, b) => b.invoiceDate.getTime() - a.invoiceDate.getTime())
    .map((invoice) => ({
      key: invoice.id,
      tone:
        invoice.status === 'unpaid'
          ? ('danger' as const)
          : invoice.status === 'partial'
            ? ('warning' as const)
            : ('default' as const),
      cells: {
        invoiceNumber: invoice.invoiceNumber,
        date: formatDate(invoice.invoiceDate),
        customer: invoice.customerBusinessName ?? invoice.customerName,
        job: invoice.jobNumber,
        total: formatMoney(invoice.total),
        received: formatMoney(invoice.paid),
        outstanding: formatMoney(outstandingOf(invoice)),
        status: PAYMENT_STATUS_LABELS[invoice.status],
      },
    }));

  const shown = sources.invoices.filter(
    (invoice) =>
      withinRange(invoice.invoiceDate, spec.range) &&
      (spec.status === ANY_STATUS ||
        (spec.status === 'outstanding'
          ? invoice.status !== 'paid'
          : invoice.status === spec.status)),
  );

  const billed = total(shown.map((invoice) => invoice.total));
  const received = total(shown.map((invoice) => invoice.paid));
  const outstanding = total(shown.map(outstandingOf));

  return {
    id: 'payments',
    title: 'Payments & outstanding',
    description: 'Invoices raised in the period, what has been received and what is still owed.',
    columns: [
      { key: 'invoiceNumber', label: 'Invoice' },
      { key: 'date', label: 'Date' },
      { key: 'customer', label: 'Customer' },
      { key: 'job', label: 'Job' },
      { key: 'total', label: 'Total', numeric: true },
      { key: 'received', label: 'Received', numeric: true },
      { key: 'outstanding', label: 'Outstanding', numeric: true },
      { key: 'status', label: 'Status' },
    ],
    rows,
    summary: `${formatMoney(billed)} billed, ${formatMoney(received)} received, ${formatMoney(outstanding)} outstanding.`,
  };
}

export function buildInventoryReport(sources: ReportSources, spec: ReportSpec): Report {
  const rows: ReportRow[] = sources.inventory
    .filter((item) => {
      if (spec.status === 'low') return isLowStock(item);
      if (spec.status === 'out') return isOutOfStock(item);
      if (spec.status === 'retired') return !item.isActive;
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({
      key: item.id,
      tone: isOutOfStock(item)
        ? ('danger' as const)
        : isLowStock(item)
          ? ('warning' as const)
          : ('default' as const),
      cells: {
        material: item.name,
        category: MATERIAL_CATEGORY_LABELS[item.category],
        stock: formatStock(item.currentStock, item.unit),
        minimum: formatStock(item.minimumStock, item.unit),
        state: !item.isActive
          ? 'No longer in use'
          : isOutOfStock(item)
            ? 'Out of stock'
            : isLowStock(item)
              ? 'Low'
              : 'In stock',
      },
    }));

  const low = sources.inventory.filter(isLowStock).length;

  return {
    id: 'inventory',
    title: 'Inventory & low stock',
    description: 'What is on hand right now, and what needs reordering.',
    columns: [
      { key: 'material', label: 'Material' },
      { key: 'category', label: 'Category' },
      { key: 'stock', label: 'In stock', numeric: true },
      { key: 'minimum', label: 'Minimum', numeric: true },
      { key: 'state', label: 'State' },
    ],
    rows,
    summary: `${String(rows.length)} materials listed, ${String(low)} at or below the minimum.`,
  };
}

export function buildWorkloadReport(sources: ReportSources, spec: ReportSpec): Report {
  const openByJob = new Map<string, Job>(sources.jobs.map((job) => [job.id, job]));

  const counts = new Map<string, { open: number; late: number; jobs: Set<string> }>();
  let unassigned = 0;

  for (const run of sources.runs) {
    for (const task of openTasks(run)) {
      if (!task.assignedToId) {
        unassigned += 1;
        continue;
      }
      const entry = counts.get(task.assignedToId) ?? { open: 0, late: 0, jobs: new Set<string>() };
      entry.open += 1;
      entry.jobs.add(task.jobId);
      const job = openByJob.get(task.jobId);
      if (job && lateBy(job, spec.now) > 0) entry.late += 1;
      counts.set(task.assignedToId, entry);
    }
  }

  const rows: ReportRow[] = sources.employees
    .filter((employee) => employee.isActive)
    .map((employee) => ({ employee, work: counts.get(employee.id) }))
    .filter((entry) => {
      if (spec.status === 'busy') return (entry.work?.open ?? 0) > 0;
      if (spec.status === 'late') return (entry.work?.late ?? 0) > 0;
      return true;
    })
    .sort(
      (a, b) =>
        (b.work?.open ?? 0) - (a.work?.open ?? 0) || a.employee.name.localeCompare(b.employee.name),
    )
    .map((entry) => ({
      key: entry.employee.id,
      tone: (entry.work?.late ?? 0) > 0 ? ('danger' as const) : ('default' as const),
      cells: {
        employee: entry.employee.name,
        role: entry.employee.role,
        department: entry.employee.department,
        openStages: String(entry.work?.open ?? 0),
        jobs: String(entry.work?.jobs.size ?? 0),
        late: String(entry.work?.late ?? 0),
      },
    }));

  return {
    id: 'workload',
    title: 'Employee workload',
    description: 'Open production stages per employee, and how many of them are late.',
    columns: [
      { key: 'employee', label: 'Employee' },
      { key: 'role', label: 'Role' },
      { key: 'department', label: 'Department' },
      { key: 'openStages', label: 'Open stages', numeric: true },
      { key: 'jobs', label: 'Jobs', numeric: true },
      { key: 'late', label: 'Late', numeric: true },
    ],
    rows,
    summary: `${String(rows.length)} employees listed, ${String(unassigned)} open stages with nobody on them.`,
  };
}

export function buildOverdueReport(sources: ReportSources, spec: ReportSpec): Report {
  const rows: ReportRow[] = sources.jobs
    .filter((job) => !isJobFinished(job.status))
    .filter((job) => {
      const late = lateBy(job, spec.now);
      if (spec.status === 'overdue') return late > 0;
      if (spec.status === 'unassigned') return !job.assignedToId;
      // The default view is work that needs looking at: late, or due within
      // the week, or on hold with nobody moving it.
      return (
        late > 0 ||
        job.status === 'on-hold' ||
        (job.expectedDeliveryDate ? daysUntil(job.expectedDeliveryDate, spec.now) <= 7 : false)
      );
    })
    .map((job) => ({ job, late: lateBy(job, spec.now), stage: currentStage(sources.runs, job.id) }))
    .sort((a, b) => b.late - a.late || a.job.jobNumber.localeCompare(b.job.jobNumber))
    .map((entry) => ({
      key: entry.job.id,
      tone: entry.late > 0 ? ('danger' as const) : ('warning' as const),
      cells: {
        jobNumber: entry.job.jobNumber,
        customer: entry.job.customerName,
        title: entry.job.title,
        status: JOB_STATUS_LABELS[entry.job.status],
        delivery: entry.job.expectedDeliveryDate
          ? formatDate(entry.job.expectedDeliveryDate)
          : DASH,
        late: entry.late > 0 ? `${String(entry.late)} days` : DASH,
        stage: entry.stage?.stageName ?? DASH,
        assignee: entry.stage?.assignedToName ?? entry.job.assignedToName ?? 'Nobody',
      },
    }));

  const late = rows.filter((row) => row.tone === 'danger').length;

  return {
    id: 'overdue',
    title: 'Overdue & pending work',
    description: 'Jobs past their delivery date or still waiting, with how late they are.',
    columns: [
      { key: 'jobNumber', label: 'Job' },
      { key: 'customer', label: 'Customer' },
      { key: 'title', label: 'Work' },
      { key: 'status', label: 'Status' },
      { key: 'delivery', label: 'Delivery' },
      { key: 'late', label: 'Late by', numeric: true },
      { key: 'stage', label: 'Current stage' },
      { key: 'assignee', label: 'With' },
    ],
    rows,
    summary: `${String(rows.length)} jobs need looking at, ${String(late)} already late.`,
  };
}

const BUILDERS = {
  jobs: buildJobsReport,
  sales: buildSalesReport,
  payments: buildPaymentsReport,
  inventory: buildInventoryReport,
  workload: buildWorkloadReport,
  overdue: buildOverdueReport,
} as const;

export function buildReport(
  id: keyof typeof BUILDERS,
  sources: ReportSources,
  spec: ReportSpec,
): Report {
  return BUILDERS[id](sources, spec);
}
