import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers/AppProviders';
import { routes } from '@/app/router/routes';
import { ROUTES } from '@/constants/routes';
import type { Estimate } from '@/features/estimates/types';
import type { JobPricingDocument } from '@/features/jobs/pricing-types';
import type { Job } from '@/features/jobs/types';
import type { AuthAccount, UserProfile, UserRole } from '@/types/auth';

/**
 * Quotations on screen.
 *
 * The point of these is what each role is offered: money is hidden from the
 * roles that must not see it, and no action is offered that the transition
 * table or the security rules would refuse.
 */
const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  listEstimates: vi.fn(),
  findEstimate: vi.fn(),
  createEstimate: vi.fn(),
  updateDraftEstimate: vi.fn(),
  markEstimateSent: vi.fn(),
  recordEstimateDecision: vi.fn(),
  closeEstimate: vi.fn(),
  findJob: vi.fn(),
  listJobs: vi.fn(),
  findJobPricing: vi.fn(),
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

vi.mock('@/features/estimates/services/estimate.service', () => ({
  ESTIMATE_FETCH_CAP: 500,
  estimateRepository: {},
  listEstimates: mocks.listEstimates,
  findEstimate: mocks.findEstimate,
  defaultValidUntil: () => new Date('2026-09-08T10:00:00.000Z'),
  createEstimate: mocks.createEstimate,
  updateDraftEstimate: mocks.updateDraftEstimate,
  markEstimateSent: mocks.markEstimateSent,
  recordEstimateDecision: mocks.recordEstimateDecision,
  closeEstimate: mocks.closeEstimate,
}));

vi.mock('@/features/jobs/services/job.service', () => ({
  JOB_FETCH_CAP: 500,
  jobRepository: {},
  listJobs: mocks.listJobs,
  findJob: mocks.findJob,
  newJobId: vi.fn(),
  createJob: vi.fn(),
  updateJob: vi.fn(),
  assignJob: vi.fn(),
}));

vi.mock('@/features/jobs/services/job-pricing.service', () => ({
  jobPricingRepository: {},
  findJobPricing: mocks.findJobPricing,
  saveJobPricing: vi.fn(),
}));

vi.mock('@/features/customers/services/customer.service', () => ({
  CUSTOMER_FETCH_CAP: 1000,
  customerRepository: {},
  listCustomers: vi.fn().mockResolvedValue({ customers: [], capReached: false, cap: 1000 }),
  getCustomer: vi.fn(),
  findCustomer: vi.fn().mockResolvedValue(null),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  setCustomerArchived: vi.fn(),
}));

vi.mock('@/features/products/services/product.service', () => ({
  productRepository: {},
  listProducts: vi.fn().mockResolvedValue([]),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  setProductActive: vi.fn(),
}));

vi.mock('@/features/locations/services/location.service', () => ({
  locationRepository: {},
  listLocations: vi.fn().mockResolvedValue([]),
  createLocation: vi.fn(),
  updateLocation: vi.fn(),
}));

vi.mock('@/features/enquiries/services/enquiry.service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ENQUIRY_FETCH_CAP: 500,
  listEnquiries: vi.fn().mockResolvedValue({ enquiries: [], capReached: false, cap: 500 }),
  findEnquiry: vi.fn(),
}));

const NOW = new Date('2026-08-24T10:00:00.000Z');
const VALID_UNTIL = new Date('2026-09-08T10:00:00.000Z');
const rupees = (value: number) => ({ paise: Math.round(value * 100), currency: 'INR' as const });

const JOB: Job = {
  id: 'j1',
  jobNumber: 'JOB-2627-0001',
  customerId: 'c1',
  customerName: 'Ravi Kumar',
  customerMobile: '9812300011',
  enquiryId: null,
  enquiryNumber: null,
  jobDate: NOW,
  title: 'Shop board',
  requirementText: 'Backlit board',
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
};

const PRICING: JobPricingDocument = {
  id: 'j1',
  jobId: 'j1',
  lines: [
    {
      id: 'line-1',
      productId: 'product-1',
      productName: 'Flex Print 440 GSM',
      pricingMethod: 'per-square-foot',
      width: 6,
      height: 4,
      measurementUnit: 'foot',
      quantity: 2,
      rate: rupees(25),
      rateUnit: 'sq-ft',
      calculatedArea: 24,
      lineAmount: rupees(1200),
    },
  ],
  subtotal: rupees(1200),
  adjustment: null,
  total: rupees(1200),
  createdAt: NOW,
  createdBy: 'uid-owner',
  updatedAt: NOW,
  updatedBy: 'uid-owner',
};

function estimate(overrides: Partial<Estimate> = {}): Estimate {
  return {
    id: 'e1',
    estimateNumber: 'EST-2627-0001',
    jobId: 'j1',
    jobNumber: 'JOB-2627-0001',
    jobTitle: 'Shop board',
    customerId: 'c1',
    customerName: 'Ravi Kumar',
    customerMobile: '9812300011',
    customerBusinessName: 'Shreeji Traders',
    customerAddress: '12 MG Road, Indore 452001',
    estimateDate: NOW,
    validUntil: VALID_UNTIL,
    lines: PRICING.lines,
    subtotal: rupees(1200),
    adjustment: null,
    total: rupees(1200),
    terms: 'Half in advance.',
    status: 'draft',
    sentAt: null,
    decision: null,
    cancelledAt: null,
    createdAt: NOW,
    createdBy: 'uid-owner',
    updatedAt: NOW,
    updatedBy: 'uid-owner',
    ...overrides,
  };
}

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

function renderAsRole(role: UserRole, path: string = ROUTES.estimates) {
  mocks.getUserProfile.mockResolvedValue(profileFor(role));
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}>
        <RoutesRenderer />
      </MemoryRouter>
    </AppProviders>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listEstimates.mockResolvedValue({
    estimates: [estimate()],
    capReached: false,
    cap: 500,
  });
  mocks.findEstimate.mockResolvedValue(estimate());
  mocks.findJob.mockResolvedValue(JOB);
  mocks.listJobs.mockResolvedValue({ jobs: [JOB], capReached: false, cap: 500 });
  mocks.findJobPricing.mockResolvedValue(PRICING);
  mocks.markEstimateSent.mockResolvedValue(undefined);
  mocks.recordEstimateDecision.mockResolvedValue(undefined);
  mocks.updateDraftEstimate.mockResolvedValue(undefined);
  mocks.closeEstimate.mockResolvedValue(undefined);
  mocks.createEstimate.mockResolvedValue(estimate({ id: 'e2', estimateNumber: 'EST-2627-0002' }));
});

describe('who may open the quotations screen', () => {
  it.each(['owner', 'admin', 'sales', 'accounts', 'viewer'] as UserRole[])(
    'shows the directory to %s',
    async (role) => {
      renderAsRole(role);

      expect(await screen.findByRole('heading', { name: /estimates & quotations/i })).toBeVisible();
      expect(await screen.findAllByText('EST-2627-0001')).not.toHaveLength(0);
    },
  );

  it.each(['designer', 'production'] as UserRole[])(
    'sends %s to the forbidden page and never asks the database for quotations',
    async (role) => {
      renderAsRole(role);

      expect(await screen.findByRole('heading', { name: /access denied/i })).toBeVisible();
      expect(mocks.listEstimates).not.toHaveBeenCalled();
    },
  );
});

describe('the directory', () => {
  it('searches by customer, job or quotation number', async () => {
    const user = userEvent.setup({ delay: null });
    mocks.listEstimates.mockResolvedValue({
      estimates: [
        estimate(),
        estimate({
          id: 'e2',
          estimateNumber: 'EST-2627-0002',
          customerName: 'Meena Gupta',
          customerBusinessName: 'Gupta Sweets',
          jobNumber: 'JOB-2627-0002',
        }),
      ],
      capReached: false,
      cap: 500,
    });
    renderAsRole('sales');

    const search = await screen.findByLabelText(/search quotations/i);
    await user.type(search, 'gupta');

    await waitFor(() => {
      expect(screen.queryByText('EST-2627-0001')).not.toBeInTheDocument();
    });
    expect(screen.getAllByText('EST-2627-0002').length).toBeGreaterThan(0);
  });

  it('opens on the quotations still in play', async () => {
    mocks.listEstimates.mockResolvedValue({
      estimates: [estimate({ id: 'e9', estimateNumber: 'EST-2627-0009', status: 'cancelled' })],
      capReached: false,
      cap: 500,
    });
    renderAsRole('sales');

    expect(await screen.findByText(/no open quotations/i)).toBeVisible();
  });
});

describe('the quotation document', () => {
  it('shows the customer, the priced items and the total', async () => {
    renderAsRole('sales', '/estimates/e1');

    const quotation = await screen.findByRole('article');
    expect(within(quotation).getByText('Shreeji Traders')).toBeVisible();
    expect(within(quotation).getByText('12 MG Road, Indore 452001')).toBeVisible();
    expect(within(quotation).getByText('Flex Print 440 GSM')).toBeVisible();
    expect(within(quotation).getAllByText('₹1,200.00').length).toBeGreaterThan(0);
    expect(within(quotation).getByText(/this is a quotation, not an invoice/i)).toBeVisible();
  });

  it('shows a discount line with the reason that was given', async () => {
    mocks.findEstimate.mockResolvedValue(
      estimate({
        adjustment: { amount: rupees(-200), reason: 'Repeat customer discount' },
        total: rupees(1000),
      }),
    );
    renderAsRole('sales', '/estimates/e1');

    const quotation = await screen.findByRole('article');
    expect(within(quotation).getByText('Repeat customer discount')).toBeVisible();
    expect(within(quotation).getByText('-₹200.00')).toBeVisible();
  });
});

describe('what each role may do to a draft', () => {
  it('offers sales edit, send and cancel, but no decision until it has gone out', async () => {
    renderAsRole('sales', '/estimates/e1');

    expect(await screen.findByRole('button', { name: /mark sent/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeVisible();
    expect(screen.queryByRole('button', { name: /record approval/i })).not.toBeInTheDocument();
  });

  it.each(['accounts', 'viewer'] as UserRole[])(
    'lets %s read it but offers no action beyond printing',
    async (role) => {
      renderAsRole(role, '/estimates/e1');

      expect(await screen.findByRole('button', { name: /print/i })).toBeVisible();
      expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /mark sent/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /record approval/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    },
  );

  it('marks a draft as sent', async () => {
    const user = userEvent.setup({ delay: null });
    renderAsRole('sales', '/estimates/e1');

    await user.click(await screen.findByRole('button', { name: /mark sent/i }));

    await waitFor(() => {
      expect(mocks.markEstimateSent).toHaveBeenCalledTimes(1);
    });
  });

  it('changes only the wording and validity, never the money', async () => {
    const user = userEvent.setup({ delay: null });
    renderAsRole('sales', '/estimates/e1');

    await user.click(await screen.findByRole('button', { name: /^edit$/i }));
    const notes = await screen.findByLabelText(/notes/i);
    await user.type(notes, 'Delivery included.');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mocks.updateDraftEstimate).toHaveBeenCalledTimes(1);
    });
    const payload = mocks.updateDraftEstimate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      ['actor', 'estimate', 'notes', 'terms', 'validUntil'].sort(),
    );
    expect(payload['notes']).toBe('Delivery included.');
  });
});

describe('a quotation that has gone out', () => {
  beforeEach(() => {
    mocks.findEstimate.mockResolvedValue(estimate({ status: 'sent', sentAt: NOW }));
  });

  it('can no longer be edited, but can be decided', async () => {
    renderAsRole('sales', '/estimates/e1');

    expect(await screen.findByRole('button', { name: /record approval/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /record rejection/i })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark sent/i })).not.toBeInTheDocument();
  });

  it('records the approval together with what the customer said', async () => {
    const user = userEvent.setup({ delay: null });
    renderAsRole('sales', '/estimates/e1');

    await user.click(await screen.findByRole('button', { name: /record approval/i }));
    await user.type(await screen.findByLabelText(/what did the customer say/i), 'Go ahead');
    await user.click(screen.getByRole('button', { name: /^record approval$/i, hidden: false }));

    await waitFor(() => {
      expect(mocks.recordEstimateDecision).toHaveBeenCalledTimes(1);
    });
    const [, outcome, note] = mocks.recordEstimateDecision.mock.calls[0] as [
      Estimate,
      string,
      string | undefined,
    ];
    expect(outcome).toBe('approved');
    expect(note).toBe('Go ahead');
  });
});

describe('a quotation the customer has already decided', () => {
  it('offers nothing that would change it', async () => {
    mocks.findEstimate.mockResolvedValue(
      estimate({
        status: 'approved',
        sentAt: NOW,
        decision: {
          outcome: 'approved',
          at: NOW,
          byId: 'uid-owner',
          byName: 'Demo Owner',
          note: 'Confirmed on the phone.',
        },
      }),
    );
    renderAsRole('owner', '/estimates/e1');

    expect(await screen.findByText(/confirmed on the phone/i)).toBeVisible();
    for (const label of [/^edit$/i, /mark sent/i, /record approval/i, /cancel/i]) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
  });
});

describe('creating a quotation from a job', () => {
  it('copies the job pricing as it stands and never asks for prices again', async () => {
    const user = userEvent.setup({ delay: null });
    mocks.listEstimates.mockResolvedValue({ estimates: [], capReached: false, cap: 500 });
    renderAsRole('sales', '/jobs/j1');

    await user.click(await screen.findByRole('button', { name: /create quotation/i }));
    await user.click(await screen.findByRole('button', { name: /^create quotation$/i }));

    await waitFor(() => {
      expect(mocks.createEstimate).toHaveBeenCalledTimes(1);
    });
    const payload = mocks.createEstimate.mock.calls[0]?.[0] as { pricing: JobPricingDocument };
    expect(payload.pricing.total).toEqual(rupees(1200));
    expect(payload.pricing.lines).toEqual(PRICING.lines);
  });

  it('will not offer a quotation for a job that has not been priced', async () => {
    mocks.findJobPricing.mockResolvedValue(null);
    mocks.listEstimates.mockResolvedValue({ estimates: [], capReached: false, cap: 500 });
    renderAsRole('sales', '/jobs/j1');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create quotation/i })).toBeDisabled();
    });
    expect(screen.getByText(/price the job before making a quotation/i)).toBeVisible();
  });

  it('lists the quotations already raised against the job', async () => {
    renderAsRole('sales', '/jobs/j1');

    expect(await screen.findByRole('link', { name: 'EST-2627-0001' })).toBeVisible();
  });

  it.each(['designer', 'production'] as UserRole[])(
    'never shows %s the quotations on a job',
    async (role) => {
      renderAsRole(role, '/jobs/j1');

      await screen.findByRole('heading', { name: 'JOB-2627-0001' });
      expect(screen.queryByText(/quotations/i)).not.toBeInTheDocument();
      expect(mocks.listEstimates).not.toHaveBeenCalled();
    },
  );
});
