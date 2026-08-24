import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers/AppProviders';
import { routes } from '@/app/router/routes';
import type { AuthAccount, UserProfile } from '@/types/auth';

const mocks = vi.hoisted(() => ({
  account: { uid: 'uid-owner', email: 'owner@devasriya.test' },
  getUserProfile: vi.fn(),
  listUserProfiles: vi.fn(),
  setUserActive: vi.fn(),
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  resendPasswordSetupEmail: vi.fn(),
  signOutCurrentUser: vi.fn(),
}));

vi.mock('@/features/auth/services/auth.service', () => ({
  ensurePersistence: vi.fn().mockResolvedValue(undefined),
  observeAuthState: (listener: (account: AuthAccount | null) => void) => {
    listener(mocks.account);
    return () => undefined;
  },
  signInWithEmail: vi.fn(),
  signOutCurrentUser: mocks.signOutCurrentUser,
  sendPasswordSetupEmail: vi.fn(),
  getCurrentIdToken: vi.fn(),
}));

vi.mock('@/features/users/services/user-profile.service', () => ({
  getUserProfile: mocks.getUserProfile,
  listUserProfiles: mocks.listUserProfiles,
  setUserActive: mocks.setUserActive,
  createUserProfile: vi.fn(),
  updateUserProfile: vi.fn(),
  changeUserRole: vi.fn(),
  userProfileRepository: {},
}));

vi.mock('@/features/users/services/employee.service', () => ({
  createEmployee: mocks.createEmployee,
  updateEmployee: mocks.updateEmployee,
  resendPasswordSetupEmail: mocks.resendPasswordSetupEmail,
}));

const NOW = new Date('2026-08-24T10:00:00.000Z');

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'uid-owner',
    name: 'Owner Account',
    email: 'owner@devasriya.test',
    mobile: '9876500001',
    designation: 'owner',
    department: 'management',
    role: 'owner',
    isActive: true,
    createdAt: NOW,
    createdBy: 'uid-owner',
    updatedAt: NOW,
    updatedBy: 'uid-owner',
    ...overrides,
  };
}

const owner = makeProfile();
const designer = makeProfile({
  id: 'uid-staff',
  name: 'Design Studio Staff',
  email: 'designer@devasriya.test',
  mobile: '9876500002',
  designation: 'graphic-designer',
  department: 'design',
  role: 'designer',
});
const inactive = makeProfile({
  id: 'uid-inactive',
  name: 'Deactivated Employee',
  email: 'inactive@devasriya.test',
  mobile: '9876500003',
  designation: 'helper',
  department: 'finishing',
  role: 'viewer',
  isActive: false,
});

function RoutesRenderer() {
  return useRoutes(routes);
}

function renderUsersPage() {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={['/settings/users']}>
        <RoutesRenderer />
      </MemoryRouter>
    </AppProviders>,
  );
}

/** Renders the directory and opens the row action menu for one employee. */
async function openRowMenu(name: string) {
  const user = userEvent.setup();
  renderUsersPage();
  await user.click(await screen.findByRole('button', { name: `Actions for ${name}` }));
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserProfile.mockResolvedValue(owner);
  mocks.listUserProfiles.mockResolvedValue([owner, designer, inactive]);
  mocks.setUserActive.mockResolvedValue(undefined);
  mocks.createEmployee.mockResolvedValue(designer);
  mocks.updateEmployee.mockResolvedValue(undefined);
  mocks.resendPasswordSetupEmail.mockResolvedValue(undefined);
  mocks.signOutCurrentUser.mockResolvedValue(undefined);
});

describe('employee directory', () => {
  it('lists staff with their department, role and status', async () => {
    renderUsersPage();

    expect(await screen.findByText('Design Studio Staff')).toBeInTheDocument();
    const row = screen.getByText('Deactivated Employee').closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('Inactive')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('Finishing')).toBeInTheDocument();
    expect(screen.getByText('+91 98765 00002')).toBeInTheDocument();
  });

  it('filters the directory by search term', async () => {
    const user = userEvent.setup();
    renderUsersPage();

    await screen.findByText('Design Studio Staff');
    await user.type(screen.getByLabelText('Search employees'), 'inactive@');

    expect(screen.getByText('Deactivated Employee')).toBeInTheDocument();
    expect(screen.queryByText('Design Studio Staff')).not.toBeInTheDocument();
  });
});

describe('creating an employee', () => {
  it('sends normalised details to the service and never handles a password', async () => {
    const user = userEvent.setup();
    renderUsersPage();

    await screen.findByText('Design Studio Staff');
    await user.click(screen.getByRole('button', { name: /add employee/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText(/password/i)).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/full name/i), 'Ravi Kumar');
    await user.type(within(dialog).getByLabelText(/email/i), 'Ravi.Kumar@Devasriya.test');
    await user.type(within(dialog).getByLabelText(/mobile/i), '+91 98765 43210');
    await user.click(within(dialog).getByRole('button', { name: 'Add employee' }));

    await waitFor(() => {
      expect(mocks.createEmployee).toHaveBeenCalledTimes(1);
    });
    expect(mocks.createEmployee).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Ravi Kumar',
        email: 'ravi.kumar@devasriya.test',
        mobile: '9876543210',
        isActive: true,
      }),
      'uid-owner',
    );
  });

  it('blocks an invalid mobile number before calling the service', async () => {
    const user = userEvent.setup();
    renderUsersPage();

    await screen.findByText('Design Studio Staff');
    await user.click(screen.getByRole('button', { name: /add employee/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/full name/i), 'Ravi Kumar');
    await user.type(within(dialog).getByLabelText(/email/i), 'ravi@devasriya.test');
    await user.type(within(dialog).getByLabelText(/mobile/i), '12345');
    await user.click(within(dialog).getByRole('button', { name: 'Add employee' }));

    expect(await within(dialog).findByText('Enter a valid 10 digit mobile number')).toBeVisible();
    expect(mocks.createEmployee).not.toHaveBeenCalled();
  });
});

describe('editing an employee', () => {
  it('saves changes without touching the sign-in email', async () => {
    const user = await openRowMenu('Design Studio Staff');
    await user.click(await screen.findByRole('menuitem', { name: /edit details/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/email/i)).toBeDisabled();

    const nameInput = within(dialog).getByLabelText(/full name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Design Studio Lead');
    await user.click(within(dialog).getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mocks.updateEmployee).toHaveBeenCalledTimes(1);
    });
    const [uid, changes, actorId] = mocks.updateEmployee.mock.calls[0] as [
      string,
      Record<string, unknown>,
      string,
    ];
    expect(uid).toBe('uid-staff');
    expect(actorId).toBe('uid-owner');
    expect(changes.name).toBe('Design Studio Lead');
    expect(changes).not.toHaveProperty('email');
  });
});

describe('activation and deactivation', () => {
  it('deactivates an employee after confirmation', async () => {
    const user = await openRowMenu('Design Studio Staff');
    await user.click(await screen.findByRole('menuitem', { name: /deactivate/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/will be signed out and blocked/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => {
      expect(mocks.setUserActive).toHaveBeenCalledWith('uid-staff', false, 'uid-owner');
    });
  });

  it('reactivates a deactivated employee', async () => {
    const user = await openRowMenu('Deactivated Employee');
    await user.click(await screen.findByRole('menuitem', { name: /activate/i }));

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Activate' }));

    await waitFor(() => {
      expect(mocks.setUserActive).toHaveBeenCalledWith('uid-inactive', true, 'uid-owner');
    });
  });

  it('does not let an administrator deactivate their own account', async () => {
    const user = await openRowMenu('Owner Account');
    const item = await screen.findByRole('menuitem', { name: /deactivate/i });

    expect(item).toHaveAttribute('data-disabled');
    await user.keyboard('{Escape}');
    expect(mocks.setUserActive).not.toHaveBeenCalled();
  });

  it('resends the password setup email', async () => {
    const user = await openRowMenu('Design Studio Staff');
    await user.click(await screen.findByRole('menuitem', { name: /send password email/i }));

    await waitFor(() => {
      expect(mocks.resendPasswordSetupEmail).toHaveBeenCalledWith('designer@devasriya.test');
    });
  });
});
