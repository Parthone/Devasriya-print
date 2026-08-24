import { parseUserProfile, type EmployeeUpdateInput } from '@/features/users/types';
import { toAppError } from '@/lib/firebase/errors';
import { COLLECTIONS } from '@/services/base/collections';
import { FirestoreRepository, orderBy } from '@/services/base/repository';
import type { UserProfile, UserRole } from '@/types/auth';
import { AppError, type Id } from '@/types/common';

/** Data-access for `users/{uid}`. The document id is the Firebase Auth UID. */
export const userProfileRepository = new FirestoreRepository<UserProfile>(
  COLLECTIONS.users,
  parseUserProfile,
);

/**
 * Reads the signed-in user profile.
 *
 * A missing document and a rules rejection are both reported as "no profile":
 * from the point of view of the application the account is not provisioned, and
 * the session resolver rejects it either way.
 */
export async function getUserProfile(uid: Id): Promise<UserProfile | null> {
  try {
    return await userProfileRepository.findById(uid);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.code === 'permission-denied' || appError.code === 'not-found') {
      return null;
    }
    throw appError;
  }
}

export async function listUserProfiles(): Promise<UserProfile[]> {
  const page = await userProfileRepository.list({
    constraints: [orderBy('name', 'asc')],
    pageSize: 200,
  });
  return page.items;
}

export interface CreateUserProfileInput extends EmployeeUpdateInput {
  email: string;
}

export async function createUserProfile(
  uid: Id,
  input: CreateUserProfileInput,
  actorId: Id,
): Promise<UserProfile> {
  return userProfileRepository.create(uid, input, actorId);
}

export async function updateUserProfile(
  uid: Id,
  changes: EmployeeUpdateInput,
  actorId: Id,
): Promise<void> {
  guardSelfDemotion(uid, actorId, changes);
  await userProfileRepository.update(uid, changes, actorId);
}

export async function setUserActive(uid: Id, isActive: boolean, actorId: Id): Promise<void> {
  if (uid === actorId && !isActive) {
    throw new AppError('invalid-input', 'You cannot deactivate your own account.');
  }
  await userProfileRepository.update(uid, { isActive }, actorId);
}

export async function changeUserRole(uid: Id, role: UserRole, actorId: Id): Promise<void> {
  if (uid === actorId) {
    throw new AppError('invalid-input', 'You cannot change your own role.');
  }
  await userProfileRepository.update(uid, { role }, actorId);
}

/**
 * Stops an administrator from locking themselves - and possibly the whole
 * business - out of the software. The same restriction exists in
 * firestore.rules, so it holds even if this code is bypassed.
 */
function guardSelfDemotion(uid: Id, actorId: Id, changes: EmployeeUpdateInput): void {
  if (uid !== actorId) return;
  if (!changes.isActive) {
    throw new AppError('invalid-input', 'You cannot deactivate your own account.');
  }
}
