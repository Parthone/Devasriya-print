import { isDemoMode } from '@/config/demo';
import type { Language } from '@/constants/india';
import {
  demoCustomerAccount,
  demoCustomerAccountForCustomer,
  setDemoCustomerAccountActive,
  upsertDemoCustomerAccount,
} from '@/features/demo/demo-store';
import { parseCustomerAccount, type CustomerAccount } from '@/features/customer-portal/types';
import { getUserAccountProvisioner } from '@/features/users/services/provisioning';
import { getSupabase } from '@/lib/supabase/client';
import { toAppError, unwrapMaybe } from '@/lib/supabase/errors';
import { toAudit, type AuditRow } from '@/lib/supabase/rows';
import { TABLES } from '@/services/base/tables';
import { AppError, type Id } from '@/types/common';

interface CustomerAccountRow extends AuditRow {
  id: string;
  customer_id: string;
  customer_name: string;
  email: string;
  preferred_language: Language;
  is_active: boolean;
}

const COLUMNS =
  'id, customer_id, customer_name, email, preferred_language, is_active,' +
  ' created_at, created_by, updated_at, updated_by';

function toCustomerAccount(row: CustomerAccountRow): CustomerAccount {
  return parseCustomerAccount(
    {
      id: row.id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      email: row.email,
      preferredLanguage: row.preferred_language,
      isActive: row.is_active,
      ...toAudit(row),
    },
    row.id,
  );
}

/**
 * The portal account for one auth uid, or null when the uid is not a customer.
 *
 * A staff uid simply has no row here, and the policy lets a signed-in user read
 * their own row and nothing else - so this is also how the session resolver
 * tells the two kinds of principal apart.
 */
export async function findCustomerAccount(uid: Id): Promise<CustomerAccount | null> {
  if (isDemoMode()) return demoCustomerAccount(uid);

  try {
    const row = unwrapMaybe(
      await getSupabase()
        .from(TABLES.customerAccounts)
        .select(COLUMNS)
        .eq('id', uid)
        .maybeSingle<CustomerAccountRow>(),
    );
    return row ? toCustomerAccount(row) : null;
  } catch (error) {
    const appError = toAppError(error);
    if (appError.code === 'permission-denied' || appError.code === 'not-found') return null;
    throw appError;
  }
}

/** The portal account attached to a customer record, if one has been created. */
export async function findAccountForCustomer(customerId: Id): Promise<CustomerAccount | null> {
  if (isDemoMode()) return demoCustomerAccountForCustomer(customerId);

  const row = unwrapMaybe(
    await getSupabase()
      .from(TABLES.customerAccounts)
      .select(COLUMNS)
      .eq('customer_id', customerId)
      .maybeSingle<CustomerAccountRow>(),
  );
  return row ? toCustomerAccount(row) : null;
}

export interface CreateCustomerAccountInput {
  customerId: Id;
  customerName: string;
  email: string;
  preferredLanguage: Language;
  actor: { uid: Id; name: string };
}

/**
 * Gives a customer a login for the review portal.
 *
 * The account is created with a throwaway password and the customer is sent a
 * password-setup email, so nobody at the print shop ever knows or chooses a
 * customer's password - the same rule Module 1 applies to staff. The database
 * document is written after the auth account exists, so a failed sign-up never
 * leaves a portal record pointing at nothing.
 */
export async function createCustomerAccount({
  customerId,
  customerName,
  email,
  preferredLanguage,
  actor,
}: CreateCustomerAccountInput): Promise<CustomerAccount> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) {
    throw new AppError('invalid-input', 'A portal login needs an email address.');
  }

  const existing = await findAccountForCustomer(customerId);
  if (existing) {
    throw new AppError('conflict', 'This customer already has a portal login.');
  }

  const provisioner = getUserAccountProvisioner();
  // A customer account, not a staff one: the Edge Function writes the
  // `principals` row that fixes this uid as a customer for good.
  const { uid } = await provisioner.createCustomerAccount(trimmed);
  const now = new Date();

  const account: CustomerAccount = {
    id: uid,
    customerId,
    customerName,
    email: trimmed,
    preferredLanguage,
    isActive: true,
    createdAt: now,
    createdBy: actor.uid,
    updatedAt: now,
    updatedBy: actor.uid,
  };

  if (isDemoMode()) {
    upsertDemoCustomerAccount(account);
    return account;
  }

  try {
    const { error } = await getSupabase().from(TABLES.customerAccounts).insert({
      id: uid,
      customer_id: customerId,
      customer_name: customerName,
      email: trimmed,
      preferred_language: preferredLanguage,
      is_active: true,
      created_by: actor.uid,
      updated_by: actor.uid,
    });
    if (error) throw error;
  } catch (error) {
    throw toAppError(error);
  }

  await provisioner.sendPasswordSetupEmail(trimmed).catch(() => undefined);
  return account;
}

/** Revokes or restores portal access without destroying the review history. */
export async function setCustomerAccountActive(
  account: CustomerAccount,
  isActive: boolean,
  actorId: Id,
): Promise<void> {
  if (isDemoMode()) {
    setDemoCustomerAccountActive(account.id, isActive, actorId);
    return;
  }

  try {
    const { error } = await getSupabase()
      .from(TABLES.customerAccounts)
      .update({ is_active: isActive, updated_by: actorId })
      .eq('id', account.id);
    if (error) throw error;
  } catch (error) {
    throw toAppError(error);
  }
}
