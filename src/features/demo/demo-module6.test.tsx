import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers/AppProviders';
import { routes } from '@/app/router/routes';
import { ROUTES } from '@/constants/routes';
import { demoEstimate, demoEstimates, resetDemoStore } from '@/features/demo/demo-store';

/**
 * Quotations in demo mode.
 *
 * Every backend entry point is a spy that must never be called - that is the
 * promise the GitHub demo makes.
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
  sessionStorage.setItem('devasriya-print.demo-session', 'active');
});

afterEach(() => {
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

describe('demo quotations', () => {
  it('lists the sample quotations without touching the backend', async () => {
    renderDemoApp(ROUTES.estimates);

    expect(
      await screen.findByRole('heading', { name: 'Estimates & Quotations', level: 1 }),
    ).toBeInTheDocument();
    const table = within(await screen.findByRole('table'));
    expect(table.getByRole('link', { name: 'EST-2627-0001' })).toBeInTheDocument();
    expect(table.getByText('Shreeji Traders Pvt Ltd')).toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('shows the quotation document with its discount and total', async () => {
    renderDemoApp('/estimates/demo-estimate-1');

    expect(
      await screen.findByRole('heading', { name: 'EST-2627-0001', level: 1 }),
    ).toBeInTheDocument();
    const quotation = within(await screen.findByRole('article'));
    expect(quotation.getByText('Repeat customer discount')).toBeInTheDocument();
    expect(quotation.getByText('₹5,500.00')).toBeInTheDocument();
    expect(quotation.getByText(/08AABCU9603R1ZM/)).toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('records an approval in memory, keeping who entered it', async () => {
    const user = userEvent.setup({ delay: null });
    renderDemoApp('/estimates/demo-estimate-1');

    await screen.findByRole('heading', { name: 'EST-2627-0001', level: 1 });
    await user.click(screen.getByRole('button', { name: /record approval/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(/what did the customer say/i),
      'Confirmed on the phone',
    );
    await user.click(within(dialog).getByRole('button', { name: /record approval/i }));

    await waitFor(() => {
      expect(demoEstimate('demo-estimate-1')?.status).toBe('approved');
    });
    const stored = demoEstimate('demo-estimate-1');
    expect(stored?.decision?.note).toBe('Confirmed on the phone');
    expect(stored?.decision?.byName).toBeTruthy();
    expectNoBackendCalls();
  });

  it('creates a quotation from a priced job, in memory', async () => {
    const user = userEvent.setup({ delay: null });
    const before = demoEstimates().length;
    renderDemoApp('/jobs/demo-job-1');

    await screen.findByRole('heading', { name: 'JOB-2627-0001', level: 1 });
    await user.click(screen.getByRole('button', { name: /create quotation/i }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /create quotation/i }));

    await waitFor(() => {
      expect(demoEstimates()).toHaveLength(before + 1);
    });
    expectNoBackendCalls();
  });

  it('leaves an existing quotation alone when the job is priced again', async () => {
    const user = userEvent.setup({ delay: null });
    const original = demoEstimate('demo-estimate-1');
    renderDemoApp('/jobs/demo-job-1');

    await screen.findByRole('heading', { name: 'JOB-2627-0001', level: 1 });
    await user.click(screen.getByRole('button', { name: /create quotation/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /create quotation/i }));

    await waitFor(() => {
      expect(demoEstimates().length).toBeGreaterThan(2);
    });
    expect(demoEstimate('demo-estimate-1')?.total).toEqual(original?.total);
    expect(demoEstimate('demo-estimate-1')?.lines).toEqual(original?.lines);
  });
});
