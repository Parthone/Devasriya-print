import type { AuditActor } from '@/features/audit/types';
import { getUserAccountProvisioner } from '@/features/users/services/provisioning';
import type { UserAccountProvisioner } from '@/features/users/services/provisioning/types';
import {
  createUserProfile,
  updateUserProfile,
  type CreateUserProfileInput,
} from '@/features/users/services/user-profile.service';
import type { EmployeeInput, EmployeeUpdateInput } from '@/features/users/types';
import type { UserProfile } from '@/types/auth';
import { AppError, type Id } from '@/types/common';

export interface CreateEmployeeDeps {
  provisioner: UserAccountProvisioner;
  createProfile: (
    uid: Id,
    input: CreateUserProfileInput,
    actor: AuditActor,
  ) => Promise<UserProfile>;
}

function defaultDeps(): CreateEmployeeDeps {
  return { provisioner: getUserAccountProvisioner(), createProfile: createUserProfile };
}

/**
 * Creates a staff member: sign-in account, profile document, password email.
 *
 * Order matters. The account is created first because the profile document is
 * keyed by the Auth UID. If the profile write fails the sign-in account is left
 * behind - the client SDK cannot delete another account - so the error says so
 * explicitly instead of pretending nothing happened. The password email is sent
 * last and a failure there is reported without rolling back a valid employee.
 */
export async function createEmployee(
  input: EmployeeInput,
  actor: AuditActor,
  deps: CreateEmployeeDeps = defaultDeps(),
): Promise<UserProfile> {
  const account = await deps.provisioner.createAccount(input.email);

  let profile: UserProfile;
  try {
    profile = await deps.createProfile(account.uid, input, actor);
  } catch (error) {
    throw new AppError(
      'conflict',
      `The sign-in account for ${input.email} was created but its profile could not be saved. ` +
        'The account exists without access to any data. Remove it from the Firebase console, ' +
        'then add the employee again.',
      error,
    );
  }

  try {
    await deps.provisioner.sendPasswordSetupEmail(input.email);
  } catch (error) {
    throw new AppError(
      'unavailable',
      `${input.name} was created, but the password setup email could not be sent. ` +
        'Use "Resend password email" on the employee row.',
      error,
    );
  }

  return profile;
}

export async function updateEmployee(
  uid: Id,
  input: EmployeeUpdateInput,
  previous: UserProfile,
  actor: AuditActor,
): Promise<void> {
  await updateUserProfile(uid, input, previous, actor);
}

export async function resendPasswordSetupEmail(
  email: string,
  provisioner: UserAccountProvisioner = getUserAccountProvisioner(),
): Promise<void> {
  await provisioner.sendPasswordSetupEmail(email);
}
