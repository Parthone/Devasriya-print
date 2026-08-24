import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';

import { buildAuditDocument } from '@/features/audit/services/audit.service';
import type { AuditActor, AuditEntryDraft } from '@/features/audit/types';
import { parseUserProfile, type EmployeeUpdateInput } from '@/features/users/types';
import { getDb } from '@/lib/firebase/client';
import { toAppError } from '@/lib/firebase/errors';
import { COLLECTIONS } from '@/services/base/collections';
import { FirestoreRepository, orderBy } from '@/services/base/repository';
import { USER_ROLE_LABELS, type UserProfile } from '@/types/auth';
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

/**
 * Writes a profile change and its audit entries in one batch.
 *
 * Batching is the point: the record and the trail of who changed it commit
 * together, so the history can never be missing an entry for a change that did
 * happen.
 */
async function commitWithAudit(
  write: (batch: ReturnType<typeof writeBatch>) => void,
  drafts: AuditEntryDraft[],
  actor: AuditActor,
): Promise<void> {
  const db = getDb();
  const batch = writeBatch(db);
  write(batch);
  for (const draft of drafts) {
    batch.set(doc(collection(db, COLLECTIONS.auditLogs)), buildAuditDocument(draft, actor));
  }
  await batch.commit();
}

export async function createUserProfile(
  uid: Id,
  input: CreateUserProfileInput,
  actor: AuditActor,
): Promise<UserProfile> {
  try {
    const db = getDb();
    await commitWithAudit(
      (batch) => {
        batch.set(doc(db, COLLECTIONS.users, uid), {
          ...input,
          createdAt: serverTimestamp(),
          createdBy: actor.uid,
          updatedAt: serverTimestamp(),
          updatedBy: actor.uid,
        });
      },
      [
        {
          action: 'employee-created',
          targetUserId: uid,
          targetName: input.name,
          before: '',
          after: `${USER_ROLE_LABELS[input.role]}, ${input.isActive ? 'active' : 'inactive'}`,
        },
      ],
      actor,
    );

    const now = new Date();
    return {
      ...input,
      id: uid,
      createdAt: now,
      createdBy: actor.uid,
      updatedAt: now,
      updatedBy: actor.uid,
    };
  } catch (error) {
    throw toAppError(error);
  }
}

/** Audit entries describing the difference between two versions of a profile. */
function diffProfile(previous: UserProfile, changes: EmployeeUpdateInput): AuditEntryDraft[] {
  const drafts: AuditEntryDraft[] = [];
  const target = { targetUserId: previous.id, targetName: changes.name || previous.name };

  if (changes.role !== previous.role) {
    drafts.push({
      ...target,
      action: 'role-changed',
      before: USER_ROLE_LABELS[previous.role],
      after: USER_ROLE_LABELS[changes.role],
    });
  }

  if (changes.isActive !== previous.isActive) {
    drafts.push({
      ...target,
      action: 'status-changed',
      before: previous.isActive ? 'Active' : 'Inactive',
      after: changes.isActive ? 'Active' : 'Inactive',
    });
  }

  const detailsChanged =
    changes.name !== previous.name ||
    changes.mobile !== previous.mobile ||
    changes.designation !== previous.designation ||
    changes.department !== previous.department;

  if (detailsChanged) {
    drafts.push({
      ...target,
      action: 'profile-updated',
      before: `${previous.name}, ${previous.designation}, ${previous.department}`,
      after: `${changes.name}, ${changes.designation}, ${changes.department}`,
    });
  }

  return drafts;
}

export async function updateUserProfile(
  uid: Id,
  changes: EmployeeUpdateInput,
  previous: UserProfile,
  actor: AuditActor,
): Promise<void> {
  guardSelfChange(uid, actor.uid, previous, changes);

  try {
    const db = getDb();
    await commitWithAudit(
      (batch) => {
        batch.update(doc(db, COLLECTIONS.users, uid), {
          ...changes,
          updatedAt: serverTimestamp(),
          updatedBy: actor.uid,
        });
      },
      diffProfile(previous, changes),
      actor,
    );
  } catch (error) {
    throw toAppError(error);
  }
}

export async function setUserActive(
  target: UserProfile,
  isActive: boolean,
  actor: AuditActor,
): Promise<void> {
  if (target.id === actor.uid) {
    throw new AppError('invalid-input', 'You cannot change your own account status.');
  }

  try {
    const db = getDb();
    await commitWithAudit(
      (batch) => {
        batch.update(doc(db, COLLECTIONS.users, target.id), {
          isActive,
          updatedAt: serverTimestamp(),
          updatedBy: actor.uid,
        });
      },
      [
        {
          action: 'status-changed',
          targetUserId: target.id,
          targetName: target.name,
          before: target.isActive ? 'Active' : 'Inactive',
          after: isActive ? 'Active' : 'Inactive',
        },
      ],
      actor,
    );
  } catch (error) {
    throw toAppError(error);
  }
}

/**
 * Stops an administrator from locking themselves - and possibly the whole
 * business - out of the software. The same restriction exists in
 * firestore.rules, so it holds even if this code is bypassed.
 */
function guardSelfChange(
  uid: Id,
  actorId: Id,
  previous: UserProfile,
  changes: EmployeeUpdateInput,
): void {
  if (uid !== actorId) return;
  if (!changes.isActive) {
    throw new AppError('invalid-input', 'You cannot deactivate your own account.');
  }
  if (changes.role !== previous.role) {
    throw new AppError('invalid-input', 'You cannot change your own role.');
  }
}
