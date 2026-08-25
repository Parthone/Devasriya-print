import { describe, expect, it } from 'vitest';

import { resolveSession } from '@/features/auth/session';
import type { AuthAccount, UserProfile } from '@/types/auth';

const account: AuthAccount = { uid: 'uid-1', email: 'staff@devasriya.test' };

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  const now = new Date('2026-08-24T10:00:00.000Z');
  return {
    id: 'uid-1',
    name: 'Staff Member',
    email: 'staff@devasriya.test',
    mobile: '9876500001',
    designation: 'graphic-designer',
    department: 'design',
    role: 'designer',
    isActive: true,
    createdAt: now,
    createdBy: 'uid-owner',
    updatedAt: now,
    updatedBy: 'uid-owner',
    ...overrides,
  };
}

describe('resolveSession', () => {
  it('is unauthenticated with no rejection when signed out', () => {
    expect(resolveSession({ account: null, profile: null })).toEqual({
      status: 'unauthenticated',
      rejection: null,
    });
  });

  it('rejects an authenticated user that has no profile document', () => {
    expect(resolveSession({ account, profile: null })).toEqual({
      status: 'unauthenticated',
      rejection: 'no-profile',
    });
  });

  it('rejects a deactivated employee', () => {
    expect(resolveSession({ account, profile: profile({ isActive: false }) })).toEqual({
      status: 'unauthenticated',
      rejection: 'inactive',
    });
  });

  it('admits an active employee', () => {
    const session = resolveSession({ account, profile: profile() });
    expect(session.status).toBe('authenticated');
    if (session.status !== 'authenticated') return;
    expect(session.user.uid).toBe('uid-1');
    expect(session.user.name).toBe('Staff Member');
    expect(session.user.isAdmin).toBe(false);
  });

  it('marks owner and admin roles as administrators', () => {
    for (const role of ['owner', 'admin'] as const) {
      const session = resolveSession({ account, profile: profile({ role }) });
      expect(session.status === 'authenticated' && session.user.isAdmin).toBe(true);
    }
  });

  it('falls back to the profile email when the auth account has none', () => {
    const session = resolveSession({ account: { uid: 'uid-1', email: null }, profile: profile() });
    expect(session.status === 'authenticated' && session.user.email).toBe('staff@devasriya.test');
  });
});

describe('customer portal sessions', () => {
  const account = {
    id: 'uid-customer',
    customerId: 'customer-1',
    customerName: 'Shreeji Traders',
    email: 'accounts@shreeji.example',
    preferredLanguage: 'hi' as const,
    isActive: true,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    createdBy: 'uid-owner',
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedBy: 'uid-owner',
  };

  it('resolves a uid with a portal account into a customer session, not a staff one', () => {
    const session = resolveSession({
      account: { uid: 'uid-customer', email: 'accounts@shreeji.example' },
      profile: null,
      customerAccount: account,
    });

    expect(session.status).toBe('customer');
    if (session.status !== 'customer') throw new Error('expected a customer session');
    expect(session.customer.customerId).toBe('customer-1');
    expect(session.customer.preferredLanguage).toBe('hi');
    // A customer has no role and no permissions at all: there is no shape here
    // that a staff permission check could accidentally succeed against.
    expect(session.customer).not.toHaveProperty('permissions');
    expect(session.customer).not.toHaveProperty('role');
  });

  it('locks out a customer whose portal access has been revoked', () => {
    const session = resolveSession({
      account: { uid: 'uid-customer', email: 'accounts@shreeji.example' },
      profile: null,
      customerAccount: { ...account, isActive: false },
    });

    expect(session).toEqual({ status: 'unauthenticated', rejection: 'inactive' });
  });

  it('still rejects a uid that is neither an employee nor a customer', () => {
    const session = resolveSession({
      account: { uid: 'uid-stranger', email: 'nobody@example.com' },
      profile: null,
      customerAccount: null,
    });

    expect(session).toEqual({ status: 'unauthenticated', rejection: 'no-profile' });
  });
});
