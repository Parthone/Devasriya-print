import { render, screen } from '@testing-library/react';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers/AppProviders';
import { routes } from '@/app/router/routes';
import type { AuthAccount, UserProfile } from '@/types/auth';

/**
 * Shell and routing regression suite.
 *
 * Since Module 1 every application route sits behind authentication, so the
 * shell is exercised with a signed-in administrator. Sign-in, rejection and
 * redirect behaviour is covered in src/features/auth/auth-flow.test.tsx.
 */
const mocks = vi.hoisted(() => ({
  account: null as { uid: string; email: string | null } | null,
  getUserProfile: vi.fn(),
  listUserProfiles: vi.fn(),
}));

vi.mock('@/features/auth/services/auth.service', () => ({
  ensurePersistence: vi.fn().mockResolvedValue(undefined),
  observeAuthState: (listener: (account: AuthAccount | null) => void) => {
    listener(mocks.account);
    return () => undefined;
  },
  signInWithEmail: vi.fn(),
  signOutCurrentUser: vi.fn().mockResolvedValue(undefined),
  sendPasswordSetupEmail: vi.fn(),
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

const OWNER_PROFILE: UserProfile = {
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
};

function RoutesRenderer() {
  return useRoutes(routes);
}

function renderAt(path: string) {
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
  mocks.account = { uid: 'uid-owner', email: 'owner@devasriya.test' };
  mocks.getUserProfile.mockResolvedValue(OWNER_PROFILE);
  mocks.listUserProfiles.mockResolvedValue([OWNER_PROFILE]);
});

describe('application shell', () => {
  it('renders the dashboard inside the app layout', async () => {
    renderAt('/dashboard');

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(screen.getByText('Build roadmap')).toBeInTheDocument();
  });

  it('redirects the root path to the dashboard', async () => {
    renderAt('/');

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument();
  });

  it('shows a placeholder for modules that are not implemented', async () => {
    renderAt('/customers');

    expect(
      await screen.findByRole('heading', { name: 'Customer Management', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Not implemented')).toBeInTheDocument();
  });

  it('renders the sign-in screen in the auth layout when signed out', async () => {
    mocks.account = null;
    mocks.getUserProfile.mockResolvedValue(null);

    renderAt('/login');

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
  });

  it('renders a 404 page for unknown routes', async () => {
    renderAt('/this-route-does-not-exist');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('shows admin-only navigation to administrators', async () => {
    renderAt('/dashboard');

    expect(await screen.findByRole('link', { name: /employees/i })).toBeInTheDocument();
  });

  it('hides admin-only navigation from staff roles', async () => {
    mocks.getUserProfile.mockResolvedValue({ ...OWNER_PROFILE, role: 'designer' });

    renderAt('/dashboard');

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /employees/i })).not.toBeInTheDocument();
  });
});
