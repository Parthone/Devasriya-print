import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers/AppProviders';
import { routes } from '@/app/router/routes';
import { ROUTES } from '@/constants/routes';
import type { AuthAccount, UserProfile, UserRole } from '@/types/auth';

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  listUserProfiles: vi.fn(),
  listAuditEventsForUser: vi.fn(),
}));

vi.mock('@/features/auth/services/auth.service', () => ({
  ensurePersistence: vi.fn().mockResolvedValue(undefined),
  observeAuthState: (listener: (account: AuthAccount | null) => void) => {
    listener({ uid: 'uid-user', email: 'user@devasriya.test' });
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
  userProfileRepository: {},
}));

vi.mock('@/features/audit/services/audit.service', () => ({
  listAuditEventsForUser: mocks.listAuditEventsForUser,
  listRecentAuditEvents: vi.fn(),
  buildAuditDocument: vi.fn(),
  auditRepository: {},
}));

const NOW = new Date('2026-08-24T10:00:00.000Z');

function profileFor(role: UserRole, overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'uid-user',
    name: 'Test User',
    email: 'user@devasriya.test',
    mobile: '9876500001',
    designation: 'manager',
    department: 'management',
    role,
    isActive: true,
    createdAt: NOW,
    createdBy: 'uid-owner',
    updatedAt: NOW,
    updatedBy: 'uid-owner',
    ...overrides,
  };
}

/**
 * Nav links for unbuilt modules carry a "Soon" badge, so the accessible name is
 * the label plus that badge; match on the label prefix.
 */
function navLinkMatcher(label: string): RegExp {
  // Labels are plain words, spaces and ampersands - nothing regex-special.
  return new RegExp(`^${label}`);
}

function RoutesRenderer() {
  return useRoutes(routes);
}

function renderAsRole(role: UserRole, path: string) {
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
  mocks.listUserProfiles.mockResolvedValue([profileFor('owner', { id: 'uid-owner' })]);
  mocks.listAuditEventsForUser.mockResolvedValue([]);
});

describe('sidebar visibility', () => {
  const cases: { role: UserRole; visible: string[]; hidden: string[] }[] = [
    {
      role: 'owner',
      visible: ['Dashboard', 'Customers', 'Billing & Payments', 'Employees', 'Roles & Permissions'],
      hidden: [],
    },
    {
      role: 'admin',
      visible: ['Dashboard', 'Employees', 'Roles & Permissions', 'Billing & Payments'],
      hidden: [],
    },
    {
      role: 'sales',
      visible: ['Dashboard', 'Customers', 'Enquiries', 'Estimates', 'Billing & Payments'],
      hidden: ['Employees', 'Roles & Permissions'],
    },
    {
      role: 'designer',
      visible: ['Dashboard', 'Designs & Approvals', 'Inventory'],
      hidden: ['Billing & Payments', 'Employees', 'Estimates', 'Reports', 'Roles & Permissions'],
    },
    {
      role: 'production',
      visible: ['Dashboard', 'Jobs & Orders', 'Inventory', 'Employees', 'Reports'],
      hidden: ['Billing & Payments', 'Estimates', 'Roles & Permissions'],
    },
    {
      role: 'accounts',
      visible: ['Dashboard', 'Billing & Payments', 'Estimates', 'Reports'],
      hidden: ['Employees', 'Enquiries', 'Roles & Permissions'],
    },
    {
      role: 'viewer',
      visible: ['Dashboard', 'Customers', 'Reports'],
      hidden: ['Billing & Payments', 'Employees', 'Inventory', 'Roles & Permissions'],
    },
  ];

  it.each(cases)('shows $role only the areas they may open', async ({ role, visible, hidden }) => {
    renderAsRole(role, ROUTES.dashboard);
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 });

    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    for (const label of visible) {
      expect(within(nav).getByRole('link', { name: navLinkMatcher(label) })).toBeInTheDocument();
    }
    for (const label of hidden) {
      expect(
        within(nav).queryByRole('link', { name: navLinkMatcher(label) }),
      ).not.toBeInTheDocument();
    }
  });
});

describe('direct URL access', () => {
  const employeesAllowed: UserRole[] = ['owner', 'admin', 'production'];
  const employeesDenied: UserRole[] = ['sales', 'designer', 'accounts', 'viewer'];
  const settingsAllowed: UserRole[] = ['owner', 'admin'];
  const settingsDenied: UserRole[] = ['sales', 'designer', 'production', 'accounts', 'viewer'];
  const billingAllowed: UserRole[] = ['owner', 'admin', 'sales', 'accounts'];
  const billingDenied: UserRole[] = ['designer', 'production', 'viewer'];

  it.each(employeesAllowed)('lets %s open the employees directory by URL', async (role) => {
    renderAsRole(role, ROUTES.users);
    expect(await screen.findByRole('heading', { name: 'Employees', level: 1 })).toBeInTheDocument();
  });

  it.each(employeesDenied)('blocks %s from the employees directory by URL', async (role) => {
    renderAsRole(role, ROUTES.users);
    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
  });

  it.each(settingsAllowed)('lets %s open the roles reference by URL', async (role) => {
    renderAsRole(role, ROUTES.roles);
    expect(
      await screen.findByRole('heading', { name: 'Roles & Permissions', level: 1 }),
    ).toBeInTheDocument();
  });

  it.each(settingsDenied)('blocks %s from the roles reference by URL', async (role) => {
    renderAsRole(role, ROUTES.roles);
    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
  });

  it.each(billingAllowed)('lets %s open a permitted future module by URL', async (role) => {
    renderAsRole(role, ROUTES.billing);
    expect(
      await screen.findByRole('heading', { name: 'Billing & Payments', level: 1 }),
    ).toBeInTheDocument();
  });

  it.each(billingDenied)('blocks %s from a future module they may not see', async (role) => {
    renderAsRole(role, ROUTES.billing);
    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
  });

  it('still sends a signed-out visitor to sign in rather than to access denied', async () => {
    mocks.getUserProfile.mockResolvedValue(null);
    render(
      <AppProviders>
        <MemoryRouter initialEntries={[ROUTES.users]}>
          <RoutesRenderer />
        </MemoryRouter>
      </AppProviders>,
    );
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('action visibility on the employees page', () => {
  it('gives an administrator the management actions', async () => {
    renderAsRole('admin', ROUTES.users);

    expect(await screen.findByRole('button', { name: /add employee/i })).toBeInTheDocument();
    expect(await screen.findByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
  });

  it('gives a production user a read-only directory', async () => {
    renderAsRole('production', ROUTES.users);

    expect(await screen.findByRole('heading', { name: 'Employees', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add employee/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /actions for/i })).not.toBeInTheDocument();
  });
});
