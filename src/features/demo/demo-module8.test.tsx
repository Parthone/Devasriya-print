import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers/AppProviders';
import { routes } from '@/app/router/routes';
import { ROUTES } from '@/constants/routes';
import {
  demoJob,
  demoProductionEvents,
  demoProductionRuns,
  resetDemoStore,
} from '@/features/demo/demo-store';

/**
 * The shop floor in demo mode.
 *
 * Every backend entry point is a spy that must never be called - that is the
 * promise the GitHub demo makes, and production has to keep it too.
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

describe('demo production', () => {
  it('shows the board grouped by what needs doing next', async () => {
    renderDemoApp(ROUTES.production);

    expect(
      await screen.findByRole('heading', { name: 'Production', level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /^On hold \(1\)$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^In progress \(1\)$/ })).toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('shows why a stopped job is stopped', async () => {
    const user = userEvent.setup({ delay: null });
    renderDemoApp(ROUTES.production);

    await user.click(await screen.findByRole('button', { name: /^On hold \(1\)$/ }));

    expect(await screen.findByText(/JOB-2627-0003/)).toBeInTheDocument();
    expect(
      screen.getByText(/Waiting for the 8 ft vinyl roll to arrive from the supplier/),
    ).toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('lists the configurable stages under Settings', async () => {
    renderDemoApp(ROUTES.workflowStages);

    expect(
      await screen.findByRole('heading', { name: 'Production Stages', level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByText('1. Pre-press check')).toBeInTheDocument();
    expect(screen.getByText('4. Installation')).toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('moves a stage along in memory, unlocking the next one', async () => {
    const user = userEvent.setup({ delay: null });
    renderDemoApp('/jobs/demo-job-1');

    await screen.findByRole('heading', { name: 'JOB-2627-0001', level: 1 });
    // Pre-press is done and printing is running; completing it hands over to
    // lamination.
    await user.click(await screen.findByRole('button', { name: /complete/i }));

    await waitFor(() => {
      const run = demoProductionRuns().find((entry) => entry.jobId === 'demo-job-1');
      expect(run?.tasks[1]?.status).toBe('completed');
      expect(run?.tasks[2]?.status).toBe('ready');
    });
    expectNoBackendCalls();
  });

  it('will not put a stage on hold without a reason, and records one when given', async () => {
    const user = userEvent.setup({ delay: null });
    renderDemoApp('/jobs/demo-job-1');

    await screen.findByRole('heading', { name: 'JOB-2627-0001', level: 1 });
    await user.click(await screen.findByRole('button', { name: /^Hold$/i }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /put on hold/i }));
    expect(await within(dialog).findByText(/say what it is waiting for/i)).toBeVisible();

    await user.type(within(dialog).getByLabelText(/reason/i), 'Ink delivery is late');
    await user.click(within(dialog).getByRole('button', { name: /put on hold/i }));

    await waitFor(() => {
      const run = demoProductionRuns().find((entry) => entry.jobId === 'demo-job-1');
      expect(run?.tasks[1]?.status).toBe('on-hold');
      expect(run?.tasks[1]?.holdReason).toBe('Ink delivery is late');
    });

    // The job follows the shop floor, and the history keeps the reason.
    expect(demoJob('demo-job-1')?.status).toBe('on-hold');
    const events = demoProductionEvents('demo-run-1');
    expect(events[0]?.action).toBe('stage-held');
    expect(events[0]?.reason).toBe('Ink delivery is late');
    expectNoBackendCalls();
  });
});
