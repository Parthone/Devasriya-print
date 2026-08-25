import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers/AppProviders';
import { routes } from '@/app/router/routes';
import { ROUTES } from '@/constants/routes';
import { demoDesign, demoDesignsForJob, resetDemoStore } from '@/features/demo/demo-store';

/**
 * Design review in demo mode, on both sides of the conversation.
 *
 * Every backend entry point is a spy that must never be called - that is the
 * promise the GitHub demo makes, and the customer portal has to keep it too.
 */
const backend = vi.hoisted(() => ({
  observeAuthState: vi.fn(),
  signInWithEmail: vi.fn(),
  getSupabase: vi.fn(),
}));

vi.mock('@/features/auth/services/auth.service', () => ({
  ensurePersistence: vi.fn(),
  observeAuthState: backend.observeAuthState,
  signInWithEmail: backend.signInWithEmail,
  signOutCurrentUser: vi.fn(),
  sendPasswordSetupEmail: vi.fn(),
  updatePassword: vi.fn(),
  getCurrentIdToken: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  getSupabase: backend.getSupabase.mockImplementation(() => {
    throw new Error('Supabase must not be contacted in demo mode');
  }),
  resetSupabaseForTests: vi.fn(),
}));

function RoutesRenderer() {
  return useRoutes(routes);
}

function renderDemoApp(path: string) {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}>
        <RoutesRenderer />
      </MemoryRouter>
    </AppProviders>,
  );
}

function expectNoBackendCalls() {
  expect(backend.observeAuthState).not.toHaveBeenCalled();
  expect(backend.signInWithEmail).not.toHaveBeenCalled();
  expect(backend.getSupabase).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.stubEnv('VITE_DEMO_MODE', 'true');
  vi.clearAllMocks();
  resetDemoStore();
  localStorage.clear();
  sessionStorage.setItem('devasriya-print.demo-session', 'staff');
});

afterEach(() => {
  vi.unstubAllEnvs();
  sessionStorage.clear();
  localStorage.clear();
});

describe('demo designs, staff side', () => {
  it('lists the sample versions without touching the backend', async () => {
    renderDemoApp(ROUTES.designs);

    expect(
      await screen.findByRole('heading', { name: 'Designs & Approvals', level: 1 }),
    ).toBeInTheDocument();
    const table = within(await screen.findByRole('table'));
    expect(table.getByRole('link', { name: 'JOB-2627-0002' })).toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('shows the whole conversation on the job, comments and all', async () => {
    renderDemoApp('/jobs/demo-job-1');

    expect(
      await screen.findByText(/version 2 is approved and ready for production/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Please make the discount percentage much larger and use a deeper red.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Approved, but please make the phone number a little bigger when printing.'),
    ).toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('records a staff-entered change request in memory', async () => {
    const user = userEvent.setup({ delay: null });
    renderDemoApp('/jobs/demo-job-2');

    await screen.findByRole('heading', { name: 'JOB-2627-0002', level: 1 });
    await user.click(await screen.findByRole('button', { name: /changes requested/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(/what the customer said/i),
      'Label ka size chhota karein',
    );
    await user.click(within(dialog).getByRole('button', { name: /record it/i }));

    await waitFor(() => {
      expect(demoDesign('demo-job-2-v1')?.status).toBe('changes-requested');
    });
    const stored = demoDesign('demo-job-2-v1');
    expect(stored?.decision?.source).toBe('staff');
    expect(stored?.decision?.comment).toBe('Label ka size chhota karein');
    expectNoBackendCalls();
  });

  it('uploads a revision in memory, leaving the answered version alone', async () => {
    const user = userEvent.setup({ delay: null });
    renderDemoApp('/jobs/demo-job-1');

    await screen.findByRole('heading', { name: 'JOB-2627-0001', level: 1 });
    await user.click(await screen.findByRole('button', { name: /upload revision/i }));

    const dialog = await screen.findByRole('dialog');
    await user.upload(
      within(dialog).getByLabelText(/design file/i),
      new File(['png'], 'hoarding-v3.png', { type: 'image/png' }),
    );
    await user.click(within(dialog).getByRole('button', { name: /upload and send/i }));

    await waitFor(() => {
      expect(demoDesignsForJob('demo-job-1')).toHaveLength(3);
    });
    const versions = demoDesignsForJob('demo-job-1');
    expect(versions[0]?.version).toBe(3);
    expect(demoDesign('demo-job-1-v2')?.status).toBe('approved');
    expect(demoDesign('demo-job-1-v2')?.decision?.comment).toMatch(/phone number/);
    expectNoBackendCalls();
  });
});

describe('the demo customer portal', () => {
  beforeEach(() => {
    sessionStorage.setItem('devasriya-print.demo-session', 'customer');
  });

  it('shows the sample customer their own designs, in Hindi, with no backend call', async () => {
    renderDemoApp(ROUTES.portal);

    expect(await screen.findByRole('heading', { name: 'आपके डिज़ाइन' })).toBeInTheDocument();
    expect(screen.getAllByText(/JOB-2627-0001/).length).toBeGreaterThan(0);
    // The other demo customer's job never appears.
    expect(screen.queryByText(/JOB-2627-0002/)).not.toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('answers a design in memory, keeping the comment on an approval', async () => {
    const user = userEvent.setup({ delay: null });
    // Put a version back in front of the sample customer to answer.
    renderDemoApp('/portal/designs/demo-job-1-v2');

    expect(await screen.findByText('आपने इस संस्करण को स्वीकृत किया')).toBeInTheDocument();
    expect(
      screen.getByText('Approved, but please make the phone number a little bigger when printing.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(await screen.findByText('You approved this version')).toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('keeps the earlier version and its change request visible', async () => {
    renderDemoApp('/portal/designs/demo-job-1-v2');

    await screen.findByRole('heading', { name: 'डिज़ाइन स्वीकृति' });
    expect(screen.getByRole('link', { name: 'संस्करण 1' })).toBeInTheDocument();
    expect(
      screen.getByText('Please make the discount percentage much larger and use a deeper red.'),
    ).toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('never lets the demo customer into the staff application', async () => {
    renderDemoApp(ROUTES.jobs);

    expect(await screen.findByRole('heading', { name: 'आपके डिज़ाइन' })).toBeInTheDocument();
    expectNoBackendCalls();
  });
});
