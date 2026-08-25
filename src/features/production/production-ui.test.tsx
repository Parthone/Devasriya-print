import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers/AppProviders';
import { routes } from '@/app/router/routes';
import { ROUTES } from '@/constants/routes';
import type { Job } from '@/features/jobs/types';
import type { ProductionRun, ProductionTask, WorkflowStage } from '@/features/production/types';
import type { AuthAccount, UserProfile, UserRole } from '@/types/auth';

/**
 * The shop floor on screen.
 *
 * What each role is offered is the point: production and design move work
 * along, sales and viewer watch, accounts sees none of it, and only somebody
 * with jobs:assign can put a name against a stage.
 */
const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  listWorkflowStages: vi.fn(),
  listProductionRuns: vi.fn(),
  findRunForJob: vi.fn(),
  listRunEvents: vi.fn(),
  startProductionRun: vi.fn(),
  advanceProductionTask: vi.fn(),
  assignProductionTask: vi.fn(),
  createWorkflowStage: vi.fn(),
  updateWorkflowStage: vi.fn(),
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

vi.mock('@/features/production/services/production.service', () => ({
  RUN_FETCH_CAP: 500,
  listWorkflowStages: mocks.listWorkflowStages,
  createWorkflowStage: mocks.createWorkflowStage,
  updateWorkflowStage: mocks.updateWorkflowStage,
  listProductionRuns: mocks.listProductionRuns,
  findRunForJob: mocks.findRunForJob,
  listRunEvents: mocks.listRunEvents,
  startProductionRun: mocks.startProductionRun,
  advanceProductionTask: mocks.advanceProductionTask,
  assignProductionTask: mocks.assignProductionTask,
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

const NOW = new Date('2026-08-26T10:00:00.000Z');

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
  status: 'in-progress',
  createdAt: NOW,
  createdBy: 'uid-owner',
  updatedAt: NOW,
  updatedBy: 'uid-owner',
};

const STAGES: WorkflowStage[] = ['Pre-press check', 'Printing', 'Finishing'].map((name, index) => ({
  id: `stage-${String(index)}`,
  name,
  department: 'printing',
  position: index,
  isActive: true,
  createdAt: NOW,
  createdBy: 'uid-owner',
  updatedAt: NOW,
  updatedBy: 'uid-owner',
}));

function task(
  index: number,
  status: ProductionTask['status'],
  extra: Partial<ProductionTask> = {},
) {
  return {
    id: `task-${String(index)}`,
    runId: 'run-1',
    jobId: 'j1',
    stageId: `stage-${String(index)}`,
    stageName: STAGES[index]!.name,
    department: 'printing' as const,
    position: index,
    status,
    assignedToId: null,
    assignedToName: null,
    startedAt: null,
    completedAt: null,
    createdAt: NOW,
    createdBy: 'uid-prod',
    updatedAt: NOW,
    updatedBy: 'uid-prod',
    ...extra,
  } satisfies ProductionTask;
}

function run(overrides: Partial<ProductionRun> = {}): ProductionRun {
  return {
    id: 'run-1',
    jobId: 'j1',
    jobNumber: 'JOB-2627-0001',
    jobTitle: 'Shop board',
    customerId: 'c1',
    customerName: 'Shreeji Traders',
    status: 'in-progress',
    approvedDesignId: 'j1-v2',
    approvedDesignVersion: 2,
    startedAt: NOW,
    startedById: 'uid-prod',
    startedByName: 'Rakesh Meena',
    completedAt: null,
    tasks: [task(0, 'completed'), task(1, 'in-progress'), task(2, 'pending')],
    createdAt: NOW,
    createdBy: 'uid-prod',
    updatedAt: NOW,
    updatedBy: 'uid-prod',
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

function renderAsRole(role: UserRole, path: string = ROUTES.production) {
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
  mocks.listWorkflowStages.mockResolvedValue(STAGES);
  mocks.listProductionRuns.mockResolvedValue([run()]);
  mocks.findRunForJob.mockResolvedValue(run());
  mocks.listRunEvents.mockResolvedValue([]);
  mocks.startProductionRun.mockResolvedValue(run());
  mocks.advanceProductionTask.mockResolvedValue(task(1, 'completed'));
  mocks.assignProductionTask.mockResolvedValue(task(1, 'in-progress'));
  mocks.findJob.mockResolvedValue(JOB);
  mocks.listJobs.mockResolvedValue({ jobs: [JOB], capReached: false, cap: 500 });
  mocks.listDesignsForJob.mockResolvedValue([]);
  mocks.listDesigns.mockResolvedValue({ designs: [], capReached: false, cap: 500 });
  mocks.resolveDesignUrl.mockResolvedValue('blob:preview');
});

describe('who may open the production board', () => {
  it.each(['owner', 'admin', 'sales', 'designer', 'production', 'viewer'] as UserRole[])(
    'shows the board to %s',
    async (role) => {
      renderAsRole(role);

      expect(await screen.findByRole('heading', { name: 'Production' })).toBeVisible();
      expect(await screen.findAllByText('JOB-2627-0001')).not.toHaveLength(0);
    },
  );

  it('sends accounts to the forbidden page and never asks for runs', async () => {
    renderAsRole('accounts');

    expect(await screen.findByRole('heading', { name: /access denied/i })).toBeVisible();
    expect(mocks.listProductionRuns).not.toHaveBeenCalled();
  });

  it('groups by what needs doing next, with counts on each filter', async () => {
    mocks.listProductionRuns.mockResolvedValue([
      run(),
      run({ id: 'run-2', jobId: 'j2', tasks: [task(0, 'on-hold', { holdReason: 'Ink late' })] }),
      run({ id: 'run-3', jobId: 'j3', tasks: [task(0, 'completed'), task(1, 'skipped')] }),
    ]);
    renderAsRole('production');

    expect(await screen.findByRole('button', { name: 'In progress (1)' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'On hold (1)' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Completed (1)' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'All (3)' })).toBeVisible();
  });

  it('shows why a stopped run is stopped', async () => {
    const user = userEvent.setup({ delay: null });
    mocks.listProductionRuns.mockResolvedValue([
      run({ tasks: [task(0, 'on-hold', { holdReason: 'Waiting for the vinyl roll.' })] }),
    ]);
    renderAsRole('production');

    await user.click(await screen.findByRole('button', { name: 'On hold (1)' }));
    expect(await screen.findByText(/Waiting for the vinyl roll/)).toBeVisible();
  });
});

describe('the production section on a job', () => {
  it('shows the stages in order, and the artwork the run was started against', async () => {
    renderAsRole('production', '/jobs/j1');

    expect(await screen.findByText('1. Pre-press check')).toBeVisible();
    expect(screen.getByText('2. Printing')).toBeVisible();
    expect(screen.getByText('3. Finishing')).toBeVisible();
    expect(screen.getByText(/Working from design version 2/)).toBeVisible();
    expect(screen.getByText(/1 of 3 stages finished/)).toBeVisible();
  });

  it('says plainly when a run was started with no approved design', async () => {
    mocks.findRunForJob.mockResolvedValue(
      run({ approvedDesignId: null, approvedDesignVersion: null }),
    );
    renderAsRole('production', '/jobs/j1');

    expect(await screen.findByText(/no approved design on file/i)).toBeVisible();
  });

  it('never offers to start a stage that is still waiting its turn', async () => {
    renderAsRole('production', '/jobs/j1');

    await screen.findByText('3. Finishing');

    // Printing is live: it can be completed or held. Finishing is behind it, so
    // there is no Start - work moves in order, and the database would refuse it
    // anyway. Skipping ahead is a different thing and stays available: knowing
    // up front that a job needs no lamination is a normal way to work.
    expect(screen.getByRole('button', { name: /complete/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /^Hold$/i })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Start$/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Skip$/i })).toHaveLength(2);
  });

  it('offers Start only once the stage in front has been settled', async () => {
    mocks.findRunForJob.mockResolvedValue(
      run({ tasks: [task(0, 'completed'), task(1, 'ready'), task(2, 'pending')] }),
    );
    renderAsRole('production', '/jobs/j1');

    await screen.findByText('2. Printing');
    expect(screen.getAllByRole('button', { name: /^Start$/i })).toHaveLength(1);
  });

  it.each(['owner', 'admin', 'designer', 'production'] as UserRole[])(
    'lets %s move a stage along',
    async (role) => {
      const view = renderAsRole(role, '/jobs/j1');
      expect(await screen.findByRole('button', { name: /complete/i })).toBeVisible();
      view.unmount();
    },
  );

  it.each(['sales', 'viewer'] as UserRole[])(
    'gives %s the progress but no controls',
    async (role) => {
      const view = renderAsRole(role, '/jobs/j1');

      expect(await screen.findByText('2. Printing')).toBeVisible();
      expect(screen.queryByRole('button', { name: /complete/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Hold$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /send to production/i })).not.toBeInTheDocument();
      view.unmount();
    },
  );

  it('offers to send an untouched job to production, once', async () => {
    const user = userEvent.setup({ delay: null });
    mocks.findRunForJob.mockResolvedValue(null);
    renderAsRole('production', '/jobs/j1');

    await user.click(await screen.findByRole('button', { name: /send to production/i }));

    await waitFor(() => {
      expect(mocks.startProductionRun).toHaveBeenCalledTimes(1);
    });
    expect(mocks.startProductionRun.mock.calls[0]?.[0]).toBe('j1');
  });
});
