import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers/AppProviders';
import { routes } from '@/app/router/routes';
import { ROUTES } from '@/constants/routes';
import type { Design } from '@/features/designs/types';
import type { Job } from '@/features/jobs/types';
import type { AuthAccount, UserProfile, UserRole } from '@/types/auth';

/**
 * The staff side of design review.
 *
 * What each role is offered is the point: a designer uploads but never answers
 * for the customer, sales answers but never uploads, and accounts sees nothing.
 */
const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  listDesigns: vi.fn(),
  listDesignsForJob: vi.fn(),
  listDesignsForCustomer: vi.fn(),
  findDesign: vi.fn(),
  uploadDesign: vi.fn(),
  submitDesignForReview: vi.fn(),
  recordDesignDecision: vi.fn(),
  findJob: vi.fn(),
  listJobs: vi.fn(),
  resolveDesignUrl: vi.fn(),
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

vi.mock('@/features/designs/services/design.service', () => ({
  DESIGN_FETCH_CAP: 500,
  designRepository: {},
  listDesigns: mocks.listDesigns,
  listDesignsForJob: mocks.listDesignsForJob,
  listDesignsForCustomer: mocks.listDesignsForCustomer,
  findDesign: mocks.findDesign,
  uploadDesign: mocks.uploadDesign,
  submitDesignForReview: mocks.submitDesignForReview,
  recordDesignDecision: mocks.recordDesignDecision,
}));

vi.mock('@/services/storage/design-storage.service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveDesignUrl: mocks.resolveDesignUrl,
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
  findJobPricing: vi.fn().mockResolvedValue(null),
  saveJobPricing: vi.fn(),
}));

vi.mock('@/features/estimates/services/estimate.service', () => ({
  ESTIMATE_FETCH_CAP: 500,
  estimateRepository: {},
  listEstimates: vi.fn().mockResolvedValue({ estimates: [], capReached: false, cap: 500 }),
  findEstimate: vi.fn(),
  defaultValidUntil: () => new Date('2026-09-08T10:00:00.000Z'),
  createEstimate: vi.fn(),
  updateDraftEstimate: vi.fn(),
  markEstimateSent: vi.fn(),
  recordEstimateDecision: vi.fn(),
  closeEstimate: vi.fn(),
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

vi.mock('@/features/locations/services/location.service', () => ({
  locationRepository: {},
  listLocations: vi.fn().mockResolvedValue([]),
  createLocation: vi.fn(),
  updateLocation: vi.fn(),
}));

vi.mock('@/features/products/services/product.service', () => ({
  productRepository: {},
  listProducts: vi.fn().mockResolvedValue([]),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  setProductActive: vi.fn(),
}));

const NOW = new Date('2026-08-24T10:00:00.000Z');

const JOB: Job = {
  id: 'j1',
  jobNumber: 'JOB-2627-0001',
  customerId: 'c1',
  customerName: 'Shreeji Traders',
  customerMobile: '9812300011',
  enquiryId: null,
  enquiryNumber: null,
  jobDate: NOW,
  title: 'Shop board',
  requirementText: 'Backlit board with the logo',
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

function design(overrides: Partial<Design> = {}): Design {
  return {
    id: 'j1-v1',
    jobId: 'j1',
    jobNumber: 'JOB-2627-0001',
    jobTitle: 'Shop board',
    customerId: 'c1',
    customerName: 'Shreeji Traders',
    version: 1,
    file: {
      id: 'file-1',
      storagePath: 'designs/j1/j1-v1/file-1.png',
      mimeType: 'image/png',
      sizeBytes: 204_800,
      originalFileName: 'board.png',
      uploadedAt: NOW,
      uploadedById: 'uid-designer',
    },
    preview: { kind: 'image', width: 1600, height: 900 },
    uploadedById: 'uid-designer',
    uploadedByName: 'Kavita Nair',
    uploadedAt: NOW,
    status: 'submitted-for-review',
    designerNote: 'First layout with the festival theme.',
    decision: null,
    submittedAt: NOW,
    supersededAt: null,
    createdAt: NOW,
    createdBy: 'uid-designer',
    updatedAt: NOW,
    updatedBy: 'uid-designer',
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

function renderAsRole(role: UserRole, path: string = ROUTES.designs) {
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
  mocks.listDesigns.mockResolvedValue({ designs: [design()], capReached: false, cap: 500 });
  mocks.listDesignsForJob.mockResolvedValue([design()]);
  mocks.listDesignsForCustomer.mockResolvedValue([design()]);
  mocks.findDesign.mockResolvedValue(design());
  mocks.findJob.mockResolvedValue(JOB);
  mocks.listJobs.mockResolvedValue({ jobs: [JOB], capReached: false, cap: 500 });
  mocks.resolveDesignUrl.mockResolvedValue('blob:preview');
  mocks.uploadDesign.mockResolvedValue(design({ id: 'j1-v2', version: 2 }));
  mocks.submitDesignForReview.mockResolvedValue(undefined);
  mocks.recordDesignDecision.mockResolvedValue(undefined);
});

describe('who may open the designs screen', () => {
  it.each(['owner', 'admin', 'sales', 'designer', 'production', 'viewer'] as UserRole[])(
    'shows the directory to %s',
    async (role) => {
      renderAsRole(role);

      expect(await screen.findByRole('heading', { name: /designs & approvals/i })).toBeVisible();
      expect(await screen.findAllByText('JOB-2627-0001')).not.toHaveLength(0);
    },
  );

  it('sends accounts to the forbidden page and never asks the database for designs', async () => {
    renderAsRole('accounts');

    expect(await screen.findByRole('heading', { name: /access denied/i })).toBeVisible();
    expect(mocks.listDesigns).not.toHaveBeenCalled();
  });
});

describe('the designs section on a job', () => {
  it('shows every version with its status and the customer comment', async () => {
    mocks.listDesignsForJob.mockResolvedValue([
      design({ id: 'j1-v2', version: 2 }),
      design({
        id: 'j1-v1',
        version: 1,
        status: 'changes-requested',
        decision: {
          outcome: 'changes-requested',
          comment: 'Please make the discount bigger.',
          decidedAt: NOW,
          source: 'customer',
          byId: 'uid-portal',
          byName: 'Shreeji Traders',
        },
      }),
    ]);
    renderAsRole('owner', '/jobs/j1');

    expect(await screen.findByText(/version 2 - current/i)).toBeVisible();
    expect(screen.getByText('Version 1')).toBeVisible();
    expect(screen.getByText('Please make the discount bigger.')).toBeVisible();
    expect(screen.getByText(/answered in the portal/i)).toBeVisible();
  });

  it('says which version is approved and ready for production', async () => {
    mocks.listDesignsForJob.mockResolvedValue([
      design({
        id: 'j1-v2',
        version: 2,
        status: 'approved',
        decision: {
          outcome: 'approved',
          comment: 'Approved, but make the phone number bigger.',
          decidedAt: NOW,
          source: 'customer',
          byId: 'uid-portal',
          byName: 'Shreeji Traders',
        },
      }),
    ]);
    renderAsRole('production', '/jobs/j1');

    expect(
      await screen.findByText(/version 2 is approved and ready for production/i),
    ).toBeVisible();
    expect(screen.getByText(/make the phone number bigger/i)).toBeVisible();
  });

  it('offers a designer the upload but never the customer answer', async () => {
    renderAsRole('designer', '/jobs/j1');

    expect(await screen.findByRole('button', { name: /upload revision/i })).toBeVisible();
    expect(screen.queryByRole('button', { name: /record approval/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /record rejection/i })).not.toBeInTheDocument();
  });

  it('offers sales the customer answer but never the upload', async () => {
    renderAsRole('sales', '/jobs/j1');

    expect(await screen.findByRole('button', { name: /record approval/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /changes requested/i })).toBeVisible();
    expect(screen.queryByRole('button', { name: /upload/i })).not.toBeInTheDocument();
  });

  it('gives production and viewer a read-only view', async () => {
    for (const role of ['production', 'viewer'] as UserRole[]) {
      const view = renderAsRole(role, '/jobs/j1');
      expect(await screen.findByText('Designs')).toBeVisible();
      expect(screen.queryByRole('button', { name: /upload/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /record approval/i })).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('never shows the designs section to accounts, nor asks for them', async () => {
    renderAsRole('accounts', '/jobs/j1');

    await screen.findByRole('heading', { name: 'JOB-2627-0001' });
    expect(screen.queryByText('Designs')).not.toBeInTheDocument();
    expect(mocks.listDesignsForJob).not.toHaveBeenCalled();
  });
});

describe('uploading', () => {
  it('refuses a file the customer could not open, before anything is sent', async () => {
    // applyAccept is off so the browser's own filter does not hide the check
    // being tested: the refusal has to happen for a file that arrives any way.
    const user = userEvent.setup({ delay: null, applyAccept: false });
    mocks.listDesignsForJob.mockResolvedValue([]);
    renderAsRole('designer', '/jobs/j1');

    await user.click(await screen.findByRole('button', { name: /upload design/i }));
    const dialog = await screen.findByRole('dialog');

    const source = new File(['x'], 'artwork.ai', { type: 'application/postscript' });
    await user.upload(within(dialog).getByLabelText(/design file/i), source);

    expect(await within(dialog).findByText(/Designs must be JPG, PNG, WEBP, PDF/i)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: /upload and send/i }));
    expect(mocks.uploadDesign).not.toHaveBeenCalled();
  });

  it('sends the next version straight to the customer', async () => {
    const user = userEvent.setup({ delay: null });
    renderAsRole('designer', '/jobs/j1');

    await user.click(await screen.findByRole('button', { name: /upload revision/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/upload version 2/i)).toBeVisible();

    const artwork = new File(['png-bytes'], 'board-v2.png', { type: 'image/png' });
    await user.upload(within(dialog).getByLabelText(/design file/i), artwork);
    await user.type(within(dialog).getByLabelText(/note for the customer/i), 'Bigger discount');
    await user.click(within(dialog).getByRole('button', { name: /upload and send/i }));

    await waitFor(() => {
      expect(mocks.uploadDesign).toHaveBeenCalledTimes(1);
    });
    const payload = mocks.uploadDesign.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload['submitNow']).toBe(true);
    expect(payload['mimeType']).toBe('image/png');
    expect(payload['originalFileName']).toBe('board-v2.png');
    expect(payload['designerNote']).toBe('Bigger discount');
  });

  it('can keep a version as a draft instead', async () => {
    const user = userEvent.setup({ delay: null });
    renderAsRole('designer', '/jobs/j1');

    await user.click(await screen.findByRole('button', { name: /upload revision/i }));
    const dialog = await screen.findByRole('dialog');
    await user.upload(
      within(dialog).getByLabelText(/design file/i),
      new File(['x'], 'board.pdf', { type: 'application/pdf' }),
    );
    await user.click(within(dialog).getByRole('button', { name: /save as draft/i }));

    await waitFor(() => {
      expect(mocks.uploadDesign).toHaveBeenCalledTimes(1);
    });
    expect((mocks.uploadDesign.mock.calls[0]?.[0] as Record<string, unknown>)['submitNow']).toBe(
      false,
    );
  });

  it('offers a draft to be sent, and only to somebody who may upload', async () => {
    mocks.listDesignsForJob.mockResolvedValue([
      design({ status: 'draft', submittedAt: null, decision: null }),
    ]);
    const user = userEvent.setup({ delay: null });
    renderAsRole('designer', '/jobs/j1');

    await user.click(await screen.findByRole('button', { name: /send for approval/i }));
    await waitFor(() => {
      expect(mocks.submitDesignForReview).toHaveBeenCalledTimes(1);
    });
  });
});

describe('recording what the customer said', () => {
  it('files an approval with its comment, as staff rather than as the customer', async () => {
    const user = userEvent.setup({ delay: null });
    renderAsRole('sales', '/jobs/j1');

    await user.click(await screen.findByRole('button', { name: /record approval/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(/what the customer said/i),
      'Approved, but make the font bigger',
    );
    await user.click(within(dialog).getByRole('button', { name: /record it/i }));

    await waitFor(() => {
      expect(mocks.recordDesignDecision).toHaveBeenCalledTimes(1);
    });
    const payload = mocks.recordDesignDecision.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload['outcome']).toBe('approved');
    expect(payload['source']).toBe('staff');
    expect(payload['comment']).toBe('Approved, but make the font bigger');
  });

  it('insists on a comment for a change request', async () => {
    const user = userEvent.setup({ delay: null });
    renderAsRole('sales', '/jobs/j1');

    await user.click(await screen.findByRole('button', { name: /changes requested/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /record it/i }));

    expect(await within(dialog).findByText(/write down what they said/i)).toBeVisible();
    expect(mocks.recordDesignDecision).not.toHaveBeenCalled();
  });
});
