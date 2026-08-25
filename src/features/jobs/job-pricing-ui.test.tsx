import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers/AppProviders';
import { routes } from '@/app/router/routes';
import { ROUTES } from '@/constants/routes';
import type { JobPricingDocument } from '@/features/jobs/pricing-types';
import type { Job } from '@/features/jobs/types';
import type { Product } from '@/features/products/types';
import type { AuthAccount, UserProfile, UserRole } from '@/types/auth';

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  findJob: vi.fn(),
  listJobs: vi.fn(),
  findJobPricing: vi.fn(),
  saveJobPricing: vi.fn(),
  listProducts: vi.fn(),
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
  saveJobPricing: mocks.saveJobPricing,
}));

vi.mock('@/features/products/services/product.service', () => ({
  productRepository: {},
  listProducts: mocks.listProducts,
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

vi.mock('@/features/customers/services/customer.service', () => ({
  CUSTOMER_FETCH_CAP: 1000,
  customerRepository: {},
  listCustomers: vi.fn().mockResolvedValue({ customers: [], capReached: false, cap: 1000 }),
  getCustomer: vi.fn(),
  findCustomer: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  setCustomerArchived: vi.fn(),
}));

const NOW = new Date('2026-08-24T10:00:00.000Z');
const rupees = (value: number) => ({ paise: Math.round(value * 100), currency: 'INR' as const });

const PRODUCT: Product = {
  id: 'product-1',
  name: 'Flex Print 440 GSM',
  category: 'printing',
  pricingMethod: 'per-square-foot',
  defaultRate: rupees(25),
  defaultRateUnit: 'sq-ft',
  isActive: true,
  createdAt: NOW,
  createdBy: 'uid-owner',
  updatedAt: NOW,
  updatedBy: 'uid-owner',
};

const JOB: Job = {
  id: 'j1',
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
};

/** Pricing is its own document now, read only by roles with estimates:view. */
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

function renderAsRole(role: UserRole, path = '/jobs/j1') {
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
  mocks.findJob.mockResolvedValue(JOB);
  mocks.listJobs.mockResolvedValue({ jobs: [JOB], capReached: false, cap: 500 });
  mocks.findJobPricing.mockResolvedValue(PRICING);
  mocks.listProducts.mockResolvedValue([PRODUCT]);
  mocks.saveJobPricing.mockResolvedValue(undefined);
});

describe('who can see pricing', () => {
  const canSee: UserRole[] = ['owner', 'admin', 'sales', 'accounts', 'viewer'];
  const cannotSee: UserRole[] = ['designer', 'production'];

  it.each(canSee)('shows %s the priced items and the total', async (role) => {
    renderAsRole(role);

    expect(await screen.findByText('Measurements & pricing')).toBeInTheDocument();
    // The table and the mobile card list are both in the DOM; CSS hides one.
    expect(screen.getAllByText('Flex Print 440 GSM').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/6 x 4 foot x 2/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1,200\.00/).length).toBeGreaterThan(0);
  });

  it.each(cannotSee)('hides pricing from %s, who has no estimates:view', async (role) => {
    renderAsRole(role);

    await screen.findByRole('heading', { name: 'JOB-2627-0001', level: 1 });
    expect(screen.queryByText('Measurements & pricing')).not.toBeInTheDocument();
    expect(screen.queryAllByText('Flex Print 440 GSM')).toHaveLength(0);
    expect(screen.queryAllByText(/1,200\.00/)).toHaveLength(0);
  });
});

describe('who can edit pricing', () => {
  const canEdit: UserRole[] = ['owner', 'admin', 'sales'];
  const readOnly: UserRole[] = ['accounts', 'viewer'];

  it.each(canEdit)('offers %s the pricing actions', async (role) => {
    renderAsRole(role);

    expect(await screen.findByRole('button', { name: /add item/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /adjust total/i })).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /edit Flex Print 440 GSM/i }).length,
    ).toBeGreaterThan(0);
  });

  it.each(readOnly)('gives %s pricing to read but not to change', async (role) => {
    renderAsRole(role);

    await screen.findByText('Measurements & pricing');
    expect(screen.queryByRole('button', { name: /add item/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /adjust total/i })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /edit Flex Print 440 GSM/i })).toHaveLength(0);
  });
});

describe('adding a priced item', () => {
  it('shows the working live and saves what the preview showed', async () => {
    const user = userEvent.setup({ delay: null });
    mocks.findJobPricing.mockResolvedValue(null);
    renderAsRole('sales');

    await user.click(await screen.findByRole('button', { name: /add item/i }));
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText(/description/i), 'Flex banner');
    await user.type(within(dialog).getByLabelText(/rate per sq ft/i), '25');
    await user.type(within(dialog).getByLabelText(/^width/i), '6');
    await user.type(within(dialog).getByLabelText(/^height/i), '4');
    const quantity = within(dialog).getByLabelText(/quantity/i);
    await user.clear(quantity);
    await user.type(quantity, '2');

    expect(await within(dialog).findByText(/6 x 4 foot x 2/)).toBeInTheDocument();
    expect(within(dialog).getByText(/1,200\.00/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Add item' }));

    await waitFor(() => {
      expect(mocks.saveJobPricing).toHaveBeenCalledTimes(1);
    });
    const [jobId, pricing] = mocks.saveJobPricing.mock.calls[0] as [
      string,
      {
        lines: { lineAmount: { paise: number } }[];
        subtotal: { paise: number };
        total: { paise: number };
      },
    ];
    expect(jobId).toBe('j1');
    expect(pricing.lines).toHaveLength(1);
    expect(pricing.lines[0]?.lineAmount.paise).toBe(120_000);
    expect(pricing.subtotal.paise).toBe(120_000);
    expect(pricing.total.paise).toBe(120_000);
  });

  it('prefills the rate from the rate card but lets it be changed', async () => {
    const user = userEvent.setup({ delay: null });
    mocks.findJobPricing.mockResolvedValue(null);
    renderAsRole('sales');

    await user.click(await screen.findByRole('button', { name: /add item/i }));
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('combobox', { name: /rate card item/i }));
    await user.click(await screen.findByRole('option', { name: 'Flex Print 440 GSM' }));

    const rate = within(dialog).getByLabelText(/rate per sq ft/i);
    expect(rate).toHaveValue('25.00');

    await user.clear(rate);
    await user.type(rate, '30');
    await user.type(within(dialog).getByLabelText(/^width/i), '10');
    await user.type(within(dialog).getByLabelText(/^height/i), '10');
    await user.click(within(dialog).getByRole('button', { name: 'Add item' }));

    await waitFor(() => {
      expect(mocks.saveJobPricing).toHaveBeenCalled();
    });
    const [, pricing] = mocks.saveJobPricing.mock.calls[0] as [
      string,
      {
        lines: {
          rate: { paise: number };
          productId: string | null;
          lineAmount: { paise: number };
        }[];
      },
    ];
    expect(pricing.lines[0]?.rate.paise).toBe(3000);
    expect(pricing.lines[0]?.productId).toBe('product-1');
    expect(pricing.lines[0]?.lineAmount.paise).toBe(300_000);
  });

  it('refuses to save a line with no measurements', async () => {
    const user = userEvent.setup({ delay: null });
    mocks.findJobPricing.mockResolvedValue(null);
    renderAsRole('sales');

    await user.click(await screen.findByRole('button', { name: /add item/i }));
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText(/description/i), 'Flex banner');
    await user.type(within(dialog).getByLabelText(/rate per sq ft/i), '25');
    await user.click(within(dialog).getByRole('button', { name: 'Add item' }));

    expect(within(dialog).getAllByText(/Enter a width/i).length).toBeGreaterThan(0);
    expect(mocks.saveJobPricing).not.toHaveBeenCalled();
  });
});

describe('editing and removing lines', () => {
  it('removes a line and recalculates the total', async () => {
    const user = userEvent.setup({ delay: null });
    renderAsRole('sales');

    const [removeButton] = await screen.findAllByRole('button', {
      name: /remove Flex Print 440 GSM/i,
    });
    await user.click(removeButton!);

    await waitFor(() => {
      expect(mocks.saveJobPricing).toHaveBeenCalled();
    });
    const [, pricing] = mocks.saveJobPricing.mock.calls[0] as [
      string,
      { lines: unknown[]; subtotal: { paise: number }; total: { paise: number } },
    ];
    expect(pricing.lines).toHaveLength(0);
    expect(pricing.subtotal.paise).toBe(0);
    expect(pricing.total.paise).toBe(0);
  });

  it('applies a discount with a reason and keeps the total above zero', async () => {
    const user = userEvent.setup({ delay: null });
    renderAsRole('sales');

    await user.click(await screen.findByRole('button', { name: /adjust total/i }));
    const dialog = await screen.findByRole('dialog');

    const amount = within(dialog).getByLabelText(/amount/i);
    await user.clear(amount);
    await user.type(amount, '-200');
    await user.type(within(dialog).getByLabelText(/reason/i), 'Repeat customer');
    await user.click(within(dialog).getByRole('button', { name: /save adjustment/i }));

    await waitFor(() => {
      expect(mocks.saveJobPricing).toHaveBeenCalled();
    });
    const [, pricing] = mocks.saveJobPricing.mock.calls[0] as [
      string,
      { adjustment: { amount: { paise: number }; reason: string }; total: { paise: number } },
    ];
    expect(pricing.adjustment.amount.paise).toBe(-20_000);
    expect(pricing.adjustment.reason).toBe('Repeat customer');
    expect(pricing.total.paise).toBe(100_000);
  });

  it('refuses a discount that would push the total below zero', async () => {
    const user = userEvent.setup({ delay: null });
    renderAsRole('sales');

    await user.click(await screen.findByRole('button', { name: /adjust total/i }));
    const dialog = await screen.findByRole('dialog');

    const amount = within(dialog).getByLabelText(/amount/i);
    await user.clear(amount);
    await user.type(amount, '-5000');
    await user.type(within(dialog).getByLabelText(/reason/i), 'Far too generous');
    await user.click(within(dialog).getByRole('button', { name: /save adjustment/i }));

    expect(
      await within(dialog).findByText(/would make the total less than zero/i),
    ).toBeInTheDocument();
    expect(mocks.saveJobPricing).not.toHaveBeenCalled();
  });
});

describe('rate card settings', () => {
  it('lets the owner manage products', async () => {
    renderAsRole('owner', ROUTES.products);

    expect(
      await screen.findByRole('heading', { name: 'Products & rates', level: 1 }),
    ).toBeInTheDocument();
    expect((await screen.findAllByText('Flex Print 440 GSM')).length).toBeGreaterThan(0);
  });

  it.each(['admin', 'sales', 'accounts', 'designer', 'production', 'viewer'] as UserRole[])(
    'blocks %s from the rate card screen',
    async (role) => {
      renderAsRole(role, ROUTES.products);
      expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
    },
  );
});

describe('pricing is never requested without permission', () => {
  it.each(['designer', 'production'] as UserRole[])(
    'does not ask for pricing at all for %s',
    async (role) => {
      renderAsRole(role);

      await screen.findByRole('heading', { name: 'JOB-2627-0001', level: 1 });
      expect(mocks.findJob).toHaveBeenCalled();
      // No denied request is sent: the query is never enabled.
      expect(mocks.findJobPricing).not.toHaveBeenCalled();
    },
  );

  it.each(['owner', 'admin', 'sales', 'accounts', 'viewer'] as UserRole[])(
    'asks for pricing for %s',
    async (role) => {
      renderAsRole(role);

      await screen.findByText('Measurements & pricing');
      expect(mocks.findJobPricing).toHaveBeenCalledWith('j1');
    },
  );

  it('shows an unpriced job as unpriced rather than as an error', async () => {
    mocks.findJobPricing.mockResolvedValue(null);
    renderAsRole('sales');

    expect(await screen.findByText(/Nothing priced yet/i)).toBeInTheDocument();
  });
});
