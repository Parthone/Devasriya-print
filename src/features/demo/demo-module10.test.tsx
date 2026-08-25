import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers/AppProviders';
import { routes } from '@/app/router/routes';
import { ROUTES } from '@/constants/routes';
import {
  demoInventoryItem,
  demoInventoryTransactions,
  demoInvoice,
  demoPayments,
  resetDemoStore,
} from '@/features/demo/demo-store';

/**
 * Billing and inventory in demo mode.
 *
 * Every backend entry point is a spy that must never be called - that is the
 * promise the GitHub demo makes, and money and stock have to keep it too.
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

describe('demo billing', () => {
  it('lists what is outstanding, and filters by payment status', async () => {
    const user = userEvent.setup({ delay: null });
    renderDemoApp(ROUTES.billing);

    expect(
      await screen.findByRole('heading', { name: 'Billing & Payments', level: 1 }),
    ).toBeInTheDocument();
    // 3,250.00 still owed on the part-paid bill plus 3,000.00 on the unpaid one.
    expect(await screen.findByText('₹6,250.00')).toBeInTheDocument();
    // The table and the small-screen card list both render, so both links match.
    expect(await screen.findAllByRole('link', { name: 'INV-2627-0001' })).not.toHaveLength(0);

    await user.click(screen.getByRole('combobox', { name: 'Filter by payment status' }));
    await user.click(await screen.findByRole('option', { name: 'Paid' }));

    await waitFor(() => {
      expect(screen.queryAllByRole('link', { name: 'INV-2627-0001' })).toHaveLength(0);
    });
    expectNoBackendCalls();
  });

  it('shows the bill, what has been received and what is still due', async () => {
    renderDemoApp('/billing/demo-invoice-1');

    expect(
      await screen.findByRole('heading', { name: 'INV-2627-0001', level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/Festival offer/)).toBeInTheDocument();
    expect(screen.getByText('Advance against the hoardings.')).toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('records a payment in memory and settles the invoice', async () => {
    const user = userEvent.setup({ delay: null });
    renderDemoApp('/billing/demo-invoice-1');

    await screen.findByRole('heading', { name: 'INV-2627-0001', level: 1 });
    await user.click(await screen.findByRole('button', { name: /record payment/i }));

    const dialog = await screen.findByRole('dialog');
    // The dialog offers the whole outstanding balance by default.
    await user.click(within(dialog).getByRole('button', { name: /record payment/i }));

    await waitFor(() => {
      expect(demoInvoice('demo-invoice-1')?.status).toBe('paid');
    });
    expect(demoPayments('demo-invoice-1')).toHaveLength(2);
    expectNoBackendCalls();
  });

  it('refuses more than the outstanding balance, and changes nothing', async () => {
    const user = userEvent.setup({ delay: null });
    renderDemoApp('/billing/demo-invoice-1');

    await screen.findByRole('heading', { name: 'INV-2627-0001', level: 1 });
    await user.click(await screen.findByRole('button', { name: /record payment/i }));

    const dialog = await screen.findByRole('dialog');
    const amount = within(dialog).getByLabelText(/amount received/i);
    await user.clear(amount);
    await user.type(amount, '9999');
    await user.click(within(dialog).getByRole('button', { name: /record payment/i }));

    expect(await within(dialog).findByText(/more than the/i)).toBeInTheDocument();
    expect(demoInvoice('demo-invoice-1')?.paid.paise).toBe(200_000);
    expect(demoPayments('demo-invoice-1')).toHaveLength(1);
    expectNoBackendCalls();
  });

  it('shows the billing summary on the job it was raised from', async () => {
    renderDemoApp('/jobs/demo-job-1');

    await screen.findByRole('heading', { name: 'JOB-2627-0001', level: 1 });
    expect(await screen.findByRole('link', { name: 'INV-2627-0001' })).toBeInTheDocument();
    expect(screen.getByText('Outstanding on this job')).toBeInTheDocument();
    expectNoBackendCalls();
  });
});

describe('demo inventory', () => {
  it('lists the materials and flags the ones that are low', async () => {
    renderDemoApp(ROUTES.inventory);

    expect(await screen.findByRole('heading', { name: 'Inventory', level: 1 })).toBeInTheDocument();
    // Material names also appear in the movement ledger below, so the table is
    // where the stock figures are checked.
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Flex 440 GSM roll')).toBeInTheDocument();
    expect(screen.getByText(/2 materials are at or below the minimum/)).toBeInTheDocument();
    expect(screen.getByText('Out of stock')).toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('issues stock in memory and leaves a movement behind', async () => {
    const user = userEvent.setup({ delay: null });
    renderDemoApp(ROUTES.inventory);

    const table = await screen.findByRole('table');
    const row = within(table).getByText('Aluminium frame section').closest('tr');
    if (!row) throw new Error('material row missing');
    await user.click(within(row).getByRole('button', { name: /stock in \/ out/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/quantity/i), '20');
    await user.click(within(dialog).getByRole('button', { name: /record movement/i }));

    await waitFor(() => {
      expect(demoInventoryItem('demo-material-3')?.currentStock).toBe(160);
    });
    const [latest] = demoInventoryTransactions({ itemId: 'demo-material-3' });
    expect(latest?.direction).toBe('out');
    expect(latest?.balanceAfter).toBe(160);
    expectNoBackendCalls();
  });

  it('refuses to take stock below zero, and changes nothing', async () => {
    const user = userEvent.setup({ delay: null });
    renderDemoApp(ROUTES.inventory);

    const table = await screen.findByRole('table');
    const row = within(table).getByText('Solvent ink - cyan').closest('tr');
    if (!row) throw new Error('material row missing');
    await user.click(within(row).getByRole('button', { name: /stock in \/ out/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/quantity/i), '99');
    await user.click(within(dialog).getByRole('button', { name: /record movement/i }));

    expect(await within(dialog).findByText(/there is only/i)).toBeInTheDocument();
    expect(demoInventoryItem('demo-material-2')?.currentStock).toBe(3);
    expect(demoInventoryTransactions({ itemId: 'demo-material-2' })).toHaveLength(0);
    expectNoBackendCalls();
  });

  it('shows what was used on a job, on the job itself', async () => {
    renderDemoApp('/jobs/demo-job-1');

    await screen.findByRole('heading', { name: 'JOB-2627-0001', level: 1 });
    expect(await screen.findByText('Material used')).toBeInTheDocument();
    expect(screen.getByText(/Two hoardings, 10 x 6 ft with wastage/)).toBeInTheDocument();
    expectNoBackendCalls();
  });
});
