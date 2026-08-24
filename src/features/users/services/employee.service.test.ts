import { describe, expect, it, vi } from 'vitest';

import { createEmployee } from '@/features/users/services/employee.service';
import type { UserAccountProvisioner } from '@/features/users/services/provisioning/types';
import type { EmployeeInput } from '@/features/users/types';
import type { UserProfile } from '@/types/auth';
import { AppError } from '@/types/common';

const input: EmployeeInput = {
  name: 'Ravi Kumar',
  email: 'ravi@devasriya.test',
  mobile: '9876543210',
  designation: 'machine-operator',
  department: 'printing',
  role: 'production',
  isActive: true,
};

const actor = { uid: 'admin-uid', name: 'Owner Account' };

const now = new Date('2026-08-24T10:00:00.000Z');
const savedProfile: UserProfile = {
  ...input,
  id: 'new-uid',
  createdAt: now,
  createdBy: 'admin-uid',
  updatedAt: now,
  updatedBy: 'admin-uid',
};

function fakeProvisioner(overrides: Partial<UserAccountProvisioner> = {}): UserAccountProvisioner {
  return {
    name: 'fake',
    canManageAccountState: false,
    createAccount: vi.fn().mockResolvedValue({ uid: 'new-uid' }),
    sendPasswordSetupEmail: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('createEmployee', () => {
  it('creates the account, then the profile, then emails a password link', async () => {
    const provisioner = fakeProvisioner();
    const createProfile = vi.fn().mockResolvedValue(savedProfile);

    const result = await createEmployee(input, actor, { provisioner, createProfile });

    expect(provisioner.createAccount).toHaveBeenCalledWith('ravi@devasriya.test');
    expect(createProfile).toHaveBeenCalledWith('new-uid', input, actor);
    expect(provisioner.sendPasswordSetupEmail).toHaveBeenCalledWith('ravi@devasriya.test');
    expect(result).toEqual(savedProfile);
  });

  it('never asks for or returns a password', async () => {
    const provisioner = fakeProvisioner();
    const createProfile = vi.fn().mockResolvedValue(savedProfile);

    const result = await createEmployee(input, actor, { provisioner, createProfile });

    expect(JSON.stringify(result)).not.toContain('password');
    expect(Object.keys(input)).not.toContain('password');
  });

  it('does not write a profile when the account cannot be created', async () => {
    const provisioner = fakeProvisioner({
      createAccount: vi.fn().mockRejectedValue(new AppError('already-exists', 'Email in use')),
    });
    const createProfile = vi.fn();

    await expect(createEmployee(input, actor, { provisioner, createProfile })).rejects.toThrow(
      AppError,
    );
    expect(createProfile).not.toHaveBeenCalled();
  });

  it('reports the orphaned account when the profile write fails', async () => {
    const provisioner = fakeProvisioner();
    const createProfile = vi.fn().mockRejectedValue(new AppError('permission-denied', 'nope'));

    await expect(
      createEmployee(input, actor, { provisioner, createProfile }),
    ).rejects.toMatchObject({
      code: 'conflict',
      message: expect.stringContaining('was created but its profile could not be saved') as string,
    });
    expect(provisioner.sendPasswordSetupEmail).not.toHaveBeenCalled();
  });

  it('keeps the employee when only the password email fails', async () => {
    const provisioner = fakeProvisioner({
      sendPasswordSetupEmail: vi.fn().mockRejectedValue(new AppError('unavailable', 'smtp down')),
    });
    const createProfile = vi.fn().mockResolvedValue(savedProfile);

    await expect(
      createEmployee(input, actor, { provisioner, createProfile }),
    ).rejects.toMatchObject({ code: 'unavailable' });
    expect(createProfile).toHaveBeenCalled();
  });
});
