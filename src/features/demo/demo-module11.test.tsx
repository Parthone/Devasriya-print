import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers/AppProviders';
import { routes } from '@/app/router/routes';
import { ROUTES } from '@/constants/routes';
import { resetDemoStore } from '@/features/demo/demo-store';

/**
 * Reports and settings in demo mode.
 *
 * Every backend entry point is a spy that must never be called. Reports are
 * built entirely from the caches the rest of the application already holds, so
 * there is nothing here that could reach for a database even by accident.
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

describe('demo reports', () => {
  it('opens on the jobs report and offers the others the role can read', async () => {
    renderDemoApp(ROUTES.reports);

    expect(await screen.findByRole('heading', { name: 'Reports', level: 1 })).toBeInTheDocument();
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Jobs & production',
      'Sales & customers',
      'Payments & outstanding',
      'Inventory & low stock',
      'Employee workload',
      'Overdue & pending work',
    ]);
    expectNoBackendCalls();
  });

  it('builds the outstanding report from the same records the billing screen shows', async () => {
    const user = userEvent.setup({ delay: null });
    renderDemoApp(ROUTES.reports);

    await screen.findByRole('heading', { name: 'Reports', level: 1 });
    await user.click(await screen.findByRole('tab', { name: 'Payments & outstanding' }));

    // Widened to all time so the fictional dates are always inside the period.
    await user.click(screen.getByRole('combobox', { name: 'Period' }));
    await user.click(await screen.findByRole('option', { name: 'All time' }));

    expect(await screen.findByText('INV-2627-0001')).toBeInTheDocument();
    expect(screen.getByText(/₹6,250.00 outstanding/)).toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('narrows the inventory report to what needs reordering', async () => {
    const user = userEvent.setup({ delay: null });
    renderDemoApp(ROUTES.reports);

    await screen.findByRole('heading', { name: 'Reports', level: 1 });
    await user.click(await screen.findByRole('tab', { name: 'Inventory & low stock' }));
    await user.click(screen.getByRole('combobox', { name: 'Filter' }));
    await user.click(await screen.findByRole('option', { name: 'Low or out of stock' }));

    expect(await screen.findByText('Solvent ink - cyan')).toBeInTheDocument();
    expect(screen.queryByText('Flex 440 GSM roll')).not.toBeInTheDocument();
    expectNoBackendCalls();
  });
});

describe('demo settings', () => {
  it('gathers the settings screens rather than leaving the link dead', async () => {
    renderDemoApp(ROUTES.settings);

    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();

    // The sidebar links to the same screens, so the hub cards are read from
    // the page body rather than the whole document.
    const hub = within(screen.getByRole('main'));
    expect(hub.getByRole('link', { name: /Employees/ })).toBeInTheDocument();
    expect(hub.getByRole('link', { name: /Production Stages/ })).toBeInTheDocument();
    expect(hub.getByRole('link', { name: /Pickup Offices/ })).toBeInTheDocument();
    expectNoBackendCalls();
  });
});
