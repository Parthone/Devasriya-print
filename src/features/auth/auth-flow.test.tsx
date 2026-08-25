import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers/AppProviders';
import { routes } from '@/app/router/routes';
import type { AuthAccount, UserProfile } from '@/types/auth';
import { AppError } from '@/types/common';

const mocks = vi.hoisted(() => ({
  account: null as { uid: string; email: string | null } | null,
  signInWithEmail: vi.fn(),
  signOutCurrentUser: vi.fn(),
  sendPasswordSetupEmail: vi.fn(),
  getUserProfile: vi.fn(),
  listUserProfiles: vi.fn(),
}));

vi.mock('@/features/auth/services/auth.service', () => ({
  ensurePersistence: vi.fn().mockResolvedValue(undefined),
  observeAuthState: (listener: (account: AuthAccount | null) => void) => {
    listener(mocks.account);
    return () => undefined;
  },
  signInWithEmail: mocks.signInWithEmail,
  signOutCurrentUser: mocks.signOutCurrentUser,
  sendPasswordSetupEmail: mocks.sendPasswordSetupEmail,
  getCurrentIdToken: vi.fn(),
}));

vi.mock('@/features/users/services/user-profile.service', () => ({
  getUserProfile: mocks.getUserProfile,
  listUserProfiles: mocks.listUserProfiles,
  createUserProfile: vi.fn(),
  updateUserProfile: vi.fn(),
  setUserActive: vi.fn(),
  changeUserRole: vi.fn(),
  userProfileRepository: {},
}));

const NOW = new Date('2026-08-24T10:00:00.000Z');

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'uid-staff',
    name: 'Design Studio Staff',
    email: 'designer@devasriya.test',
    mobile: '9876500002',
    designation: 'graphic-designer',
    department: 'design',
    role: 'designer',
    isActive: true,
    createdAt: NOW,
    createdBy: 'uid-owner',
    updatedAt: NOW,
    updatedBy: 'uid-owner',
    ...overrides,
  };
}

/** All alert text on screen: sign-in errors and session rejection banners. */
function alertTexts(): string {
  return screen
    .queryAllByRole('alert')
    .map((element) => element.textContent ?? '')
    .join(' | ');
}

function RoutesRenderer() {
  return useRoutes(routes);
}

function renderApp(path: string) {
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
  mocks.account = null;
  mocks.getUserProfile.mockResolvedValue(null);
  mocks.listUserProfiles.mockResolvedValue([]);
  mocks.signOutCurrentUser.mockResolvedValue(undefined);
});

describe('protected routes', () => {
  it('sends an unauthenticated visitor to the sign-in screen', async () => {
    renderApp('/dashboard');

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dashboard', level: 1 })).not.toBeInTheDocument();
  });

  it('protects the employees area from staff roles', async () => {
    mocks.account = { uid: 'uid-staff', email: 'designer@devasriya.test' };
    mocks.getUserProfile.mockResolvedValue(makeProfile());

    renderApp('/settings/users');

    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
  });

  it('opens the employees area for an administrator', async () => {
    mocks.account = { uid: 'uid-owner', email: 'owner@devasriya.test' };
    mocks.getUserProfile.mockResolvedValue(
      makeProfile({ id: 'uid-owner', name: 'Owner Account', role: 'owner' }),
    );

    renderApp('/settings/users');

    expect(await screen.findByRole('heading', { name: 'Employees', level: 1 })).toBeInTheDocument();
  });
});

describe('session restore', () => {
  it('restores an active session without bouncing through the login page', async () => {
    mocks.account = { uid: 'uid-staff', email: 'designer@devasriya.test' };
    mocks.getUserProfile.mockResolvedValue(makeProfile());

    renderApp('/dashboard');

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Design Studio Staff')).toBeInTheDocument();
  });

  it('signs out a restored session whose employee was deactivated', async () => {
    mocks.account = { uid: 'uid-staff', email: 'designer@devasriya.test' };
    mocks.getUserProfile.mockResolvedValue(makeProfile({ isActive: false }));

    renderApp('/dashboard');

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(await screen.findByText(/deactivated/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.signOutCurrentUser).toHaveBeenCalled();
    });
  });

  it('signs out a restored session that has no employee profile', async () => {
    mocks.account = { uid: 'uid-ghost', email: 'ghost@devasriya.test' };
    mocks.getUserProfile.mockResolvedValue(null);

    renderApp('/dashboard');

    expect(await screen.findByText(/no employee profile/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.signOutCurrentUser).toHaveBeenCalled();
    });
  });
});

describe('sign in', () => {
  it('signs an active employee in and lands on the dashboard', async () => {
    const user = userEvent.setup({ delay: null });
    mocks.signInWithEmail.mockResolvedValue({
      uid: 'uid-staff',
      email: 'designer@devasriya.test',
    });
    mocks.getUserProfile.mockResolvedValue(makeProfile());

    renderApp('/login');

    await user.type(screen.getByLabelText(/email/i), 'designer@devasriya.test');
    await user.type(screen.getByLabelText(/password/i), 'Design@12345');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument();
    expect(mocks.signInWithEmail).toHaveBeenCalledWith('designer@devasriya.test', 'Design@12345');
  });

  it('shows an error for invalid credentials and stays signed out', async () => {
    const user = userEvent.setup({ delay: null });
    mocks.signInWithEmail.mockRejectedValue(
      new AppError('unauthenticated', 'You are signed out. Please sign in again.'),
    );

    renderApp('/login');

    await user.type(screen.getByLabelText(/email/i), 'designer@devasriya.test');
    await user.type(screen.getByLabelText(/password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You are signed out');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('rejects a deactivated employee at sign-in and signs them straight back out', async () => {
    const user = userEvent.setup({ delay: null });
    mocks.signInWithEmail.mockResolvedValue({
      uid: 'uid-staff',
      email: 'inactive@devasriya.test',
    });
    mocks.getUserProfile.mockResolvedValue(makeProfile({ isActive: false }));

    renderApp('/login');

    await user.type(screen.getByLabelText(/email/i), 'inactive@devasriya.test');
    await user.type(screen.getByLabelText(/password/i), 'Inactive@123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(alertTexts()).toMatch(/deactivated/i);
    });
    await waitFor(() => {
      expect(mocks.signOutCurrentUser).toHaveBeenCalled();
    });
  });

  it('rejects an account with no employee profile', async () => {
    const user = userEvent.setup({ delay: null });
    mocks.signInWithEmail.mockResolvedValue({ uid: 'uid-ghost', email: 'ghost@devasriya.test' });
    mocks.getUserProfile.mockResolvedValue(null);

    renderApp('/login');

    await user.type(screen.getByLabelText(/email/i), 'ghost@devasriya.test');
    await user.type(screen.getByLabelText(/password/i), 'Ghost@12345');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(alertTexts()).toMatch(/no employee profile/i);
    });
  });

  it('validates the form before calling Firebase', async () => {
    const user = userEvent.setup({ delay: null });

    renderApp('/login');

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(mocks.signInWithEmail).not.toHaveBeenCalled();
  });
});

describe('password reset', () => {
  it('sends a reset link without confirming whether the account exists', async () => {
    const user = userEvent.setup({ delay: null });
    mocks.sendPasswordSetupEmail.mockResolvedValue(undefined);

    renderApp('/login');

    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await user.type(screen.getByLabelText(/email/i), 'someone@devasriya.test');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByText(/password reset link is on its way/i)).toBeInTheDocument();
    expect(mocks.sendPasswordSetupEmail).toHaveBeenCalledWith('someone@devasriya.test');
  });
});

describe('sign out', () => {
  it('signs the user out from the account menu and returns to the sign-in screen', async () => {
    const user = userEvent.setup({ delay: null });
    mocks.account = { uid: 'uid-staff', email: 'designer@devasriya.test' };
    mocks.getUserProfile.mockResolvedValue(makeProfile());

    renderApp('/dashboard');

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(await screen.findByRole('menuitem', { name: /sign out/i }));

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(mocks.signOutCurrentUser).toHaveBeenCalled();
  });
});
