import { isDemoMode } from '@/config/demo';
import type { AuditActor, AuditEntryDraft } from '@/features/audit/types';
import {
  addDemoEmployee,
  demoEmployee,
  demoEmployees,
  recordDemoAuditEvent,
  updateDemoEmployee,
} from '@/features/demo/demo-store';
import type { EmployeeUpdateInput } from '@/features/users/types';
import {
  STAFF_COLUMNS,
  toUserProfile,
  type StaffProfileRow,
} from '@/features/users/services/user-profile.rows';
import { getSupabase } from '@/lib/supabase/client';
import { toAppError, unwrap, unwrapMaybe } from '@/lib/supabase/errors';
import { TABLES } from '@/services/base/tables';
import { USER_ROLE_LABELS, type UserProfile } from '@/types/auth';
import { AppError, type Id } from '@/types/common';

/**
 * Reads the signed-in user profile.
 *
 * A missing row and a policy refusal are both reported as "no profile": from
 * the point of view of the application the account is not provisioned, and the
 * session resolver rejects it either way. This is also what makes a customer
 * portal uid fall through to the customer account lookup.
 */
export async function getUserProfile(uid: Id): Promise<UserProfile | null> {
  if (isDemoMode()) return demoEmployee(uid);

  try {
    const row = unwrapMaybe(
      await getSupabase()
        .from(TABLES.staffProfiles)
        .select(STAFF_COLUMNS)
        .eq('id', uid)
        .maybeSingle<StaffProfileRow>(),
    );
    return row ? toUserProfile(row) : null;
  } catch (error) {
    const appError = toAppError(error);
    if (appError.code === 'permission-denied' || appError.code === 'not-found') {
      return null;
    }
    throw appError;
  }
}

export async function listUserProfiles(): Promise<UserProfile[]> {
  if (isDemoMode()) return demoEmployees();

  const rows = unwrap(
    await getSupabase()
      .from(TABLES.staffProfiles)
      .select(STAFF_COLUMNS)
      .order('name', { ascending: true })
      .limit(200)
      .returns<StaffProfileRow[]>(),
  );
  return rows.map(toUserProfile);
}

export interface CreateUserProfileInput extends EmployeeUpdateInput {
  email: string;
}

/**
 * Writes a profile change and its audit entries in one transaction.
 *
 * Atomicity is the point: the record and the trail of who changed it commit
 * together, so the history can never be missing an entry for a change that did
 * happen. `save_staff_profile` runs as the caller, so every statement inside it
 * is still checked by row level security.
 */
function auditPayload(drafts: AuditEntryDraft[], actor: AuditActor) {
  return drafts.map((draft) => ({
    action: draft.action,
    target_user_id: draft.targetUserId,
    target_name: draft.targetName,
    actor_name: actor.name,
    before: draft.before,
    after: draft.after,
  }));
}

async function saveProfile(
  uid: Id,
  payload: Record<string, unknown>,
  isNew: boolean,
  drafts: AuditEntryDraft[],
  actor: AuditActor,
): Promise<StaffProfileRow> {
  const { data, error } = await getSupabase()
    .rpc('save_staff_profile', {
      p_id: uid,
      p_payload: payload,
      p_is_new: isNew,
      p_audit: auditPayload(drafts, actor),
    })
    .single<StaffProfileRow>();

  if (error) throw toAppError(error);
  return data;
}

export async function createUserProfile(
  uid: Id,
  input: CreateUserProfileInput,
  actor: AuditActor,
): Promise<UserProfile> {
  if (isDemoMode()) {
    const created = addDemoEmployee(input, actor.uid);
    recordDemoAuditEvent({
      action: 'employee-created',
      targetUserId: created.id,
      targetName: created.name,
      actorId: actor.uid,
      actorName: actor.name,
      before: '',
      after: `${USER_ROLE_LABELS[created.role]}, ${created.isActive ? 'active' : 'inactive'}`,
      createdAt: created.createdAt,
      createdBy: actor.uid,
      updatedAt: created.createdAt,
      updatedBy: actor.uid,
    });
    return created;
  }

  try {
    const row = await saveProfile(
      uid,
      {
        name: input.name,
        email: input.email,
        mobile: input.mobile,
        designation: input.designation,
        department: input.department,
        role: input.role,
        is_active: input.isActive,
      },
      true,
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
    return toUserProfile(row);
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

  if (isDemoMode()) {
    updateDemoEmployee(uid, changes, actor.uid);
    for (const draft of diffProfile(previous, changes)) {
      recordDemoAuditEvent({
        ...draft,
        actorId: actor.uid,
        actorName: actor.name,
        createdAt: new Date(),
        createdBy: actor.uid,
        updatedAt: new Date(),
        updatedBy: actor.uid,
      });
    }
    return;
  }

  try {
    await saveProfile(
      uid,
      {
        name: changes.name,
        mobile: changes.mobile,
        designation: changes.designation,
        department: changes.department,
        role: changes.role,
        is_active: changes.isActive,
      },
      false,
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

  if (isDemoMode()) {
    updateDemoEmployee(target.id, { isActive }, actor.uid);
    recordDemoAuditEvent({
      action: 'status-changed',
      targetUserId: target.id,
      targetName: target.name,
      actorId: actor.uid,
      actorName: actor.name,
      before: target.isActive ? 'Active' : 'Inactive',
      after: isActive ? 'Active' : 'Inactive',
      createdAt: new Date(),
      createdBy: actor.uid,
      updatedAt: new Date(),
      updatedBy: actor.uid,
    });
    return;
  }

  try {
    await saveProfile(
      target.id,
      { is_active: isActive },
      false,
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
 * a row level security policy, so it holds even if this code is bypassed.
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
