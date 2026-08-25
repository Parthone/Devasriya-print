import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers/AppProviders';
import { routes } from '@/app/router/routes';
import { ROUTES } from '@/constants/routes';
import { resetDemoStore } from '@/features/demo/demo-store';

/**
 * Demo mode: no backend at all, a local owner session, fixed sample data.
 *
 * Every entry point to Supabase is a spy that fails the test if it is ever
 * called - that is the guarantee this mode has to make, and it is the reason
 * the public demo can be served from GitHub Pages with no project behind it.
 */
const backend = vi.hoisted(() => ({
  observeAuthState: vi.fn(),
  signInWithEmail: vi.fn(),
  signOutCurrentUser: vi.fn(),
  sendPasswordSetupEmail: vi.fn(),
  getSupabase: vi.fn(),
}));

vi.mock('@/features/auth/services/auth.service', () => ({
  ensurePersistence: vi.fn(),
  observeAuthState: backend.observeAuthState,
  signInWithEmail: backend.signInWithEmail,
  signOutCurrentUser: backend.signOutCurrentUser,
  sendPasswordSetupEmail: backend.sendPasswordSetupEmail,
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

function renderDemoApp(path: string = ROUTES.login) {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}>
        <RoutesRenderer />
      </MemoryRouter>
    </AppProviders>,
  );
}

async function enterDemo() {
  const user = userEvent.setup({ delay: null });
  renderDemoApp();
  await user.click(await screen.findByRole('button', { name: 'Enter Demo' }));
  return user;
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
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

describe('sign-in screen in demo mode', () => {
  it('offers one demo button instead of a credential form', async () => {
    renderDemoApp();

    expect(await screen.findByRole('button', { name: 'Enter Demo' })).toBeInTheDocument();
    expect(screen.getByText('Demo Mode')).toBeInTheDocument();
    expect(screen.getByText(/no credentials required/i)).toBeInTheDocument();

    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /forgot password/i })).not.toBeInTheDocument();
  });

  it('shows nothing technical about the backend', async () => {
    renderDemoApp();
    await screen.findByRole('button', { name: 'Enter Demo' });

    expect(document.body.textContent).not.toMatch(/supabase|postgres/i);
    expect(document.body.textContent).not.toMatch(/emulator/i);
  });

  it('lands on the dashboard without touching the backend', async () => {
    await enterDemo();

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument();
    expectNoBackendCalls();
  });
});

describe('the demo session', () => {
  it('is a full-permission owner', async () => {
    await enterDemo();
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 });

    const nav = within(screen.getByRole('navigation', { name: 'Main navigation' }));
    for (const label of ['Customers', 'Employees', 'Roles & Permissions', 'Billing & Payments']) {
      expect(nav.getByRole('link', { name: new RegExp(`^${label}`) })).toBeInTheDocument();
    }
    expect(screen.getByText('Demo Owner')).toBeInTheDocument();
  });

  it('survives a reload for the rest of the browser session', async () => {
    await enterDemo();
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 });

    // A reload is a fresh render tree reading the same sessionStorage.
    cleanup();
    renderDemoApp(ROUTES.dashboard);

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Demo Owner')).toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('signs out back to the demo screen', async () => {
    const user = await enterDemo();
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 });

    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(await screen.findByRole('menuitem', { name: /sign out/i }));

    expect(await screen.findByRole('button', { name: 'Enter Demo' })).toBeInTheDocument();
    expect(backend.signOutCurrentUser).not.toHaveBeenCalled();
  });

  it('keeps protected routes protected before entering the demo', async () => {
    renderDemoApp(ROUTES.customers);

    expect(await screen.findByRole('button', { name: 'Enter Demo' })).toBeInTheDocument();
  });
});

describe('demo data', () => {
  it('shows the customer directory with sample records', async () => {
    const user = await enterDemo();
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 });

    await user.click(
      within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', {
        name: /^Customers/,
      }),
    );

    expect(await screen.findByRole('heading', { name: 'Customers', level: 1 })).toBeInTheDocument();
    const table = within(await screen.findByRole('table'));
    expect(table.getByRole('link', { name: 'Ravi Kumar' })).toBeInTheDocument();
    expect(table.getByRole('link', { name: 'Shreeji Traders' })).toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('opens a customer detail page', async () => {
    await enterDemo();
    cleanup();
    renderDemoApp('/customers/demo-customer-2');

    expect(
      await screen.findByRole('heading', { name: 'Shreeji Traders', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('08AABCU9603R1ZM')).toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('shows the employee directory with sample staff', async () => {
    await enterDemo();
    cleanup();
    renderDemoApp(ROUTES.users);

    expect(await screen.findByRole('heading', { name: 'Employees', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('Anita Verma')).toBeInTheDocument();
    expect(screen.getByText('Imran Sheikh')).toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('shows the roles and permissions reference', async () => {
    await enterDemo();
    cleanup();
    renderDemoApp(ROUTES.roles);

    expect(
      await screen.findByRole('heading', { name: 'Roles & Permissions', level: 1 }),
    ).toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('adds a customer in memory for the current session', async () => {
    const user = await enterDemo();
    cleanup();
    renderDemoApp(ROUTES.customers);
    await screen.findByRole('table');

    await user.click(await screen.findByRole('button', { name: /add customer/i }));
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText(/customer name/i), 'Demo Added Customer');
    await user.type(within(dialog).getByLabelText(/primary mobile/i), '9876500099');
    await user.type(within(dialog).getByLabelText(/^address/i), '1 Demo Street');
    await user.type(within(dialog).getByLabelText(/city/i), 'Jaipur');
    await user.type(within(dialog).getByLabelText(/pin code/i), '302001');
    await user.click(within(dialog).getByRole('button', { name: 'Add customer' }));

    await waitFor(() => {
      expect(screen.getAllByText('Demo Added Customer').length).toBeGreaterThan(0);
    });
    expectNoBackendCalls();
  });
});

describe('with demo mode off', () => {
  it('restores the normal credential sign-in screen', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false');
    backend.observeAuthState.mockImplementation((listener: (account: null) => void) => {
      listener(null);
      return () => undefined;
    });

    renderDemoApp();

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enter Demo' })).not.toBeInTheDocument();
    expect(screen.queryByText('Demo Mode')).not.toBeInTheDocument();

    // The real provider is mounted and listening to Supabase again.
    expect(backend.observeAuthState).toHaveBeenCalled();
  });

  it('uses the Edge Function provisioner rather than the demo one', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false');
    const { getUserAccountProvisioner } = await import('@/features/users/services/provisioning');
    expect(getUserAccountProvisioner().name).toBe('edge-function');

    vi.stubEnv('VITE_DEMO_MODE', 'true');
    expect(getUserAccountProvisioner().name).toBe('demo');
  });
});
