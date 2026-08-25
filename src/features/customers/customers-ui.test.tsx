import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers/AppProviders';
import { AppError } from '@/types/common';
import { routes } from '@/app/router/routes';
import { ROUTES } from '@/constants/routes';
import type { Customer } from '@/features/customers/types';
import type { AuthAccount, UserProfile, UserRole } from '@/types/auth';

const mocks = vi.hoisted(() => ({
  signedIn: true,
  getUserProfile: vi.fn(),
  listCustomers: vi.fn(),
  findCustomer: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  setCustomerArchived: vi.fn(),
}));

vi.mock('@/features/auth/services/auth.service', () => ({
  ensurePersistence: vi.fn().mockResolvedValue(undefined),
  observeAuthState: (listener: (account: AuthAccount | null) => void) => {
    listener(mocks.signedIn ? { uid: 'uid-user', email: 'user@devasriya.test' } : null);
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

vi.mock('@/features/customers/services/customer.service', () => ({
  CUSTOMER_FETCH_CAP: 1000,
  customerRepository: {},
  listCustomers: mocks.listCustomers,
  getCustomer: vi.fn(),
  findCustomer: mocks.findCustomer,
  createCustomer: mocks.createCustomer,
  updateCustomer: mocks.updateCustomer,
  setCustomerArchived: mocks.setCustomerArchived,
}));

const NOW = new Date('2026-08-24T10:00:00.000Z');

function makeCustomer(overrides: Partial<Customer> & { id: string; name: string }): Customer {
  return {
    type: 'individual',
    mobile: '9876500001',
    address: '12 Station Road',
    city: 'Jaipur',
    state: 'Rajasthan',
    pincode: '302001',
    preferredLanguage: 'hi',
    isArchived: false,
    portalUserId: null,
    nameLower: overrides.name.toLowerCase(),
    createdAt: NOW,
    createdBy: 'uid-owner',
    updatedAt: NOW,
    updatedBy: 'uid-owner',
    ...overrides,
  };
}

const RAVI = makeCustomer({ id: 'c1', name: 'Ravi Kumar', email: 'ravi@example.com' });
const SHREE = makeCustomer({
  id: 'c2',
  name: 'Shreeji Traders',
  businessName: 'Shreeji Traders Pvt Ltd',
  type: 'business',
  mobile: '9812345678',
  gstin: '08AABCU9603R1ZM',
  city: 'Udaipur',
  preferredLanguage: 'en',
});
const ARCHIVED = makeCustomer({
  id: 'c3',
  name: 'Old Customer',
  mobile: '9800000000',
  isArchived: true,
});

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

/**
 * The directory renders a table for wide screens and cards for narrow ones.
 * jsdom applies no CSS, so both are in the DOM - queries are scoped to the
 * table, and the card view has its own test below.
 */
function table() {
  return within(screen.getByRole('table'));
}

function RoutesRenderer() {
  return useRoutes(routes);
}

function renderAsRole(role: UserRole, path: string = ROUTES.customers) {
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
  mocks.signedIn = true;
  mocks.listCustomers.mockResolvedValue({
    customers: [RAVI, SHREE, ARCHIVED],
    capReached: false,
    cap: 1000,
  });
  mocks.findCustomer.mockResolvedValue(SHREE);
  mocks.createCustomer.mockResolvedValue(RAVI);
  mocks.updateCustomer.mockResolvedValue(undefined);
  mocks.setCustomerArchived.mockResolvedValue(undefined);
});

describe('customer directory', () => {
  it('lists active customers with status and language', async () => {
    renderAsRole('sales');

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(table().getByRole('link', { name: 'Ravi Kumar' })).toBeInTheDocument();
    expect(table().getByRole('link', { name: 'Shreeji Traders' })).toBeInTheDocument();
    // Archived customers are hidden by default.
    expect(table().queryByRole('link', { name: 'Old Customer' })).not.toBeInTheDocument();
    expect(table().getByText('+91 98765 00001')).toBeInTheDocument();
    expect(table().getAllByText('Active').length).toBeGreaterThan(0);
    expect(table().getByText('English')).toBeInTheDocument();
  });

  // Several search terms typed character by character; the default 5s is tight.
  it('searches by name, business name, mobile and GSTIN', { timeout: 20_000 }, async () => {
    const user = userEvent.setup({ delay: null });
    renderAsRole('sales');
    const search = await screen.findByLabelText('Search customers');

    await user.type(search, 'kumar');
    expect(table().getByRole('link', { name: 'Ravi Kumar' })).toBeInTheDocument();
    expect(table().queryByRole('link', { name: 'Shreeji Traders' })).not.toBeInTheDocument();

    for (const term of ['pvt ltd', '9812345678', '08AABCU', 'udaipur']) {
      await user.clear(search);
      await user.type(search, term);
      expect(table().getByRole('link', { name: 'Shreeji Traders' })).toBeInTheDocument();
    }
  });

  it('shows an empty state when nothing matches', async () => {
    const user = userEvent.setup({ delay: null });
    renderAsRole('sales');

    await user.type(await screen.findByLabelText('Search customers'), 'nobody');
    expect(screen.getByText('No customers match this search.')).toBeInTheDocument();
  });

  it('can show archived customers', async () => {
    const user = userEvent.setup({ delay: null });
    renderAsRole('sales');

    await user.click(await screen.findByLabelText('Filter by status'));
    await user.click(await screen.findByRole('option', { name: 'Archived' }));

    expect(await table().findByRole('link', { name: 'Old Customer' })).toBeInTheDocument();
    expect(table().queryByRole('link', { name: 'Ravi Kumar' })).not.toBeInTheDocument();
  });

  it('reports a load failure instead of showing an empty directory', async () => {
    mocks.listCustomers.mockRejectedValue(
      new AppError('permission-denied', 'You do not have permission to do that.'),
    );
    renderAsRole('sales');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have permission to do that.',
    );
  });

  it('warns when the safety cap is reached rather than truncating silently', async () => {
    mocks.listCustomers.mockResolvedValue({ customers: [RAVI], capReached: true, cap: 1000 });
    renderAsRole('sales');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Showing the first 1000 customers only/i,
    );
  });

  it('pages long directories', async () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      makeCustomer({ id: `c${String(index)}`, name: `Customer ${String(index).padStart(3, '0')}` }),
    );
    mocks.listCustomers.mockResolvedValue({ customers: many, capReached: false, cap: 1000 });
    const user = userEvent.setup({ delay: null });
    renderAsRole('sales');

    expect(await screen.findByText(/Showing 25 of 30 customers/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText(/Showing 5 of 30 customers/)).toBeInTheDocument();
  });
});

describe('permission gated actions', () => {
  const canCreate: UserRole[] = ['owner', 'admin', 'sales'];
  const cannotCreate: UserRole[] = ['designer', 'production', 'accounts', 'viewer'];

  it.each(canCreate)('offers %s the add and edit actions', async (role) => {
    renderAsRole(role);

    expect(await screen.findByRole('button', { name: /add customer/i })).toBeInTheDocument();
    await screen.findByRole('table');
    expect(table().getByRole('button', { name: 'Actions for Ravi Kumar' })).toBeInTheDocument();
  });

  it.each(cannotCreate)('gives %s a read-only directory', async (role) => {
    const user = userEvent.setup({ delay: null });
    renderAsRole(role);

    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /add customer/i })).not.toBeInTheDocument();

    // The row menu still offers "view", but no edit or archive.
    await user.click(table().getByRole('button', { name: 'Actions for Ravi Kumar' }));
    expect(await screen.findByRole('menuitem', { name: /view details/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /archive/i })).not.toBeInTheDocument();
  });

  it.each(cannotCreate)('hides edit and archive from %s on the detail page', async (role) => {
    renderAsRole(role, '/customers/c2');

    expect(
      await screen.findByRole('heading', { name: 'Shreeji Traders', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /archive/i })).not.toBeInTheDocument();
  });

  it('sends a signed-out visitor to sign in instead of the directory', async () => {
    mocks.signedIn = false;
    mocks.getUserProfile.mockResolvedValue(null);
    render(
      <AppProviders>
        <MemoryRouter initialEntries={[ROUTES.customers]}>
          <RoutesRenderer />
        </MemoryRouter>
      </AppProviders>,
    );

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(mocks.listCustomers).not.toHaveBeenCalled();
  });
});

describe('adding a customer', () => {
  it('saves normalised values and never sends derived or portal fields', async () => {
    const user = userEvent.setup({ delay: null });
    renderAsRole('sales');

    await user.click(await screen.findByRole('button', { name: /add customer/i }));
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText(/customer name/i), 'Nita Sharma');
    await user.type(within(dialog).getByLabelText(/primary mobile/i), '+91 98765 43210');
    await user.type(within(dialog).getByLabelText(/^address/i), '9 Mall Road');
    await user.type(within(dialog).getByLabelText(/city/i), 'Jaipur');
    await user.type(within(dialog).getByLabelText(/pin code/i), '302001');
    await user.type(within(dialog).getByLabelText(/gstin/i), '08aabcu9603r1zm');
    await user.click(within(dialog).getByRole('button', { name: 'Add customer' }));

    await waitFor(() => {
      expect(mocks.createCustomer).toHaveBeenCalledTimes(1);
    });

    const [input, actorId] = mocks.createCustomer.mock.calls[0] as [
      Record<string, unknown>,
      string,
    ];
    expect(input).toMatchObject({
      name: 'Nita Sharma',
      mobile: '9876543210',
      gstin: '08AABCU9603R1ZM',
      preferredLanguage: 'hi',
      isArchived: false,
    });
    expect(input).not.toHaveProperty('portalUserId');
    expect(input).not.toHaveProperty('nameLower');
    expect(actorId).toBe('uid-user');
  });

  it('blocks invalid input before calling the service', async () => {
    const user = userEvent.setup({ delay: null });
    renderAsRole('sales');

    await user.click(await screen.findByRole('button', { name: /add customer/i }));
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText(/customer name/i), 'X');
    await user.type(within(dialog).getByLabelText(/primary mobile/i), '12345');
    await user.type(within(dialog).getByLabelText(/pin code/i), '99');
    await user.click(within(dialog).getByRole('button', { name: 'Add customer' }));

    expect(await within(dialog).findByText('Customer name is required')).toBeVisible();
    expect(within(dialog).getByText('Enter a valid 10 digit mobile number')).toBeVisible();
    expect(within(dialog).getByText('Enter a valid 6 digit PIN code')).toBeVisible();
    expect(mocks.createCustomer).not.toHaveBeenCalled();
  });

  it('warns about a duplicate primary mobile but still allows saving', async () => {
    const user = userEvent.setup({ delay: null });
    renderAsRole('sales');

    await user.click(await screen.findByRole('button', { name: /add customer/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/primary mobile/i), '9876500001');

    const warning = await within(dialog).findByRole('alert');
    expect(warning).toHaveTextContent(/already used by another customer/i);
    expect(within(warning).getByRole('link', { name: 'Ravi Kumar' })).toHaveAttribute(
      'href',
      '/customers/c1',
    );

    // Saving is still possible: the warning is guidance, not a block.
    expect(within(dialog).getByRole('button', { name: 'Add customer' })).toBeEnabled();
  });
});

describe('editing and archiving', () => {
  it('edits an existing customer without touching the reserved portal link', async () => {
    const user = userEvent.setup({ delay: null });
    renderAsRole('sales');

    await screen.findByRole('table');
    await user.click(table().getByRole('button', { name: 'Actions for Ravi Kumar' }));
    await user.click(await screen.findByRole('menuitem', { name: /^edit/i }));

    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByLabelText(/customer name/i);
    await user.clear(name);
    await user.type(name, 'Ravi Kumar Sharma');
    await user.click(within(dialog).getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mocks.updateCustomer).toHaveBeenCalledTimes(1);
    });
    const [id, input] = mocks.updateCustomer.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe('c1');
    expect(input.name).toBe('Ravi Kumar Sharma');
    expect(input).not.toHaveProperty('portalUserId');
  });

  it('archives a customer after confirmation, explaining nothing is deleted', async () => {
    const user = userEvent.setup({ delay: null });
    renderAsRole('sales');

    await screen.findByRole('table');
    await user.click(table().getByRole('button', { name: 'Actions for Ravi Kumar' }));
    await user.click(await screen.findByRole('menuitem', { name: /archive/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/Nothing is deleted/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));

    await waitFor(() => {
      expect(mocks.setCustomerArchived).toHaveBeenCalledWith('c1', true, 'uid-user');
    });
  });

  it('restores an archived customer', async () => {
    const user = userEvent.setup({ delay: null });
    renderAsRole('sales');

    await user.click(await screen.findByLabelText('Filter by status'));
    await user.click(await screen.findByRole('option', { name: 'Archived' }));
    await user.click(await table().findByRole('button', { name: 'Actions for Old Customer' }));
    await user.click(await screen.findByRole('menuitem', { name: /restore/i }));

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Restore' }));

    await waitFor(() => {
      expect(mocks.setCustomerArchived).toHaveBeenCalledWith('c3', false, 'uid-user');
    });
  });
});

describe('customer detail page', () => {
  it('shows the full record', async () => {
    renderAsRole('sales', '/customers/c2');

    expect(
      await screen.findByRole('heading', { name: 'Shreeji Traders', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('+91 98123 45678')).toBeInTheDocument();
    expect(screen.getByText('08AABCU9603R1ZM')).toBeInTheDocument();
    expect(screen.getByText('Udaipur')).toBeInTheDocument();
    // Shown twice: as a badge and in the contact details.
    expect(screen.getAllByText('English').length).toBeGreaterThan(0);
    expect(mocks.findCustomer).toHaveBeenCalledWith('c2');
  });

  it('does not show jobs, estimates or billing sections yet', async () => {
    renderAsRole('sales', '/customers/c2');

    await screen.findByRole('heading', { name: 'Shreeji Traders', level: 1 });

    // Scoped to the page body: the sidebar legitimately links to those modules.
    const main = within(screen.getByRole('main'));
    expect(main.queryByText(/jobs/i)).not.toBeInTheDocument();
    expect(main.queryByText(/estimates/i)).not.toBeInTheDocument();
    expect(main.queryByText(/invoices/i)).not.toBeInTheDocument();
  });

  it('explains when the customer does not exist', async () => {
    mocks.findCustomer.mockResolvedValue(null);
    renderAsRole('sales', '/customers/missing');

    expect(await screen.findByText('Customer not found')).toBeInTheDocument();
  });
});
