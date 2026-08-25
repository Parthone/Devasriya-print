import type { Language } from '@/constants/india';
import {
  parseCustomer,
  type Customer,
  type CustomerInput,
  type CustomerType,
} from '@/features/customers/types';
import { toAudit, toOptional, type AuditRow } from '@/lib/supabase/rows';
import type { Id } from '@/types/common';

export interface CustomerRow extends AuditRow {
  id: string;
  name: string;
  name_lower: string;
  business_name: string | null;
  type: CustomerType;
  mobile: string;
  alternate_mobile: string | null;
  email: string | null;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string | null;
  preferred_language: Language;
  notes: string | null;
  is_archived: boolean;
  /** Embedded: the portal login attached to this customer, if there is one. */
  customer_accounts?: { id: string }[] | { id: string } | null;
}

export const CUSTOMER_COLUMNS =
  'id, name, name_lower, business_name, type, mobile, alternate_mobile, email, address, city,' +
  ' state, pincode, gstin, preferred_language, notes, is_archived,' +
  ' created_at, created_by, updated_at, updated_by, customer_accounts(id)';

function portalUserId(row: CustomerRow): Id | null {
  const linked = row.customer_accounts;
  if (!linked) return null;
  return Array.isArray(linked) ? (linked[0]?.id ?? null) : linked.id;
}

export function toCustomer(row: CustomerRow): Customer {
  return parseCustomer(
    {
      id: row.id,
      name: row.name,
      nameLower: row.name_lower,
      businessName: toOptional(row.business_name),
      type: row.type,
      mobile: row.mobile,
      alternateMobile: toOptional(row.alternate_mobile),
      email: toOptional(row.email),
      address: row.address,
      city: row.city,
      state: row.state,
      pincode: row.pincode,
      gstin: toOptional(row.gstin),
      preferredLanguage: row.preferred_language,
      notes: toOptional(row.notes),
      isArchived: row.is_archived,
      // The link to a portal login lives on customer_accounts, so a customer
      // can never be repointed at a different login by editing this record.
      portalUserId: portalUserId(row),
      ...toAudit(row),
    },
    row.id,
  );
}

/** The editable columns. Blank optional fields are stored as NULL, not ''. */
export function toCustomerRow(input: CustomerInput, actorId: Id) {
  return {
    name: input.name,
    business_name: input.businessName ?? null,
    type: input.type,
    mobile: input.mobile,
    alternate_mobile: input.alternateMobile ?? null,
    email: input.email ?? null,
    address: input.address,
    city: input.city,
    state: input.state,
    pincode: input.pincode,
    gstin: input.gstin ?? null,
    preferred_language: input.preferredLanguage,
    notes: input.notes ?? null,
    is_archived: input.isArchived,
    updated_by: actorId,
  };
}
