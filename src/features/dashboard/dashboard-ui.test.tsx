import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers/AppProviders';
import { routes } from '@/app/router/routes';
import { ROUTES } from '@/constants/routes';
import type { Customer } from '@/features/customers/types';
import type { Enquiry } from '@/features/enquiries/types';
import type { Estimate } from '@/features/estimates/types';
import type { Job } from '@/features/jobs/types';
import type { AuthAccount, UserProfile, UserRole } from '@/types/auth';

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  listCustomers: vi.fn(),
  listEnquiries: vi.fn(),
  listJobs: vi.fn(),
  listEstimates: vi.fn(),
  listDesigns: vi.fn(),
  listProductionRuns: vi.fn(),
  listInvoices: vi.fn(),
  listInventoryItems: vi.fn(),
}));

vi.mock('@/features/auth/services/auth.service', () => ({
  ensurePersistence: vi.fn().mockResolvedValue(undefined),
  observeAuthState: (listener: (account: AuthAccount | null) => void) => {
    listener({ uid: 'uid-user', email: 'user@devasriya.test' });
    return () => undefined;
  },
  signInWithEmail: vi.fn(),
  signOutCurrentUser: vi.fn().mockResolvedValue(undefined),
  sendPasswordSetupEmail: vi.fn(),
  getCurrentIdToken: vi.fn(),
}));

vi.mock('@/features/users/services/user-profile.service', () => ({
  getUserProfile: mocks.getUserProfile,
  listUserProfiles: vi.fn().mockResolvedValue([]),
  createUserProfile: vi.fn(),
  updateUserProfile: vi.fn(),
  setUserActive: vi.fn(),
  userProfileRepository: {},
}));

vi.mock('@/features/customers/services/customer.service', () => ({
  CUSTOMER_FETCH_CAP: 1000,
  customerRepository: {},
  listCustomers: mocks.listCustomers,
  getCustomer: vi.fn(),
  findCustomer: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  setCustomerArchived: vi.fn(),
}));

vi.mock('@/features/enquiries/services/enquiry.service', () => ({
  ENQUIRY_FETCH_CAP: 500,
  enquiryRepository: {},
  listEnquiries: mocks.listEnquiries,
  findEnquiry: vi.fn(),
  newEnquiryId: vi.fn(),
  createEnquiry: vi.fn(),
  updateEnquiry: vi.fn(),
  addFollowUp: vi.fn(),
  assignEnquiry: vi.fn(),
}));

vi.mock('@/features/jobs/services/job.service', () => ({
  JOB_FETCH_CAP: 500,
  jobRepository: {},
  listJobs: mocks.listJobs,
  findJob: vi.fn(),
  newJobId: vi.fn(),
  createJob: vi.fn(),
  updateJob: vi.fn(),
  assignJob: vi.fn(),
}));

vi.mock('@/features/production/services/production.service', () => ({
  RUN_FETCH_CAP: 500,
  listWorkflowStages: vi.fn().mockResolvedValue([]),
  createWorkflowStage: vi.fn(),
  updateWorkflowStage: vi.fn(),
  listProductionRuns: mocks.listProductionRuns,
  findRunForJob: vi.fn().mockResolvedValue(null),
  listRunEvents: vi.fn().mockResolvedValue([]),
  startProductionRun: vi.fn(),
  advanceProductionTask: vi.fn(),
  assignProductionTask: vi.fn(),
}));

vi.mock('@/features/designs/services/design.service', () => ({
  DESIGN_FETCH_CAP: 500,
  designRepository: {},
  listDesigns: mocks.listDesigns,
  listDesignsForJob: vi.fn().mockResolvedValue([]),
  listDesignsForCustomer: vi.fn().mockResolvedValue([]),
  findDesign: vi.fn(),
  uploadDesign: vi.fn(),
  submitDesignForReview: vi.fn(),
  recordDesignDecision: vi.fn(),
}));

vi.mock('@/features/estimates/services/estimate.service', () => ({
  ESTIMATE_FETCH_CAP: 500,
  estimateRepository: {},
  listEstimates: mocks.listEstimates,
  findEstimate: vi.fn(),
  defaultValidUntil: () => new Date(),
  createEstimate: vi.fn(),
  updateDraftEstimate: vi.fn(),
  markEstimateSent: vi.fn(),
  recordEstimateDecision: vi.fn(),
  closeEstimate: vi.fn(),
}));

vi.mock('@/features/billing/services/billing.service', () => ({
  INVOICE_FETCH_CAP: 500,
  PAYMENT_FETCH_CAP: 1000,
  listInvoices: mocks.listInvoices,
  findInvoice: vi.fn(),
  listPayments: vi.fn().mockResolvedValue([]),
  createInvoice: vi.fn(),
  recordPayment: vi.fn(),
  updateInvoiceWording: vi.fn(),
  totalOutstanding: vi.fn(),
}));

vi.mock('@/features/inventory/services/inventory.service', () => ({
  ITEM_FETCH_CAP: 500,
  TRANSACTION_FETCH_CAP: 500,
  OPENING_STOCK_REASON: 'Opening stock',
  listInventoryItems: mocks.listInventoryItems,
  findInventoryItem: vi.fn(),
  listInventoryTransactions: vi.fn().mockResolvedValue([]),
  createInventoryItem: vi.fn(),
  updateInventoryItem: vi.fn(),
  recordStockMovement: vi.fn(),
}));

const NOW = new Date();
const ist = (offsetDays: number) => {
  const date = new Date(NOW);
  date.setDate(date.getDate() + offsetDays);
  return date;
};

const CUSTOMERS: Customer[] = [
  {
    id: 'c1',
    name: 'Ravi Kumar',
    nameLower: 'ravi kumar',
    type: 'individual',
    mobile: '9812300011',
    address: '12 Station Road',
    city: 'Jaipur',
    state: 'Rajasthan',
    pincode: '302001',
    preferredLanguage: 'hi',
    isArchived: false,
    portalUserId: null,
    createdAt: NOW,
    createdBy: 'uid-owner',
    updatedAt: NOW,
    updatedBy: 'uid-owner',
  },
  {
    id: 'c2',
    name: 'Archived Customer',
    nameLower: 'archived customer',
    type: 'individual',
    mobile: '9812300012',
    address: '9 Old Road',
    city: 'Ajmer',
    state: 'Rajasthan',
    pincode: '305001',
    preferredLanguage: 'hi',
    isArchived: true,
    portalUserId: null,
    createdAt: NOW,
    createdBy: 'uid-owner',
    updatedAt: NOW,
    updatedBy: 'uid-owner',
  },
];

function enquiry(overrides: Partial<Enquiry> & { id: string }): Enquiry {
  return {
    enquiryNumber: 'ENQ-2627-0001',
    customerId: 'c1',
    customerName: 'Ravi Kumar',
    customerMobile: '9812300011',
    enquiryDate: NOW,
    source: 'walk-in',
    requirementText: 'Wedding cards',
    requirementAudio: null,
    assignedToId: null,
    assignedToName: null,
    nextFollowUpAt: null,
    followUps: [],
    status: 'new',
    convertedJobId: null,
    convertedAt: null,
    createdAt: NOW,
    createdBy: 'uid-owner',
    updatedAt: NOW,
    updatedBy: 'uid-owner',
    ...overrides,
  };
}

function job(overrides: Partial<Job> & { id: string }): Job {
  return {
    jobNumber: 'JOB-2627-0001',
    customerId: 'c1',
    customerName: 'Ravi Kumar',
    customerMobile: '9812300011',
    enquiryId: null,
    enquiryNumber: null,
    jobDate: NOW,
    title: 'Wedding cards',
    requirementText: 'Gold foil',
    requirementAudio: null,
    priority: 'normal',
    expectedDeliveryDate: null,
    pickupLocationId: null,
    pickupLocationName: null,
    contactPersonId: null,
    contactPersonName: null,
    contactPersonMobile: null,
    assignedToId: null,
    assignedToName: null,
    status: 'open',
    createdAt: NOW,
    createdBy: 'uid-owner',
    updatedAt: NOW,
    updatedBy: 'uid-owner',
    ...overrides,
  };
}

const ENQUIRIES: Enquiry[] = [
  enquiry({ id: 'e1', status: 'new', nextFollowUpAt: ist(0) }),
  enquiry({
    id: 'e2',
    enquiryNumber: 'ENQ-2627-0002',
    status: 'follow-up',
    nextFollowUpAt: ist(-4),
  }),
  enquiry({ id: 'e3', enquiryNumber: 'ENQ-2627-0003', status: 'converted', convertedJobId: 'j1' }),
];

const JOBS: Job[] = [
  job({ id: 'j1', status: 'in-progress', priority: 'urgent', expectedDeliveryDate: ist(1) }),
  job({ id: 'j2', jobNumber: 'JOB-2627-0002', status: 'ready', expectedDeliveryDate: ist(-2) }),
  job({ id: 'j3', jobNumber: 'JOB-2627-0003', status: 'delivered' }),
];

function profileFor(role: UserRole): UserProfile {
  return {
    id: 'uid-user',
    name: 'Test User',
    email: 'user@devasriya.test',
    mobile: '9876500009',
    designation: 'manager',
    department: 'management',
    role,
    isActive: true,
    createdAt: NOW,
    createdBy: 'uid-owner',
    updatedAt: NOW,
    updatedBy: 'uid-owner',
  };
}

function RoutesRenderer() {
  return useRoutes(routes);
}

/** Waits until the dashboard has data, not just its heading. */
async function renderAndSettle(role: UserRole) {
  renderAsRole(role);
  await screen.findByRole('heading', { name: 'Dashboard', level: 1 });
  await screen.findByText('Recent updates');
}

function renderAsRole(role: UserRole) {
  mocks.getUserProfile.mockResolvedValue(profileFor(role));
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[ROUTES.dashboard]}>
        <RoutesRenderer />
      </MemoryRouter>
    </AppProviders>,
  );
}

function estimateFixture(status: Estimate['status'], validUntil: Date): Estimate {
  return {
    id: `estimate-${status}-${String(validUntil.getTime())}`,
    estimateNumber: 'EST-2627-0001',
    jobId: 'job-1',
    jobNumber: 'JOB-2627-0001',
    jobTitle: 'Shop board',
    customerId: 'c1',
    customerName: 'Ravi Kumar',
    customerMobile: '9812300011',
    estimateDate: NOW,
    validUntil,
    lines: [],
    subtotal: { paise: 0, currency: 'INR' },
    adjustment: null,
    total: { paise: 0, currency: 'INR' },
    status,
    sentAt: null,
    decision: null,
    cancelledAt: null,
    createdAt: NOW,
    createdBy: 'uid-owner',
    updatedAt: NOW,
    updatedBy: 'uid-owner',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listCustomers.mockResolvedValue({ customers: CUSTOMERS, capReached: false, cap: 1000 });
  mocks.listEnquiries.mockResolvedValue({ enquiries: ENQUIRIES, capReached: false, cap: 500 });
  mocks.listJobs.mockResolvedValue({ jobs: JOBS, capReached: false, cap: 500 });
  mocks.listEstimates.mockResolvedValue({ estimates: [], capReached: false, cap: 500 });
  mocks.listDesigns.mockResolvedValue({ designs: [], capReached: false, cap: 500 });
  mocks.listProductionRuns.mockResolvedValue([]);
  mocks.listInvoices.mockResolvedValue({ invoices: [], capReached: false, cap: 500 });
  mocks.listInventoryItems.mockResolvedValue([]);
});

describe('KPI cards', () => {
  it('counts active customers, open enquiries and active jobs', async () => {
    await renderAndSettle('owner');

    // One active customer; the archived one is not counted.
    expect(screen.getByRole('link', { name: 'Customers: 1' })).toBeInTheDocument();
    // Two enquiries are still open; the converted one is not.
    expect(screen.getByRole('link', { name: 'Open enquiries: 2' })).toBeInTheDocument();
    // Two jobs are active; the delivered one is not.
    expect(screen.getByRole('link', { name: 'Active jobs: 2' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ready for pickup: 1' })).toBeInTheDocument();
  });

  it('counts follow-ups due today together with overdue ones', async () => {
    await renderAndSettle('owner');

    expect(screen.getByRole('link', { name: 'Follow-ups due: 2' })).toBeInTheDocument();
  });

  it('keeps overdue jobs out of the due soon count', async () => {
    await renderAndSettle('owner');

    // One job is due tomorrow, one is two days overdue.
    expect(screen.getByRole('link', { name: 'Jobs due soon: 1' })).toBeInTheDocument();
  });

  it('counts draft quotations and the ones waiting on the customer', async () => {
    mocks.listEstimates.mockResolvedValue({
      estimates: [
        estimateFixture('draft', ist(2)),
        estimateFixture('sent', ist(3)),
        estimateFixture('sent', ist(-5)),
        estimateFixture('approved', ist(-5)),
      ],
      capReached: false,
      cap: 500,
    });
    await renderAndSettle('owner');

    expect(screen.getByRole('link', { name: /^Draft quotations: 1/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Awaiting approval: 1/ })).toBeInTheDocument();
    expect(screen.getByText(/1 more past validity/i)).toBeInTheDocument();
  });

  it.each(['designer', 'production'] as UserRole[])(
    'never shows %s a quotation count, nor asks for one',
    async (role) => {
      await renderAndSettle(role);

      expect(screen.queryByText(/draft quotations/i)).not.toBeInTheDocument();
      expect(mocks.listEstimates).not.toHaveBeenCalled();
    },
  );
});

describe('needs attention', () => {
  it('groups overdue and upcoming work separately', async () => {
    await renderAndSettle('owner');

    // Scoped to the panel: "Jobs due soon" is also a KPI label.
    const panel = screen.getByText('Needs attention').closest('div[data-slot="card"]');
    expect(panel).not.toBeNull();
    const attention = within(panel as HTMLElement);

    for (const group of [
      'Overdue follow-ups',
      'Follow-ups due today',
      'Overdue jobs',
      'Jobs due soon',
      'Urgent jobs',
      'Unassigned jobs',
    ]) {
      expect(attention.getByRole('heading', { name: new RegExp(group) })).toBeInTheDocument();
    }
  });

  it('says so when there is nothing to chase', async () => {
    mocks.listEnquiries.mockResolvedValue({
      enquiries: [enquiry({ id: 'calm', status: 'closed' })],
      capReached: false,
      cap: 500,
    });
    mocks.listJobs.mockResolvedValue({
      jobs: [job({ id: 'done', status: 'delivered', assignedToId: 'uid-1' })],
      capReached: false,
      cap: 500,
    });

    await renderAndSettle('owner');

    expect(screen.getByText('Nothing needs attention today.')).toBeInTheDocument();
  });
});

describe('pipeline and job breakdowns', () => {
  it('shows a row for every enquiry status and job status', async () => {
    await renderAndSettle('owner');

    const pipeline = screen.getByText('Enquiry pipeline').closest('div[data-slot="card"]');
    expect(pipeline).not.toBeNull();
    for (const label of ['New', 'Contacted', 'Follow-up', 'Quotation required', 'Lost']) {
      expect(within(pipeline as HTMLElement).getByText(label)).toBeInTheDocument();
    }

    const jobs = screen.getByText('Job overview').closest('div[data-slot="card"]');
    expect(jobs).not.toBeNull();
    for (const label of ['Open', 'In progress', 'Ready for delivery', 'Delivered', 'On hold']) {
      expect(within(jobs as HTMLElement).getByText(label)).toBeInTheDocument();
    }
  });
});

describe('upcoming deliveries', () => {
  it('lists jobs soonest first with pickup and contact details', async () => {
    mocks.listJobs.mockResolvedValue({
      jobs: [
        job({
          id: 'later',
          jobNumber: 'JOB-2627-0009',
          expectedDeliveryDate: ist(5),
          pickupLocationName: 'City Branch',
          contactPersonName: 'Sunil Yadav',
        }),
        job({
          id: 'sooner',
          jobNumber: 'JOB-2627-0008',
          expectedDeliveryDate: ist(1),
          pickupLocationName: 'Main Press',
          contactPersonName: 'Anita Verma',
        }),
      ],
      capReached: false,
      cap: 500,
    });

    await renderAndSettle('owner');

    const table = within(await screen.findByRole('table'));
    const rows = table.getAllByRole('row').slice(1);
    expect(within(rows[0] as HTMLElement).getByText('JOB-2627-0008')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('JOB-2627-0009')).toBeInTheDocument();
    expect(table.getByText('Main Press')).toBeInTheDocument();
    expect(table.getByText('Anita Verma')).toBeInTheDocument();
  });
});

describe('recent updates', () => {
  it('describes it as recent updates, not an activity log', async () => {
    await renderAndSettle('owner');

    expect(screen.getByText('Recent updates')).toBeInTheDocument();
    expect(screen.getByText('The latest change on each record.')).toBeInTheDocument();
    expect(screen.queryByText(/activity log/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('New customer').length).toBeGreaterThan(0);
  });
});

describe('role-aware sections', () => {
  it('shows accounts the customer and job sections but no enquiry data', async () => {
    await renderAndSettle('accounts');

    expect(screen.getByRole('link', { name: /^Customers: / })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Active jobs: / })).toBeInTheDocument();
    expect(screen.getByText('Job overview')).toBeInTheDocument();

    // Accounts has no enquiries:view, so nothing about enquiries appears.
    expect(screen.queryByText('Enquiry pipeline')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Open enquiries: / })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Follow-ups due: / })).not.toBeInTheDocument();
    expect(screen.queryByText(/Overdue follow-ups/)).not.toBeInTheDocument();
  });

  it('never asks for data the role may not read', async () => {
    await renderAndSettle('accounts');

    expect(mocks.listCustomers).toHaveBeenCalled();
    expect(mocks.listJobs).toHaveBeenCalled();
    expect(mocks.listEnquiries).not.toHaveBeenCalled();
  });

  it.each(['owner', 'admin', 'sales', 'designer', 'production', 'viewer'] as UserRole[])(
    'shows %s the enquiry and job sections they can already open',
    async (role) => {
      await renderAndSettle(role);

      expect(screen.getByText('Enquiry pipeline')).toBeInTheDocument();
      expect(screen.getByText('Job overview')).toBeInTheDocument();
      expect(screen.getByText('Upcoming deliveries')).toBeInTheDocument();
    },
  );
});

describe('quick actions', () => {
  it.each(['owner', 'admin', 'sales'] as UserRole[])(
    'offers %s the create shortcuts',
    async (role) => {
      await renderAndSettle(role);

      expect(screen.getByRole('link', { name: /add customer/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /add enquiry/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /create job/i })).toBeInTheDocument();
    },
  );

  it.each(['designer', 'production', 'viewer'] as UserRole[])(
    'gives %s only the view shortcuts',
    async (role) => {
      await renderAndSettle(role);

      expect(screen.queryByRole('link', { name: /add customer/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /add enquiry/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /create job/i })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: /view jobs/i })).toBeInTheDocument();
    },
  );

  it('hides the follow-ups shortcut from accounts', async () => {
    await renderAndSettle('accounts');

    expect(screen.queryByRole('link', { name: /view follow-ups/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view jobs/i })).toBeInTheDocument();
  });
});

describe('first run', () => {
  beforeEach(() => {
    mocks.listCustomers.mockResolvedValue({ customers: [], capReached: false, cap: 1000 });
    mocks.listEnquiries.mockResolvedValue({ enquiries: [], capReached: false, cap: 500 });
    mocks.listJobs.mockResolvedValue({ jobs: [], capReached: false, cap: 500 });
  });

  it('offers the owner a way to start instead of a wall of zeros', async () => {
    renderAsRole('owner');

    expect(await screen.findByText('Get started')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /add your first customer/i })).toBeInTheDocument();
    expect(screen.queryByText('Enquiry pipeline')).not.toBeInTheDocument();
    expect(screen.queryByText('Needs attention')).not.toBeInTheDocument();
  });

  it('explains the empty state to a read-only role without offering an action', async () => {
    renderAsRole('viewer');

    expect(await screen.findByText('Get started')).toBeInTheDocument();
    expect(screen.getByText(/Nothing has been added yet/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /add your first customer/i }),
    ).not.toBeInTheDocument();
  });
});

describe('backend warning', () => {
  it('is not shown when the app is configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');

    await renderAndSettle('owner');
    expect(screen.queryByText(/not connected to a backend/i)).not.toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it('is shown when there is no project to talk to', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

    await renderAndSettle('owner');
    expect(screen.getByText(/not connected to a backend/i)).toBeVisible();
    vi.unstubAllEnvs();
  });
});
