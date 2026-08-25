import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import process from 'node:process';

/**
 * The shared harness for every integration test.
 *
 * One admin client holding the service role key, used only to seed and to tear
 * down, and one signed-in client per person whose access is being tested. Every
 * assertion about who may see or do what runs through an ordinary anon-key
 * client with a real session, exactly as the browser would - because that is
 * the only thing row level security actually applies to.
 */
export const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
export const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '';
export const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/** True when there is a project to talk to. */
export const HAS_BACKEND = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);

export const SKIP_MESSAGE =
  'Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (or run `supabase start`) ' +
  'to run the integration and row level security tests.';

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface TestAccount {
  email: string;
  password: string;
  uid: string;
  client: SupabaseClient;
}

/** Creates (or resets) an auth user and returns a client signed in as them. */
export async function signedInAs(
  admin: SupabaseClient,
  email: string,
  password: string,
): Promise<TestAccount> {
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = existing.users.find((user) => user.email === email);

  let uid: string;
  if (found) {
    uid = found.id;
    await admin.auth.admin.updateUserById(uid, { password, email_confirm: true });
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error(`could not create ${email}`);
    uid = data.user.id;
  }

  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;

  return { email, password, uid, client };
}

/** Registers the uid as one kind of principal. Service role only, as in production. */
export async function makePrincipal(
  admin: SupabaseClient,
  uid: string,
  kind: 'staff' | 'customer',
): Promise<void> {
  await admin.from('principals').upsert({ id: uid, kind });
}

export async function seedStaff(
  admin: SupabaseClient,
  account: TestAccount,
  role: string,
  isActive = true,
): Promise<void> {
  await makePrincipal(admin, account.uid, 'staff');
  await admin.from('staff_profiles').upsert({
    id: account.uid,
    name: `${role} user`,
    email: account.email,
    mobile: '9876500011',
    designation: 'manager',
    department: 'management',
    role,
    is_active: isActive,
    created_by: account.uid,
    updated_by: account.uid,
  });
}

export async function seedCustomerAccount(
  admin: SupabaseClient,
  account: TestAccount,
  customerId: string,
  customerName: string,
  isActive = true,
): Promise<void> {
  await makePrincipal(admin, account.uid, 'customer');
  await admin.from('customer_accounts').upsert({
    id: account.uid,
    customer_id: customerId,
    customer_name: customerName,
    email: account.email,
    preferred_language: 'hi',
    is_active: isActive,
    created_by: account.uid,
    updated_by: account.uid,
  });
}

/** A refusal: either an explicit error, or an empty result because RLS filtered. */
export function wasRefused(result: { data: unknown; error: unknown }): boolean {
  if (result.error) return true;
  return Array.isArray(result.data) ? result.data.length === 0 : result.data === null;
}
