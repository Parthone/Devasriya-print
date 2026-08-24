import { z } from 'zod';

import type { Entity, Id } from '@/types/common';
import { AppError } from '@/types/common';

export const AUDIT_ACTIONS = [
  'employee-created',
  'role-changed',
  'status-changed',
  'profile-updated',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'employee-created': 'Employee created',
  'role-changed': 'Role changed',
  'status-changed': 'Account status changed',
  'profile-updated': 'Details updated',
};

/**
 * An append-only record of a sensitive change.
 *
 * Entries are never edited or deleted - `updatedAt` and `updatedBy` always
 * equal their created counterparts, and firestore.rules enforces that.
 *
 * Honest limitation: entries are written by the browser, in the same batch as
 * the change they describe, so the two commit together or not at all. That
 * makes the trail reliable against mistakes and partial failures, but it is not
 * tamper-proof: an administrator with direct database access could still write
 * or withhold entries. Only a Cloud Function using the Admin SDK (Blaze plan)
 * can make the trail authoritative.
 */
export interface AuditEvent extends Entity {
  action: AuditAction;
  targetUserId: Id;
  targetName: string;
  actorId: Id;
  actorName: string;
  /** Human readable previous value, empty when there was none. */
  before: string;
  /** Human readable new value. */
  after: string;
}

export const auditEventSchema = z.object({
  id: z.string().min(1),
  action: z.enum(AUDIT_ACTIONS),
  targetUserId: z.string().min(1),
  targetName: z.string(),
  actorId: z.string().min(1),
  actorName: z.string(),
  before: z.string(),
  after: z.string(),
  createdAt: z.date(),
  createdBy: z.string().min(1),
  updatedAt: z.date(),
  updatedBy: z.string().min(1),
});

export function parseAuditEvent(data: unknown, id: string): AuditEvent {
  const result = auditEventSchema.safeParse(data);
  if (!result.success) {
    throw new AppError('invalid-input', `Audit entry "${id}" is malformed.`, result.error);
  }
  return result.data;
}

/** Who performed a change. Recorded on both the record and the audit entry. */
export interface AuditActor {
  uid: Id;
  name: string;
}

export interface AuditEntryDraft {
  action: AuditAction;
  targetUserId: Id;
  targetName: string;
  before: string;
  after: string;
}
