import { describe, expect, it } from 'vitest';

import type { Invoice } from '@/features/billing/types';
import type { Customer } from '@/features/customers/types';
import type { InventoryItem } from '@/features/inventory/types';
import type { Job } from '@/features/jobs/types';
import { ROLE_PERMISSIONS } from '@/features/permissions/matrix';
import type { ProductionRun, ProductionTask } from '@/features/production/types';
import { csvField, toCsv } from '@/features/reports/services/csv';
import { rangeFor, withinRange } from '@/features/reports/services/date-range';
import {
  buildInventoryReport,
  buildJobsReport,
  buildOverdueReport,
  buildPaymentsReport,
  buildSalesReport,
  buildWorkloadReport,
  type ReportSources,
} from '@/features/reports/services/report-builders';
import { ANY_STATUS, REPORT_DEFINITIONS } from '@/features/reports/types';
import type { UserProfile, UserRole } from '@/types/auth';
import { money } from '@/lib/money';

const NOW = new Date('2026-08-26T06:00:00.000Z');
const ist = (days: number) => new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
const audit = { createdAt: NOW, createdBy: 'u', updatedAt: NOW, updatedBy: 'u' };

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    jobNumber: 'JOB-2627-0001',
    customerId: 'c1',
    customerName: 'Shreeji Traders',
    customerMobile: '9829100011',
    enquiryId: null,
    enquiryNumber: null,
    jobDate: NOW,
    title: 'Shop board',
    requirementText: 'One board',
    requirementAudio: null,
    priority: 'normal',
    expectedDeliveryDate: null,
    internalNotes: null,
    pickupLocationId: null,
    pickupLocationName: null,
    contactPersonId: null,
    contactPersonName: null,
    contactPersonMobile: null,
    assignedToId: null,
    assignedToName: null,
    status: 'open',
    ...audit,
    ...overrides,
  } as Job;
}

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'i1',
    invoiceNumber: 'INV-2627-0001',
    jobId: 'j1',
    jobNumber: 'JOB-2627-0001',
    customerId: 'c1',
    customerName: 'Shreeji Traders',
    customerMobile: '9829100011',
    invoiceDate: NOW,
    jobTitle: 'Shop board',
    lines: [],
    subtotal: money(100_000),
    discount: null,
    total: money(100_000),
    paid: money(0),
    status: 'unpaid',
    ...audit,
    ...overrides,
  };
}

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'c1',
    name: 'Shreeji Traders',
    nameLower: 'shreeji traders',
    type: 'business',
    mobile: '9829100011',
    address: '1 Market Road',
    city: 'Udaipur',
    state: 'Rajasthan',
    pincode: '313001',
    preferredLanguage: 'hi',
    isArchived: false,
    ...audit,
    ...overrides,
  } as Customer;
}

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'm1',
    name: 'Flex roll',
    category: 'media',
    unit: 'sq-ft',
    currentStock: 100,
    minimumStock: 50,
    isActive: true,
    ...audit,
    ...overrides,
  };
}

function task(overrides: Partial<ProductionTask> = {}): ProductionTask {
  return {
    id: 't1',
    runId: 'r1',
    jobId: 'j1',
    stageId: null,
    stageName: 'Printing',
    department: 'printing',
    position: 0,
    status: 'ready',
    assignedToId: null,
    assignedToName: null,
    ...audit,
    ...overrides,
  };
}

function run(tasks: ProductionTask[], overrides: Partial<ProductionRun> = {}): ProductionRun {
  return {
    id: 'r1',
    jobId: 'j1',
    jobNumber: 'JOB-2627-0001',
    jobTitle: 'Shop board',
    customerId: 'c1',
    customerName: 'Shreeji Traders',
    status: 'in-progress',
    startedAt: NOW,
    tasks,
    ...audit,
    ...overrides,
  } as ProductionRun;
}

function employee(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'e1',
    name: 'Imran Sheikh',
    email: 'imran@devasriya.test',
    mobile: '9000000001',
    designation: 'Designer',
    department: 'design',
    role: 'designer',
    isActive: true,
    ...audit,
    ...overrides,
  } as UserProfile;
}

function sources(overrides: Partial<ReportSources> = {}): ReportSources {
  return {
    customers: [],
    jobs: [],
    invoices: [],
    inventory: [],
    runs: [],
    employees: [],
    ...overrides,
  };
}

const spec = (status = ANY_STATUS) => ({
  range: { from: null, to: null },
  status,
  now: NOW,
});

describe('the jobs report', () => {
  it('lists jobs newest first with the stage they are sitting on', () => {
    const report = buildJobsReport(
      sources({
        jobs: [
          job({ id: 'j1', jobNumber: 'JOB-0001', jobDate: ist(-3) }),
          job({ id: 'j2', jobNumber: 'JOB-0002', jobDate: ist(-1), status: 'in-progress' }),
        ],
        runs: [
          run(
            [
              task({ jobId: 'j2', status: 'completed', position: 0, stageName: 'Pre-press' }),
              task({ id: 't2', jobId: 'j2', status: 'ready', position: 1, stageName: 'Printing' }),
            ],
            { jobId: 'j2' },
          ),
        ],
      }),
      spec(),
    );

    expect(report.rows.map((row) => row.cells.jobNumber)).toEqual(['JOB-0002', 'JOB-0001']);
    // The stage a job is on is the first one still open, not the last finished.
    expect(report.rows[0]?.cells.stage).toBe('Printing');
    expect(report.rows[1]?.cells.stage).toBe('-');
  });

  it('filters by status and by the period the job was raised in', () => {
    const jobs = [
      job({ id: 'j1', jobDate: ist(-40), status: 'delivered' }),
      job({ id: 'j2', jobDate: ist(-2), status: 'open' }),
    ];

    expect(buildJobsReport(sources({ jobs }), spec('open')).rows).toHaveLength(1);

    const lastWeek = {
      range: rangeFor('last-7', NOW),
      status: ANY_STATUS,
      now: NOW,
    };
    expect(buildJobsReport(sources({ jobs }), lastWeek).rows.map((row) => row.key)).toEqual(['j2']);
  });

  it('marks a job past its delivery date, and never a finished one', () => {
    const report = buildJobsReport(
      sources({
        jobs: [
          job({ id: 'late', expectedDeliveryDate: ist(-2) }),
          job({ id: 'done', expectedDeliveryDate: ist(-9), status: 'delivered' }),
        ],
      }),
      spec(),
    );

    const tones = Object.fromEntries(report.rows.map((row) => [row.key, row.tone]));
    expect(tones.late).toBe('danger');
    expect(tones.done).toBe('default');
    expect(report.summary).toContain('1 past their delivery date');
  });
});

describe('the sales report', () => {
  it('adds up billed, received and outstanding per customer', () => {
    const report = buildSalesReport(
      sources({
        customers: [customer()],
        jobs: [job()],
        invoices: [
          invoice({ id: 'i1', total: money(100_000), paid: money(40_000), status: 'partial' }),
          invoice({ id: 'i2', total: money(50_000), paid: money(50_000), status: 'paid' }),
        ],
      }),
      spec(),
    );

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]?.cells.billed).toBe('₹1,500.00');
    expect(report.rows[0]?.cells.received).toBe('₹900.00');
    expect(report.rows[0]?.cells.outstanding).toBe('₹600.00');
    expect(report.rows[0]?.tone).toBe('warning');
  });

  it('leaves out archived customers and ones with nothing in the period', () => {
    const report = buildSalesReport(
      sources({
        customers: [
          customer({ id: 'c1' }),
          customer({ id: 'c2', name: 'Quiet Co' }),
          customer({ id: 'c3', name: 'Gone Co', isArchived: true }),
        ],
        jobs: [job({ customerId: 'c1' })],
        invoices: [invoice({ customerId: 'c3' })],
      }),
      spec(),
    );

    expect(report.rows.map((row) => row.key)).toEqual(['c1']);
  });
});

describe('the payments report', () => {
  it('totals billed, received and outstanding across what is shown', () => {
    const invoices = [
      invoice({ id: 'i1', total: money(100_000), paid: money(40_000), status: 'partial' }),
      invoice({ id: 'i2', total: money(50_000), paid: money(0), status: 'unpaid' }),
      invoice({ id: 'i3', total: money(20_000), paid: money(20_000), status: 'paid' }),
    ];

    const all = buildPaymentsReport(sources({ invoices }), spec());
    expect(all.rows).toHaveLength(3);
    expect(all.summary).toBe('₹1,700.00 billed, ₹600.00 received, ₹1,100.00 outstanding.');

    // The totals follow the filter, so a printed report always adds up to what
    // is on the page.
    const open = buildPaymentsReport(sources({ invoices }), spec('outstanding'));
    expect(open.rows.map((row) => row.key)).toEqual(['i1', 'i2']);
    expect(open.summary).toBe('₹1,500.00 billed, ₹400.00 received, ₹1,100.00 outstanding.');
  });

  it('marks an unpaid invoice more loudly than a part-paid one', () => {
    const report = buildPaymentsReport(
      sources({
        invoices: [
          invoice({ id: 'i1', status: 'unpaid' }),
          invoice({ id: 'i2', status: 'partial', paid: money(1_000) }),
          invoice({ id: 'i3', status: 'paid', paid: money(100_000) }),
        ],
      }),
      spec(),
    );

    expect(report.rows.map((row) => row.tone)).toEqual(['danger', 'warning', 'default']);
  });
});

describe('the inventory report', () => {
  it('separates low from out of stock, and ignores the period', () => {
    const inventory = [
      item({ id: 'ok', name: 'Plenty', currentStock: 500, minimumStock: 50 }),
      item({ id: 'low', name: 'Getting low', currentStock: 50, minimumStock: 50 }),
      item({ id: 'out', name: 'Gone', currentStock: 0, minimumStock: 5 }),
      item({ id: 'retired', name: 'Old stock', currentStock: 0, minimumStock: 5, isActive: false }),
    ];

    const all = buildInventoryReport(sources({ inventory }), spec());
    expect(all.rows).toHaveLength(4);
    expect(all.summary).toContain('2 at or below the minimum');

    expect(
      buildInventoryReport(sources({ inventory }), spec('low')).rows.map((row) => row.key),
    ).toEqual(['low', 'out']);
    expect(
      buildInventoryReport(sources({ inventory }), spec('out')).rows.map((row) => row.key),
    ).toEqual(['out']);
    expect(
      buildInventoryReport(sources({ inventory }), spec('retired')).rows.map((row) => row.key),
    ).toEqual(['retired']);
  });
});

describe('the workload report', () => {
  it('counts only open stages, and how many of them are on late jobs', () => {
    const report = buildWorkloadReport(
      sources({
        employees: [
          employee({ id: 'e1', name: 'Imran' }),
          employee({ id: 'e2', name: 'Kavita' }),
          employee({ id: 'e3', name: 'Left the firm', isActive: false }),
        ],
        jobs: [
          job({ id: 'j1', expectedDeliveryDate: ist(-2) }),
          job({ id: 'j2', expectedDeliveryDate: ist(5) }),
        ],
        runs: [
          run(
            [
              task({ id: 't1', jobId: 'j1', status: 'completed', assignedToId: 'e1' }),
              task({ id: 't2', jobId: 'j1', status: 'ready', assignedToId: 'e1' }),
              task({ id: 't3', jobId: 'j2', status: 'pending', assignedToId: 'e1' }),
              task({ id: 't4', jobId: 'j2', status: 'ready', assignedToId: null }),
            ],
            { jobId: 'j1' },
          ),
        ],
      }),
      spec(),
    );

    const imran = report.rows.find((row) => row.key === 'e1');
    expect(imran?.cells.openStages).toBe('2');
    expect(imran?.cells.jobs).toBe('2');
    expect(imran?.cells.late).toBe('1');
    expect(imran?.tone).toBe('danger');

    // Somebody who has left is never listed, and unassigned work is counted
    // once in the summary rather than pinned on anybody.
    expect(report.rows.map((row) => row.key)).toEqual(['e1', 'e2']);
    expect(report.summary).toContain('1 open stages with nobody on them');
  });

  it('filters to people who actually have work', () => {
    const base = sources({
      employees: [employee({ id: 'e1' }), employee({ id: 'e2', name: 'Idle' })],
      jobs: [job({ id: 'j1' })],
      runs: [run([task({ id: 't1', jobId: 'j1', status: 'ready', assignedToId: 'e1' })])],
    });

    expect(buildWorkloadReport(base, spec('busy')).rows.map((row) => row.key)).toEqual(['e1']);
    expect(buildWorkloadReport(base, spec('late')).rows).toHaveLength(0);
  });
});

describe('the overdue report', () => {
  it('sorts the latest first and says how late each one is', () => {
    const report = buildOverdueReport(
      sources({
        jobs: [
          job({ id: 'a', jobNumber: 'JOB-A', expectedDeliveryDate: ist(-2) }),
          job({ id: 'b', jobNumber: 'JOB-B', expectedDeliveryDate: ist(-9) }),
          job({ id: 'c', jobNumber: 'JOB-C', expectedDeliveryDate: ist(3) }),
          job({ id: 'done', expectedDeliveryDate: ist(-30), status: 'delivered' }),
        ],
      }),
      spec(),
    );

    expect(report.rows.map((row) => row.key)).toEqual(['b', 'a', 'c']);
    expect(report.rows[0]?.cells.late).toBe('9 days');
    expect(report.rows[2]?.cells.late).toBe('-');
    expect(report.summary).toBe('3 jobs need looking at, 2 already late.');
  });

  it('can be narrowed to only what is late, or only what nobody has picked up', () => {
    const base = sources({
      jobs: [
        job({ id: 'late', expectedDeliveryDate: ist(-1), assignedToId: 'e1' }),
        job({ id: 'nobody', expectedDeliveryDate: ist(4) }),
      ],
    });

    expect(buildOverdueReport(base, spec('overdue')).rows.map((row) => row.key)).toEqual(['late']);
    expect(buildOverdueReport(base, spec('unassigned')).rows.map((row) => row.key)).toEqual([
      'nobody',
    ]);
  });
});

describe('date ranges', () => {
  it('treats a period as whole business days, both ends inclusive', () => {
    const week = rangeFor('last-7', NOW);
    // Six days back plus today.
    expect(withinRange(ist(-6), week)).toBe(true);
    expect(withinRange(ist(-7), week)).toBe(false);
    expect(withinRange(NOW, week)).toBe(true);
    expect(withinRange(ist(1), week)).toBe(false);
  });

  it('lets everything through when no period is set', () => {
    const all = rangeFor('all', NOW);
    expect(withinRange(ist(-900), all)).toBe(true);
    expect(withinRange(ist(900), all)).toBe(true);
  });

  it('starts the financial year in April', () => {
    const year = rangeFor('this-year', NOW);
    expect(withinRange(new Date('2026-04-01T00:00:00.000Z'), year)).toBe(true);
    expect(withinRange(new Date('2026-03-31T12:00:00.000Z'), year)).toBe(false);
  });
});

describe('CSV export', () => {
  it('quotes what has to be quoted and doubles inner quotes', () => {
    expect(csvField('Shreeji')).toBe('Shreeji');
    expect(csvField('Shreeji, Udaipur')).toBe('"Shreeji, Udaipur"');
    expect(csvField('He said "yes"')).toBe('"He said ""yes"""');
    expect(csvField('line one\nline two')).toBe('"line one\nline two"');
  });

  it('defuses anything a spreadsheet would run as a formula', () => {
    expect(csvField('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(csvField('-Sharma')).toBe("'-Sharma");
    expect(csvField('+91 98291 00011')).toBe("'+91 98291 00011");
  });

  it('writes exactly the columns and rows that are on screen', () => {
    const report = buildPaymentsReport(
      sources({ invoices: [invoice({ customerName: 'Sharma, Meera' })] }),
      spec(),
    );

    const lines = toCsv(report).split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('Invoice,Date,Customer,Job,Total,Received,Outstanding,Status');
    expect(lines[1]).toContain('"Sharma, Meera"');
    expect(lines[1]?.split(',').length).toBeGreaterThanOrEqual(report.columns.length);
  });
});

describe('who may run which report', () => {
  const availableTo = (role: UserRole) =>
    REPORT_DEFINITIONS.filter((definition) =>
      definition.requires.every((permission) => ROLE_PERMISSIONS[role].includes(permission)),
    ).map((definition) => definition.id);

  it('gives the owner and administrator everything', () => {
    expect(availableTo('owner')).toEqual(REPORT_DEFINITIONS.map((entry) => entry.id));
    expect(availableTo('admin')).toEqual(REPORT_DEFINITIONS.map((entry) => entry.id));
  });

  it('never offers a report the role could not read the data for', () => {
    // Accounts holds no production:view, so no workload report.
    expect(availableTo('accounts')).toEqual(['jobs', 'sales', 'payments', 'inventory', 'overdue']);
    // Production holds no billing:view, so nothing about money.
    expect(availableTo('production')).toEqual([
      'jobs',
      'sales',
      'inventory',
      'workload',
      'overdue',
    ]);
    // A designer sees neither money nor employees.
    expect(availableTo('designer')).toEqual(['jobs', 'sales', 'inventory', 'overdue']);
    // A viewer reads the shop floor and the order book, and nothing else.
    expect(availableTo('viewer')).toEqual(['jobs', 'sales', 'overdue']);
  });

  it('lists no money report for anyone without billing:view', () => {
    for (const role of ['designer', 'production', 'viewer'] as UserRole[]) {
      expect(availableTo(role)).not.toContain('payments');
    }
  });
});
