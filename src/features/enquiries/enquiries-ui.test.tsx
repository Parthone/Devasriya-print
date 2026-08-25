import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers/AppProviders';
import { routes } from '@/app/router/routes';
import { ROUTES } from '@/constants/routes';
import type { Enquiry } from '@/features/enquiries/types';
import type { Job } from '@/features/jobs/types';
import type { AuthAccount, UserProfile, UserRole } from '@/types/auth';

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  listEnquiries: vi.fn(),
  findEnquiry: vi.fn(),
  listJobs: vi.fn(),
  findJob: vi.fn(),
  listLocations: vi.fn(),
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

vi.mock('@/features/enquiries/services/enquiry.service', () => ({
  ENQUIRY_FETCH_CAP: 500,
  enquiryRepository: {},
  listEnquiries: mocks.listEnquiries,
  findEnquiry: mocks.findEnquiry,
  newEnquiryId: vi.fn(() => 'new-enquiry'),
  createEnquiry: vi.fn(),
  updateEnquiry: vi.fn(),
  addFollowUp: vi.fn(),
  assignEnquiry: vi.fn(),
}));

vi.mock('@/features/jobs/services/job.service', () => ({
  JOB_FETCH_CAP: 500,
  jobRepository: {},
  listJobs: mocks.listJobs,
  findJob: mocks.findJob,
  newJobId: vi.fn(() => 'new-job'),
  createJob: vi.fn(),
  updateJob: vi.fn(),
  assignJob: vi.fn(),
}));

vi.mock('@/features/locations/services/location.service', () => ({
  locationRepository: {},
  listLocations: mocks.listLocations,
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

const ENQUIRY: Enquiry = {
  id: 'e1',
  enquiryNumber: 'ENQ-2627-0001',
  customerId: 'c1',
  customerName: 'Ravi Kumar',
  customerMobile: '9812300011',
  enquiryDate: NOW,
  source: 'walk-in',
  requirementText: 'Wedding cards, 250 pieces',
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
};

const JOB: Job = {
  id: 'j1',
  jobNumber: 'JOB-2627-0001',
  customerId: 'c1',
  customerName: 'Ravi Kumar',
  customerMobile: '9812300011',
  enquiryId: 'e1',
  enquiryNumber: 'ENQ-2627-0001',
  jobDate: NOW,
  title: 'Wedding cards',
  requirementText: 'Wedding cards, 250 pieces',
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

function renderAsRole(role: UserRole, path: string) {
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
  mocks.listEnquiries.mockResolvedValue({ enquiries: [ENQUIRY], capReached: false, cap: 500 });
  mocks.findEnquiry.mockResolvedValue(ENQUIRY);
  mocks.listJobs.mockResolvedValue({ jobs: [JOB], capReached: false, cap: 500 });
  mocks.findJob.mockResolvedValue(JOB);
  mocks.listLocations.mockResolvedValue([]);
});

describe('enquiry route access', () => {
  // Per the Module 2 matrix: accounts is the one role without enquiries:view.
  const allowed: UserRole[] = ['owner', 'admin', 'sales', 'designer', 'production', 'viewer'];

  it.each(allowed)('lets %s open the enquiry directory', async (role) => {
    renderAsRole(role, ROUTES.enquiries);
    expect(await screen.findByRole('heading', { name: 'Enquiries', level: 1 })).toBeInTheDocument();
  });

  it('blocks accounts from enquiries by direct URL', async () => {
    renderAsRole('accounts', ROUTES.enquiries);
    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
  });

  it('blocks accounts from an enquiry detail page by direct URL', async () => {
    renderAsRole('accounts', '/enquiries/e1');
    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
    expect(mocks.findEnquiry).not.toHaveBeenCalled();
  });
});

describe('job route access', () => {
  const allRoles: UserRole[] = [
    'owner',
    'admin',
    'sales',
    'designer',
    'production',
    'accounts',
    'viewer',
  ];

  it.each(allRoles)('lets %s open the job directory', async (role) => {
    renderAsRole(role, ROUTES.jobs);
    expect(
      await screen.findByRole('heading', { name: 'Jobs & Orders', level: 1 }),
    ).toBeInTheDocument();
  });
});

describe('pickup offices route access', () => {
  it('lets the owner manage offices', async () => {
    renderAsRole('owner', ROUTES.locations);
    expect(
      await screen.findByRole('heading', { name: 'Pickup offices', level: 1 }),
    ).toBeInTheDocument();
  });

  it.each(['admin', 'sales', 'production', 'accounts', 'designer', 'viewer'] as UserRole[])(
    'blocks %s from managing offices',
    async (role) => {
      renderAsRole(role, ROUTES.locations);
      expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
    },
  );
});

describe('enquiry actions follow the permission matrix', () => {
  const canCreate: UserRole[] = ['owner', 'admin', 'sales'];
  const readOnly: UserRole[] = ['designer', 'production', 'viewer'];

  it.each(canCreate)('offers %s the new enquiry button', async (role) => {
    renderAsRole(role, ROUTES.enquiries);
    expect(await screen.findByRole('button', { name: /new enquiry/i })).toBeInTheDocument();
  });

  it.each(readOnly)('gives %s a read-only enquiry list', async (role) => {
    renderAsRole(role, ROUTES.enquiries);
    await screen.findByRole('heading', { name: 'Enquiries', level: 1 });
    expect(screen.queryByRole('button', { name: /new enquiry/i })).not.toBeInTheDocument();
  });

  it.each(canCreate)('offers %s edit, follow-up and convert on the detail page', async (role) => {
    renderAsRole(role, '/enquiries/e1');
    expect(
      await screen.findByRole('heading', { name: 'ENQ-2627-0001', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /follow-up/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /convert to job/i })).toBeInTheDocument();
  });

  it.each(readOnly)('hides those actions from %s', async (role) => {
    renderAsRole(role, '/enquiries/e1');
    await screen.findByRole('heading', { name: 'ENQ-2627-0001', level: 1 });
    expect(screen.queryByRole('button', { name: /follow-up/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /convert to job/i })).not.toBeInTheDocument();
  });
});

describe('job actions follow the permission matrix', () => {
  it.each(['owner', 'admin'] as UserRole[])('offers %s the assign action', async (role) => {
    renderAsRole(role, '/jobs/j1');
    expect(
      await screen.findByRole('heading', { name: 'JOB-2627-0001', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /assign/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
  });

  it.each(['sales', 'production'] as UserRole[])(
    'lets %s edit a job but not assign it',
    async (role) => {
      renderAsRole(role, '/jobs/j1');
      await screen.findByRole('heading', { name: 'JOB-2627-0001', level: 1 });
      expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /assign/i })).not.toBeInTheDocument();
    },
  );

  it.each(['accounts', 'viewer', 'designer'] as UserRole[])(
    'gives %s a read-only job page',
    async (role) => {
      renderAsRole(role, '/jobs/j1');
      await screen.findByRole('heading', { name: 'JOB-2627-0001', level: 1 });
      expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /assign/i })).not.toBeInTheDocument();
    },
  );

  it('offers the new job button only to roles that may create jobs', async () => {
    renderAsRole('viewer', ROUTES.jobs);
    await screen.findByRole('heading', { name: 'Jobs & Orders', level: 1 });
    expect(screen.queryByRole('button', { name: /new job/i })).not.toBeInTheDocument();
  });
});

describe('navigation', () => {
  it('shows enquiries and jobs to sales, and hides pickup offices', async () => {
    renderAsRole('sales', ROUTES.jobs);
    await screen.findByRole('heading', { name: 'Jobs & Orders', level: 1 });

    const nav = within(screen.getByRole('navigation', { name: 'Main navigation' }));
    expect(nav.getByRole('link', { name: /^Enquiries/ })).toBeInTheDocument();
    expect(nav.getByRole('link', { name: /^Jobs & Orders/ })).toBeInTheDocument();
    expect(nav.queryByRole('link', { name: /^Pickup Offices/ })).not.toBeInTheDocument();
  });

  it('hides enquiries from accounts but keeps jobs', async () => {
    renderAsRole('accounts', ROUTES.jobs);
    await screen.findByRole('heading', { name: 'Jobs & Orders', level: 1 });

    const nav = within(screen.getByRole('navigation', { name: 'Main navigation' }));
    expect(nav.queryByRole('link', { name: /^Enquiries/ })).not.toBeInTheDocument();
    expect(nav.getByRole('link', { name: /^Jobs & Orders/ })).toBeInTheDocument();
  });

  it('shows pickup offices to the owner only', async () => {
    renderAsRole('owner', ROUTES.jobs);
    await screen.findByRole('heading', { name: 'Jobs & Orders', level: 1 });

    const nav = within(screen.getByRole('navigation', { name: 'Main navigation' }));
    expect(nav.getByRole('link', { name: /^Pickup Offices/ })).toBeInTheDocument();
  });
});
