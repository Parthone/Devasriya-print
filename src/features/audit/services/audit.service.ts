import { orderBy, serverTimestamp, where, type DocumentData } from 'firebase/firestore';

import type { AuditActor, AuditEntryDraft, AuditEvent } from '@/features/audit/types';
import { parseAuditEvent } from '@/features/audit/types';
import { COLLECTIONS } from '@/services/base/collections';
import { FirestoreRepository } from '@/services/base/repository';
import type { Id } from '@/types/common';

export const auditRepository = new FirestoreRepository<AuditEvent>(
  COLLECTIONS.auditLogs,
  parseAuditEvent,
);

/**
 * Builds the document written for an audit entry.
 *
 * Timestamps come from the server so the trail cannot be back-dated by a
 * client with a wrong clock; firestore.rules requires exactly that.
 */
export function buildAuditDocument(draft: AuditEntryDraft, actor: AuditActor): DocumentData {
  return {
    action: draft.action,
    targetUserId: draft.targetUserId,
    targetName: draft.targetName,
    actorId: actor.uid,
    actorName: actor.name,
    before: draft.before,
    after: draft.after,
    createdAt: serverTimestamp(),
    createdBy: actor.uid,
    updatedAt: serverTimestamp(),
    updatedBy: actor.uid,
  };
}

/** Most recent entries for one employee, newest first. */
export async function listAuditEventsForUser(userId: Id, pageSize = 50): Promise<AuditEvent[]> {
  const page = await auditRepository.list({
    constraints: [where('targetUserId', '==', userId), orderBy('createdAt', 'desc')],
    pageSize,
  });
  return page.items;
}

/** Most recent entries across all employees, newest first. */
export async function listRecentAuditEvents(pageSize = 50): Promise<AuditEvent[]> {
  const page = await auditRepository.list({
    constraints: [orderBy('createdAt', 'desc')],
    pageSize,
  });
  return page.items;
}
