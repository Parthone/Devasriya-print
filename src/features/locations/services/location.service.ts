import { isDemoMode } from '@/config/demo';
import { addDemoLocation, demoLocations, updateDemoLocation } from '@/features/demo/demo-store';
import { parseLocation, type Location, type LocationInput } from '@/features/locations/types';
import { getSupabase } from '@/lib/supabase/client';
import { toAppError, unwrap } from '@/lib/supabase/errors';
import { toAudit, toOptional, type AuditRow } from '@/lib/supabase/rows';
import { TABLES } from '@/services/base/tables';
import type { Id } from '@/types/common';

interface LocationRow extends AuditRow {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  contact_user_id: string | null;
  contact_name: string | null;
  contact_mobile: string | null;
  is_active: boolean;
}

const COLUMNS =
  'id, name, address, phone, contact_user_id, contact_name, contact_mobile, is_active,' +
  ' created_at, created_by, updated_at, updated_by';

function toLocation(row: LocationRow): Location {
  return parseLocation(
    {
      id: row.id,
      name: row.name,
      address: row.address,
      phone: toOptional(row.phone),
      contactUserId: row.contact_user_id,
      contactName: toOptional(row.contact_name),
      contactMobile: toOptional(row.contact_mobile),
      isActive: row.is_active,
      ...toAudit(row),
    },
    row.id,
  );
}

function toRow(input: LocationInput, actorId: Id) {
  return {
    name: input.name,
    address: input.address,
    phone: input.phone ?? null,
    contact_name: input.contactName ?? null,
    contact_mobile: input.contactMobile ?? null,
    is_active: input.isActive,
    updated_by: actorId,
  };
}

/** Every pickup office. Readable by any signed-in, active staff member. */
export async function listLocations(): Promise<Location[]> {
  if (isDemoMode()) return demoLocations();

  const rows = unwrap(
    await getSupabase()
      .from(TABLES.locations)
      .select(COLUMNS)
      .order('name', { ascending: true })
      .limit(100)
      .returns<LocationRow[]>(),
  );
  return rows.map(toLocation);
}

export async function createLocation(input: LocationInput, actorId: Id): Promise<Location> {
  if (isDemoMode()) return addDemoLocation(input, actorId);

  try {
    const row = unwrap(
      await getSupabase()
        .from(TABLES.locations)
        .insert({ ...toRow(input, actorId), contact_user_id: null, created_by: actorId })
        .select(COLUMNS)
        .single<LocationRow>(),
    );
    return toLocation(row);
  } catch (error) {
    throw toAppError(error);
  }
}

export async function updateLocation(id: Id, input: LocationInput, actorId: Id): Promise<void> {
  if (isDemoMode()) {
    updateDemoLocation(id, input, actorId);
    return;
  }

  try {
    const { error } = await getSupabase()
      .from(TABLES.locations)
      .update(toRow(input, actorId))
      .eq('id', id);
    if (error) throw error;
  } catch (error) {
    throw toAppError(error);
  }
}
