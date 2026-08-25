import type { Department, Designation } from '@/constants/organization';
import { toAudit, type AuditRow } from '@/lib/supabase/rows';
import { parseUserProfile } from '@/features/users/types';
import type { UserProfile, UserRole } from '@/types/auth';

export interface StaffProfileRow extends AuditRow {
  id: string;
  name: string;
  email: string;
  mobile: string;
  designation: string;
  department: string;
  role: UserRole;
  is_active: boolean;
}

export const STAFF_COLUMNS =
  'id, name, email, mobile, designation, department, role, is_active, created_at, created_by, updated_at, updated_by';

/** One `staff_profiles` row as the domain object, validated on the way through. */
export function toUserProfile(row: StaffProfileRow): UserProfile {
  return parseUserProfile(
    {
      id: row.id,
      name: row.name,
      email: row.email,
      mobile: row.mobile,
      designation: row.designation as Designation,
      department: row.department as Department,
      role: row.role,
      isActive: row.is_active,
      ...toAudit(row),
    },
    row.id,
  );
}
