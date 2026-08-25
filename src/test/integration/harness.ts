import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import process from 'node:process';

import { loadIntegrationEnv } from '@/test/integration/load-env';

// Before anything reads process.env: a git-ignored `.env.integration` is one
// way to supply credentials, a shell export is the other, and the shell wins.
loadIntegrationEnv();

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
  'No backend credentials. Copy .env.integration.example to .env.integration and fill it in, ' +
  'or export SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY. ' +
  '`npm run test:integration` refuses to start without them, so this message only appears ' +
  'when the suite is run some other way.';

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
    const updated = await admin.auth.admin.updateUserById(uid, {
      password,
      email_confirm: true,
    });
    if (updated.error) {
      throw new Error(`reset password for ${email} failed: ${describeError(updated.error)}`);
    }
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`create auth user ${email} failed: ${describeError(error)}`);
    }
    uid = data.user.id;
  }

  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in as ${email} failed: ${describeError(error)}`);

  return { email, password, uid, client };
}

/** Registers the uid as one kind of principal. Service role only, as in production. */
export async function makePrincipal(
  admin: SupabaseClient,
  uid: string,
  kind: 'staff' | 'customer',
): Promise<void> {
  assertNoError(
    await admin.from('principals').upsert({ id: uid, kind }),
    `seed principal (${kind})`,
  );
}

export async function seedStaff(
  admin: SupabaseClient,
  account: TestAccount,
  role: string,
  isActive = true,
): Promise<void> {
  await makePrincipal(admin, account.uid, 'staff');
  const staffResult = await admin.from('staff_profiles').upsert({
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
  assertNoError(staffResult, `seed staff profile (${role}, ${account.email})`);
}

export async function seedCustomerAccount(
  admin: SupabaseClient,
  account: TestAccount,
  customerId: string,
  customerName: string,
  isActive = true,
): Promise<void> {
  await makePrincipal(admin, account.uid, 'customer');
  const accountResult = await admin.from('customer_accounts').upsert({
    id: account.uid,
    customer_id: customerId,
    customer_name: customerName,
    email: account.email,
    preferred_language: 'hi',
    is_active: isActive,
    created_by: account.uid,
    updated_by: account.uid,
  });
  assertNoError(accountResult, `seed customer account (${account.email})`);
}

/** A refusal: either an explicit error, or an empty result because RLS filtered. */
export function wasRefused(result: { data: unknown; error: unknown }): boolean {
  if (result.error) return true;
  return Array.isArray(result.data) ? result.data.length === 0 : result.data === null;
}

interface BackendError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/**
 * Anything in an error string that could be a credential, removed.
 *
 * PostgREST does not normally echo keys back, but a failing connection string
 * or a JWT in a message would end up in CI logs forever. Cheap insurance.
 */
function redact(value: string): string {
  return value
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '<jwt>')
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, '<db-url>')
    .replace(/https:\/\/[a-z0-9]+\.supabase\.(co|in)/gi, '<project-url>');
}

/** The whole error, in one readable line, with anything sensitive removed. */
export function describeError(error: unknown): string {
  const e = (error ?? {}) as BackendError;
  const parts = [
    e.code ? `[${e.code}]` : '',
    e.message ?? String(error),
    e.details ? `details: ${e.details}` : '',
    e.hint ? `hint: ${e.hint}` : '',
  ].filter(Boolean);
  return redact(parts.join(' | '));
}

/**
 * Fails loudly, with the database's own words, the moment something goes wrong.
 *
 * This exists because of a real debugging session: a seed step failed silently,
 * every later assertion read `data.id` off a null, and forty tests reported
 * `TypeError: Cannot read properties of null` instead of the one Postgres error
 * that actually explained all of them. A test that hides the cause is worse
 * than a test that fails.
 */
export function assertOk<T>(result: { data: T | null; error: unknown }, what: string): T {
  if (result.error) {
    throw new Error(`${what} failed: ${describeError(result.error)}`);
  }
  if (result.data === null || result.data === undefined) {
    throw new Error(`${what} returned no row, and no error explaining why.`);
  }
  return result.data;
}

/** Same, for calls whose success is a completed statement rather than a row. */
export function assertNoError(result: { error: unknown }, what: string): void {
  if (result.error) {
    throw new Error(`${what} failed: ${describeError(result.error)}`);
  }
}
