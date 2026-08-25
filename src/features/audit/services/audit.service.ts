import { isDemoMode } from '@/config/demo';
import type { AuditEvent } from '@/features/audit/types';
import { parseAuditEvent } from '@/features/audit/types';
import { demoAuditEventsFor } from '@/features/demo/demo-store';
import { getSupabase } from '@/lib/supabase/client';
import { unwrap } from '@/lib/supabase/errors';
import { toDate } from '@/lib/supabase/rows';
import { TABLES } from '@/services/base/tables';
import type { Id } from '@/types/common';

interface AuditRow {
  id: string;
  action: AuditEvent['action'];
  target_user_id: string;
  target_name: string;
  actor_id: string;
  actor_name: string;
  before: string;
  after: string;
  created_at: string;
  created_by: string;
}

const COLUMNS =
  'id, action, target_user_id, target_name, actor_id, actor_name, before, after, created_at, created_by';

/**
 * One audit row as the domain object.
 *
 * The trail is append-only: there is no update or delete grant on the table for
 * anybody, and no `updated_at` column to change. The domain shape still carries
 * `updatedAt`/`updatedBy` for consistency with every other record, so they are
 * filled from their created counterparts - which is exactly what they always
 * were.
 */
function toAuditEvent(row: AuditRow): AuditEvent {
  return parseAuditEvent(
    {
      id: row.id,
      action: row.action,
      targetUserId: row.target_user_id,
      targetName: row.target_name,
      actorId: row.actor_id,
      actorName: row.actor_name,
      before: row.before,
      after: row.after,
      createdAt: toDate(row.created_at),
      createdBy: row.created_by,
      updatedAt: toDate(row.created_at),
      updatedBy: row.created_by,
    },
    row.id,
  );
}

/** Most recent entries for one employee, newest first. */
export async function listAuditEventsForUser(userId: Id, pageSize = 50): Promise<AuditEvent[]> {
  if (isDemoMode()) return demoAuditEventsFor(userId);

  const rows = unwrap(
    await getSupabase()
      .from(TABLES.auditEvents)
      .select(COLUMNS)
      .eq('target_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(pageSize)
      .returns<AuditRow[]>(),
  );
  return rows.map(toAuditEvent);
}

/** Most recent entries across all employees, newest first. */
export async function listRecentAuditEvents(pageSize = 50): Promise<AuditEvent[]> {
  const rows = unwrap(
    await getSupabase()
      .from(TABLES.auditEvents)
      .select(COLUMNS)
      .order('created_at', { ascending: false })
      .limit(pageSize)
      .returns<AuditRow[]>(),
  );
  return rows.map(toAuditEvent);
}
