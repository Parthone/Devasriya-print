import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers/AppProviders';
import { routes } from '@/app/router/routes';
import { ROUTES } from '@/constants/routes';
import { demoEnquiry, resetDemoStore } from '@/features/demo/demo-store';

/**
 * Enquiries and jobs in demo mode.
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

describe('demo enquiries', () => {
  it('lists the sample enquiries', async () => {
    renderDemoApp(ROUTES.enquiries);

    expect(await screen.findByRole('heading', { name: 'Enquiries', level: 1 })).toBeInTheDocument();
    const table = within(await screen.findByRole('table'));
    expect(table.getByRole('link', { name: 'ENQ-2627-0001' })).toBeInTheDocument();
    expect(table.getByText('Ravi Kumar')).toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('finds an enquiry by the customer mobile number', async () => {
    const user = userEvent.setup({ delay: null });
    renderDemoApp(ROUTES.enquiries);

    await screen.findByRole('table');
    await user.type(await screen.findByLabelText('Search enquiries'), '9950400055');

    const table = within(screen.getByRole('table'));
    expect(table.getByRole('link', { name: 'ENQ-2627-0003' })).toBeInTheDocument();
    expect(table.queryByRole('link', { name: 'ENQ-2627-0001' })).not.toBeInTheDocument();
  });

  it('shows an enquiry with its follow-up history', async () => {
    renderDemoApp('/enquiries/demo-enquiry-1');

    expect(
      await screen.findByRole('heading', { name: 'ENQ-2627-0001', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Wedding cards, 250 pieces/)).toBeInTheDocument();
    expect(screen.getByText(/shared two paper options/i)).toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('records a follow-up in memory', async () => {
    const user = userEvent.setup({ delay: null });
    renderDemoApp('/enquiries/demo-enquiry-1');

    await screen.findByRole('heading', { name: 'ENQ-2627-0001', level: 1 });
    await user.click(screen.getByRole('button', { name: /follow-up/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(/what happened/i),
      'Customer confirmed the design',
    );
    await user.click(within(dialog).getByRole('button', { name: /save follow-up/i }));

    await waitFor(() => {
      expect(demoEnquiry('demo-enquiry-1')?.followUps.length).toBe(2);
    });
    expect(demoEnquiry('demo-enquiry-1')?.followUps[0]?.note).toBe('Customer confirmed the design');
    expectNoBackendCalls();
  });
});

describe('demo jobs', () => {
  it('lists the sample jobs with their pickup office', async () => {
    renderDemoApp(ROUTES.jobs);

    expect(
      await screen.findByRole('heading', { name: 'Jobs & Orders', level: 1 }),
    ).toBeInTheDocument();
    const table = within(await screen.findByRole('table'));
    expect(table.getByRole('link', { name: 'JOB-2627-0001' })).toBeInTheDocument();
    expect(table.getByText('City Branch, Market Road')).toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('shows a job with its collection details and its enquiry', async () => {
    renderDemoApp('/jobs/demo-job-1');

    expect(
      await screen.findByRole('heading', { name: 'JOB-2627-0001', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('City Branch, Market Road')).toBeInTheDocument();
    expect(screen.getByText('Sunil Yadav')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ENQ-2627-0002' })).toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('shows a direct job as having no enquiry', async () => {
    renderDemoApp('/jobs/demo-job-2');

    expect(
      await screen.findByRole('heading', { name: 'JOB-2627-0002', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Direct job, no enquiry')).toBeInTheDocument();
  });
});

describe('demo conversion', () => {
  it('converts an enquiry into a job and lands on the job', async () => {
    const user = userEvent.setup({ delay: null });
    renderDemoApp('/enquiries/demo-enquiry-3');

    await screen.findByRole('heading', { name: 'ENQ-2627-0003', level: 1 });
    await user.click(screen.getByRole('button', { name: /convert to job/i }));

    const dialog = await screen.findByRole('dialog');
    const title = within(dialog).getByLabelText(/job title/i);
    await user.clear(title);
    await user.type(title, 'Admission season posters');
    await user.click(within(dialog).getByRole('button', { name: /create job/i }));

    expect(await screen.findByRole('heading', { level: 1, name: /^JOB-/ })).toBeInTheDocument();

    const converted = demoEnquiry('demo-enquiry-3');
    expect(converted?.status).toBe('converted');
    expect(converted?.convertedJobId).toBeTruthy();
    expectNoBackendCalls();
  });

  it('offers a link to the job instead of converting twice', async () => {
    renderDemoApp('/enquiries/demo-enquiry-2');

    await screen.findByRole('heading', { name: 'ENQ-2627-0002', level: 1 });
    expect(screen.getByRole('link', { name: /view job/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /convert to job/i })).not.toBeInTheDocument();
  });
});

describe('demo pickup offices', () => {
  it('lists the sample offices for the owner', async () => {
    renderDemoApp(ROUTES.locations);

    expect(
      await screen.findByRole('heading', { name: 'Pickup offices', level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Main Press, Station Road')).toBeInTheDocument();
    expect(screen.getByText('City Branch, Market Road')).toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('adds an office in memory', async () => {
    const user = userEvent.setup({ delay: null });
    renderDemoApp(ROUTES.locations);

    await screen.findByRole('heading', { name: 'Pickup offices', level: 1 });
    await user.click(screen.getByRole('button', { name: /add office/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/office name/i), 'North Branch');
    await user.type(within(dialog).getByLabelText(/address/i), '5 Ring Road, Jaipur');
    await user.type(within(dialog).getByLabelText(/contact person/i), 'Demo Contact');
    await user.click(within(dialog).getByRole('button', { name: /add office/i }));

    expect(await screen.findByText('North Branch')).toBeInTheDocument();
    expectNoBackendCalls();
  });
});

describe('demo session survives navigation', () => {
  it('keeps working after a reload on a job page', async () => {
    renderDemoApp('/jobs/demo-job-1');
    await screen.findByRole('heading', { name: 'JOB-2627-0001', level: 1 });

    cleanup();
    renderDemoApp('/jobs/demo-job-1');

    expect(
      await screen.findByRole('heading', { name: 'JOB-2627-0001', level: 1 }),
    ).toBeInTheDocument();
    expectNoBackendCalls();
  });
});

describe('demo dashboard', () => {
  it('shows real counts from the sample data without touching the backend', async () => {
    renderDemoApp(ROUTES.dashboard);

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument();
    await screen.findByText('Recent updates');

    // Six demo customers, one archived.
    expect(screen.getByRole('link', { name: 'Customers: 5' })).toBeInTheDocument();
    // Two of the three demo enquiries are still open.
    expect(screen.getByRole('link', { name: 'Open enquiries: 2' })).toBeInTheDocument();
    // Both demo jobs are active.
    expect(screen.getByRole('link', { name: 'Active jobs: 2' })).toBeInTheDocument();

    expect(screen.getByText('Enquiry pipeline')).toBeInTheDocument();
    expect(screen.getByText('Job overview')).toBeInTheDocument();
    expect(screen.getByText('Upcoming deliveries')).toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('lists demo jobs with their pickup office in upcoming deliveries', async () => {
    renderDemoApp(ROUTES.dashboard);
    await screen.findByText('Upcoming deliveries');

    const table = within(await screen.findByRole('table'));
    expect(table.getByText('JOB-2627-0001')).toBeInTheDocument();
    expect(table.getByText('City Branch, Market Road')).toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('offers the demo owner every quick action', async () => {
    renderDemoApp(ROUTES.dashboard);
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 });

    expect(screen.getByRole('link', { name: /add customer/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /add enquiry/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create job/i })).toBeInTheDocument();
    expectNoBackendCalls();
  });

  it('shows no backend wording on the dashboard', async () => {
    renderDemoApp(ROUTES.dashboard);
    await screen.findByText('Recent updates');

    expect(document.body.textContent).not.toMatch(/supabase|postgres/i);
    expect(document.body.textContent).not.toMatch(/emulator/i);
  });
});

describe('demo pricing', () => {
  it('shows the priced items, the working and the total on a demo job', async () => {
    renderDemoApp('/jobs/demo-job-1');

    expect(await screen.findByText('Measurements & pricing')).toBeInTheDocument();
    expect(screen.getAllByText('Flex Print 440 GSM').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/10 x 6 foot x 2/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Repeat customer discount').length).toBeGreaterThan(0);
    // Subtotal 5,780 less 280 leaves 5,500.
    expect(screen.getAllByText(/5,500\.00/).length).toBeGreaterThan(0);
    expectNoBackendCalls();
  });

  it('adds a priced item in memory', async () => {
    const user = userEvent.setup({ delay: null });
    renderDemoApp('/jobs/demo-job-2');

    await screen.findByText('Measurements & pricing');
    await user.click(screen.getByRole('button', { name: /add item/i }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox', { name: /rate card item/i }));
    await user.click(await screen.findByRole('option', { name: 'Flex Print 440 GSM' }));
    await user.type(within(dialog).getByLabelText(/^width/i), '4');
    await user.type(within(dialog).getByLabelText(/^height/i), '3');
    await user.click(within(dialog).getByRole('button', { name: 'Add item' }));

    // 12 sq ft at Rs 25 is Rs 300.
    await waitFor(() => {
      expect(screen.getAllByText(/300\.00/).length).toBeGreaterThan(0);
    });
    expectNoBackendCalls();
  });

  it('lists the demo rate card for the owner', async () => {
    renderDemoApp(ROUTES.products);

    expect(
      await screen.findByRole('heading', { name: 'Products & rates', level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Aluminium Frame')).toBeInTheDocument();
    expect(screen.getByText('Sunboard (discontinued)')).toBeInTheDocument();
    expectNoBackendCalls();
  });
});
