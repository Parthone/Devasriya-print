import { isDemoMode } from '@/config/demo';
import {
  addDemoCustomer,
  demoCustomer,
  demoCustomers,
  setDemoCustomerArchived,
  updateDemoCustomer,
} from '@/features/demo/demo-store';
import {
  CUSTOMER_COLUMNS,
  toCustomer,
  toCustomerRow,
  type CustomerRow,
} from '@/features/customers/services/customer.rows';
import type { Customer, CustomerInput } from '@/features/customers/types';
import { getSupabase } from '@/lib/supabase/client';
import { toAppError, unwrap, unwrapMaybe } from '@/lib/supabase/errors';
import { TABLES } from '@/services/base/tables';
import { AppError, type Id } from '@/types/common';

/**
 * Safety cap on the directory fetch.
 *
 * Module 3 loads the customer list once, caches it, and searches and paginates
 * it in the browser. That gives substring search across every field, which is
 * what people expect, and stays cheap at this size. If a business ever passes
 * this many customers the load reports it (see `capReached`) so search can move
 * server-side behind this same service - the UI calls these functions, never
 * the database.
 */
export const CUSTOMER_FETCH_CAP = 1000;

export interface CustomerDirectory {
  customers: Customer[];
  /** True when there are more customers than the cap; the list is incomplete. */
  capReached: boolean;
  cap: number;
}

export async function listCustomers(): Promise<CustomerDirectory> {
  if (isDemoMode()) {
    return { customers: demoCustomers(), capReached: false, cap: CUSTOMER_FETCH_CAP };
  }

  // One extra row tells us whether the cap was reached.
  const rows = unwrap(
    await getSupabase()
      .from(TABLES.customers)
      .select(CUSTOMER_COLUMNS)
      .order('name_lower', { ascending: true })
      .limit(CUSTOMER_FETCH_CAP + 1)
      .returns<CustomerRow[]>(),
  );

  const capReached = rows.length > CUSTOMER_FETCH_CAP;
  if (capReached) {
    console.warn(
      `[customers] more than ${String(CUSTOMER_FETCH_CAP)} customers exist; ` +
        'the directory is showing the first page only. Move search server-side.',
    );
  }

  return {
    customers: rows.slice(0, CUSTOMER_FETCH_CAP).map(toCustomer),
    capReached,
    cap: CUSTOMER_FETCH_CAP,
  };
}

export async function getCustomer(id: Id): Promise<Customer> {
  const customer = await findCustomer(id);
  if (!customer) throw new AppError('not-found', `No customer with id "${id}".`);
  return customer;
}

export async function findCustomer(id: Id): Promise<Customer | null> {
  if (isDemoMode()) return demoCustomer(id);

  const row = unwrapMaybe(
    await getSupabase()
      .from(TABLES.customers)
      .select(CUSTOMER_COLUMNS)
      .eq('id', id)
      .maybeSingle<CustomerRow>(),
  );
  return row ? toCustomer(row) : null;
}

export async function createCustomer(input: CustomerInput, actorId: Id): Promise<Customer> {
  if (isDemoMode()) return addDemoCustomer(input, actorId);

  try {
    const row = unwrap(
      await getSupabase()
        .from(TABLES.customers)
        .insert({ ...toCustomerRow(input, actorId), created_by: actorId })
        .select(CUSTOMER_COLUMNS)
        .single<CustomerRow>(),
    );
    return toCustomer(row);
  } catch (error) {
    throw toAppError(error);
  }
}

/**
 * Updates the editable fields only.
 *
 * `created_at`, `created_by` and the portal link are not in the column level
 * UPDATE grant, so an ordinary edit cannot touch them however the payload is
 * shaped. A cleared optional field is stored as NULL rather than an empty
 * string, so reads stay clean.
 */
export async function updateCustomer(id: Id, input: CustomerInput, actorId: Id): Promise<void> {
  if (isDemoMode()) {
    updateDemoCustomer(id, input, actorId);
    return;
  }

  try {
    const { error } = await getSupabase()
      .from(TABLES.customers)
      .update(toCustomerRow(input, actorId))
      .eq('id', id);
    if (error) throw error;
  } catch (error) {
    throw toAppError(error);
  }
}

/** Customers are archived, never deleted: their history must stay intact. */
export async function setCustomerArchived(id: Id, isArchived: boolean, actorId: Id): Promise<void> {
  if (isDemoMode()) {
    setDemoCustomerArchived(id, isArchived, actorId);
    return;
  }

  try {
    const { error } = await getSupabase()
      .from(TABLES.customers)
      .update({ is_archived: isArchived, updated_by: actorId })
      .eq('id', id);
    if (error) throw error;
  } catch (error) {
    throw toAppError(error);
  }
}
