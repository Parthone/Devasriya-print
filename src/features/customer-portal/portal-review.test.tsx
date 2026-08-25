import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers/AppProviders';
import { routes } from '@/app/router/routes';
import { ROUTES } from '@/constants/routes';
import type { CustomerAccount } from '@/features/customer-portal/types';
import type { Design } from '@/features/designs/types';
import type { Job } from '@/features/jobs/types';
import type { AuthAccount, UserProfile } from '@/types/auth';

/**
 * The customer review portal.
 *
 * Two things are being checked: a customer reaches nothing but their own
 * designs, and the whole screen speaks the language they read - opening in
 * their recorded preference and switching when they ask it to.
 */
const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  findCustomerAccount: vi.fn(),
  findAccountForCustomer: vi.fn(),
  listDesignsForCustomer: vi.fn(),
  recordDesignDecision: vi.fn(),
  findJob: vi.fn(),
  resolveDesignUrl: vi.fn(),
}));

vi.mock('@/features/auth/services/auth.service', () => ({
  ensurePersistence: vi.fn().mockResolvedValue(undefined),
  observeAuthState: (listener: (account: AuthAccount | null) => void) => {
    listener({ uid: 'uid-portal-mine', email: 'accounts@shreeji.example' });
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

vi.mock('@/features/customer-portal/services/customer-account.service', () => ({
  customerAccountRepository: {},
  findCustomerAccount: mocks.findCustomerAccount,
  findAccountForCustomer: mocks.findAccountForCustomer,
  createCustomerAccount: vi.fn(),
  setCustomerAccountActive: vi.fn(),
}));

vi.mock('@/features/designs/services/design.service', () => ({
  DESIGN_FETCH_CAP: 500,
  designRepository: {},
  listDesigns: vi.fn().mockResolvedValue({ designs: [], capReached: false, cap: 500 }),
  listDesignsForJob: vi.fn().mockResolvedValue([]),
  listDesignsForCustomer: mocks.listDesignsForCustomer,
  findDesign: vi.fn(),
  uploadDesign: vi.fn(),
  submitDesignForReview: vi.fn(),
  recordDesignDecision: mocks.recordDesignDecision,
}));

vi.mock('@/services/storage/design-storage.service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveDesignUrl: mocks.resolveDesignUrl,
}));

vi.mock('@/features/jobs/services/job.service', () => ({
  JOB_FETCH_CAP: 500,
  jobRepository: {},
  listJobs: vi.fn().mockResolvedValue({ jobs: [], capReached: false, cap: 500 }),
  findJob: mocks.findJob,
  newJobId: vi.fn(),
  createJob: vi.fn(),
  updateJob: vi.fn(),
  assignJob: vi.fn(),
}));

const NOW = new Date('2026-08-24T10:00:00.000Z');

const ACCOUNT: CustomerAccount = {
  id: 'uid-portal-mine',
  customerId: 'customer-mine',
  customerName: 'Shreeji Traders',
  email: 'accounts@shreeji.example',
  preferredLanguage: 'hi',
  isActive: true,
  createdAt: NOW,
  createdBy: 'uid-owner',
  updatedAt: NOW,
  updatedBy: 'uid-owner',
};

const JOB: Job = {
  id: 'job-1',
  jobNumber: 'JOB-2627-0001',
  customerId: 'customer-mine',
  customerName: 'Shreeji Traders',
  customerMobile: '9812300011',
  enquiryId: null,
  enquiryNumber: null,
  jobDate: NOW,
  title: 'Diwali hoardings',
  requirementText: 'Festival hoarding with the shop logo',
  requirementAudio: null,
  priority: 'normal',
  expectedDeliveryDate: null,
  pickupLocationId: 'loc-1',
  pickupLocationName: 'Main Road Office',
  contactPersonId: null,
  contactPersonName: 'Anil Verma',
  contactPersonMobile: null,
  assignedToId: null,
  assignedToName: null,
  status: 'open',
  createdAt: NOW,
  createdBy: 'uid-sales',
  updatedAt: NOW,
  updatedBy: 'uid-sales',
};

function design(overrides: Partial<Design> = {}): Design {
  return {
    id: 'job-1-v2',
    jobId: 'job-1',
    jobNumber: 'JOB-2627-0001',
    jobTitle: 'Diwali hoardings',
    customerId: 'customer-mine',
    customerName: 'Shreeji Traders',
    version: 2,
    file: {
      id: 'file-2',
      storagePath: 'designs/job-1/job-1-v2/file-2.png',
      mimeType: 'image/png',
      sizeBytes: 204_800,
      originalFileName: 'hoarding-v2.png',
      uploadedAt: NOW,
      uploadedById: 'uid-designer',
    },
    preview: { kind: 'image', width: 1600, height: 900 },
    uploadedById: 'uid-designer',
    uploadedByName: 'Kavita Nair',
    uploadedAt: NOW,
    status: 'submitted-for-review',
    designerNote: 'Discount now takes the top third.',
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

const ANSWERED_V1 = design({
  id: 'job-1-v1',
  version: 1,
  status: 'changes-requested',
  decision: {
    outcome: 'changes-requested',
    comment: 'Please make the discount bigger.',
    decidedAt: NOW,
    source: 'customer',
    byId: 'uid-portal-mine',
    byName: 'Shreeji Traders',
    language: 'hi',
  },
});

function RoutesRenderer() {
  return useRoutes(routes);
}

function renderPortal(path: string) {
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
  localStorage.clear();
  // No employee profile for this uid: it is a customer, not staff.
  mocks.getUserProfile.mockResolvedValue(null);
  mocks.findCustomerAccount.mockResolvedValue(ACCOUNT);
  mocks.findAccountForCustomer.mockResolvedValue(ACCOUNT);
  mocks.listDesignsForCustomer.mockResolvedValue([design(), ANSWERED_V1]);
  mocks.findJob.mockResolvedValue(JOB);
  mocks.resolveDesignUrl.mockResolvedValue('blob:preview');
  mocks.recordDesignDecision.mockResolvedValue(undefined);
});

afterEach(() => {
  localStorage.clear();
});

describe('a customer only ever sees their own work', () => {
  it('asks for designs scoped to their own customer id, and nothing wider', async () => {
    renderPortal(ROUTES.portal);

    await screen.findAllByText('JOB-2627-0001', { exact: false });
    expect(mocks.listDesignsForCustomer).toHaveBeenCalledWith('customer-mine');
  });

  it('will not open a design that is not in their own list', async () => {
    renderPortal('/portal/designs/job-9-v1');

    expect(await screen.findByText('यह डिज़ाइन उपलब्ध नहीं है।')).toBeVisible();
    expect(mocks.recordDesignDecision).not.toHaveBeenCalled();
  });

  it('hides a version that has not been sent out yet', async () => {
    mocks.listDesignsForCustomer.mockResolvedValue([
      design({ status: 'draft', submittedAt: null }),
    ]);
    renderPortal('/portal/designs/job-1-v2');

    expect(await screen.findByText('यह डिज़ाइन उपलब्ध नहीं है।')).toBeVisible();
  });

  it('sends a customer who lands on the staff application back to the portal', async () => {
    renderPortal(ROUTES.dashboard);

    expect(await screen.findByRole('heading', { name: 'आपके डिज़ाइन' })).toBeVisible();
  });

  it('sends a staff member who lands on the portal back to the staff application', async () => {
    const profile: UserProfile = {
      id: 'uid-portal-mine',
      name: 'Owner',
      email: 'owner@devasriya.test',
      mobile: '9876500009',
      designation: 'manager',
      department: 'management',
      role: 'owner',
      isActive: true,
      createdAt: NOW,
      createdBy: 'uid-owner',
      updatedAt: NOW,
      updatedBy: 'uid-owner',
    };
    mocks.getUserProfile.mockResolvedValue(profile);
    renderPortal(ROUTES.portal);

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeVisible();
    // The portal query is never even attempted for a staff session.
    expect(mocks.listDesignsForCustomer).not.toHaveBeenCalled();
  });
});

describe('Hindi and English', () => {
  it('opens in the language on the customer record', async () => {
    renderPortal('/portal/designs/job-1-v2');

    expect(await screen.findByRole('heading', { name: 'डिज़ाइन स्वीकृति' })).toBeVisible();
    expect(screen.getByRole('button', { name: /स्वीकृत करें/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /बदलाव माँगें/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /अस्वीकार करें/ })).toBeVisible();
  });

  it('switches the whole screen when the customer asks for English', async () => {
    const user = userEvent.setup({ delay: null });
    renderPortal('/portal/designs/job-1-v2');

    await screen.findByRole('heading', { name: 'डिज़ाइन स्वीकृति' });
    await user.click(screen.getByRole('button', { name: 'English' }));

    expect(await screen.findByRole('heading', { name: 'Design approval' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ask for changes' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /स्वीकृत करें/ })).not.toBeInTheDocument();
  });

  it('remembers the choice for the next screen', async () => {
    const user = userEvent.setup({ delay: null });
    const view = renderPortal(ROUTES.portal);

    await screen.findByRole('heading', { name: 'आपके डिज़ाइन' });
    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(await screen.findByRole('heading', { name: 'Your designs' })).toBeVisible();
    view.unmount();

    renderPortal('/portal/designs/job-1-v2');
    expect(await screen.findByRole('heading', { name: 'Design approval' })).toBeVisible();
  });

  it('opens in English for a customer whose record says English', async () => {
    mocks.findCustomerAccount.mockResolvedValue({ ...ACCOUNT, preferredLanguage: 'en' });
    renderPortal(ROUTES.portal);

    expect(await screen.findByRole('heading', { name: 'Your designs' })).toBeVisible();
  });
});

describe('the review screen', () => {
  it('shows the order, the artwork, the designer note and what was asked for', async () => {
    renderPortal('/portal/designs/job-1-v2');

    await screen.findByRole('heading', { name: 'डिज़ाइन स्वीकृति' });
    expect(screen.getByText(/JOB-2627-0001/)).toBeVisible();
    expect(screen.getByText('Discount now takes the top third.')).toBeVisible();
    expect(await screen.findByText('Festival hoarding with the shop logo')).toBeVisible();
    expect(screen.getByText(/Main Road Office/)).toBeVisible();
    expect(screen.getByText(/Anil Verma/)).toBeVisible();
    expect(screen.getByAltText('hoarding-v2.png')).toBeVisible();
  });

  it('keeps the earlier version and the comment left on it', async () => {
    renderPortal('/portal/designs/job-1-v2');

    await screen.findByRole('heading', { name: 'डिज़ाइन स्वीकृति' });
    expect(screen.getByRole('link', { name: 'संस्करण 1' })).toBeVisible();
    expect(screen.getByText('Please make the discount bigger.')).toBeVisible();
    expect(screen.getByText('आपने इस संस्करण में बदलाव माँगे')).toBeVisible();
  });

  it('offers no answer on a version that has already been answered', async () => {
    mocks.listDesignsForCustomer.mockResolvedValue([ANSWERED_V1]);
    renderPortal('/portal/designs/job-1-v1');

    await screen.findByRole('heading', { name: 'डिज़ाइन स्वीकृति' });
    expect(screen.queryByRole('button', { name: /स्वीकृत करें/ })).not.toBeInTheDocument();
    expect(screen.getByText('हमारे डिज़ाइनर नया संस्करण बना रहे हैं।')).toBeVisible();
  });
});

describe('answering', () => {
  it('approves with a comment, recorded as the customer in their own language', async () => {
    const user = userEvent.setup({ delay: null });
    renderPortal('/portal/designs/job-1-v2');

    await user.click(await screen.findByRole('button', { name: /स्वीकृत करें/ }));
    await user.type(screen.getByLabelText('आपकी टिप्पणी'), 'स्वीकृत है, कृपया फ़ोन नंबर बड़ा करें');
    await user.click(screen.getByRole('button', { name: 'स्वीकृति भेजें' }));

    await waitFor(() => {
      expect(mocks.recordDesignDecision).toHaveBeenCalledTimes(1);
    });
    const payload = mocks.recordDesignDecision.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload['outcome']).toBe('approved');
    expect(payload['source']).toBe('customer');
    expect(payload['comment']).toBe('स्वीकृत है, कृपया फ़ोन नंबर बड़ा करें');
    expect(payload['language']).toBe('hi');
    expect((payload['design'] as Design).id).toBe('job-1-v2');
  });

  it('lets an approval be sent with no comment at all', async () => {
    const user = userEvent.setup({ delay: null });
    renderPortal('/portal/designs/job-1-v2');

    await user.click(await screen.findByRole('button', { name: /स्वीकृत करें/ }));
    await user.click(screen.getByRole('button', { name: 'स्वीकृति भेजें' }));

    await waitFor(() => {
      expect(mocks.recordDesignDecision).toHaveBeenCalledTimes(1);
    });
    expect(
      (mocks.recordDesignDecision.mock.calls[0]?.[0] as Record<string, unknown>)['comment'],
    ).toBe('');
  });

  it('insists on a comment for a change request and for a rejection', async () => {
    const user = userEvent.setup({ delay: null });
    renderPortal('/portal/designs/job-1-v2');

    await user.click(await screen.findByRole('button', { name: /बदलाव माँगें/ }));
    await user.click(screen.getByRole('button', { name: 'बदलाव का अनुरोध भेजें' }));
    expect(await screen.findByText('कृपया एक छोटी टिप्पणी लिखें।')).toBeVisible();

    await user.click(screen.getByRole('button', { name: /अस्वीकार करें/ }));
    await user.click(screen.getByRole('button', { name: 'अस्वीकृति भेजें' }));
    expect(await screen.findByText('कृपया एक छोटी टिप्पणी लिखें।')).toBeVisible();

    expect(mocks.recordDesignDecision).not.toHaveBeenCalled();
  });

  it('sends a rejection with its reason', async () => {
    const user = userEvent.setup({ delay: null });
    renderPortal('/portal/designs/job-1-v2');

    await user.click(await screen.findByRole('button', { name: /अस्वीकार करें/ }));
    await user.type(screen.getByLabelText('आपकी टिप्पणी'), 'यह हमारा ब्रांड रंग नहीं है');
    await user.click(screen.getByRole('button', { name: 'अस्वीकृति भेजें' }));

    await waitFor(() => {
      expect(mocks.recordDesignDecision).toHaveBeenCalledTimes(1);
    });
    const payload = mocks.recordDesignDecision.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload['outcome']).toBe('rejected');
    expect(payload['comment']).toBe('यह हमारा ब्रांड रंग नहीं है');
  });
});

describe('the portal home', () => {
  it('separates what is waiting on the customer from what they have answered', async () => {
    renderPortal(ROUTES.portal);

    const waiting = (await screen.findByText('आपके उत्तर की प्रतीक्षा')).closest(
      'div[data-slot="card"]',
    );
    expect(within(waiting as HTMLElement).getByText('संस्करण 2 - 24 Aug 2026')).toBeVisible();

    const done = screen.getByText('उत्तर दिया जा चुका है').closest('div[data-slot="card"]');
    expect(within(done as HTMLElement).getByText('संस्करण 1 - 24 Aug 2026')).toBeVisible();
  });
});
