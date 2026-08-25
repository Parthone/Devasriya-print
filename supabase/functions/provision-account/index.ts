// ---------------------------------------------------------------------------
// provision-account
//
// Creates the sign-in account behind a staff profile or a customer portal
// login, and records which kind of principal the new uid is.
//
// This exists because creating an auth user needs the service role key, and
// that key bypasses every row level security policy in the database - it can
// never go anywhere near the browser bundle. The function therefore does the
// smallest possible amount of work with it:
//
//   1. Verify the caller from their own access token.
//   2. Check the caller may do this, by reading their profile as themselves.
//   3. Create the auth user with a password nobody ever sees.
//   4. Write the `principals` row, which fixes the uid as staff or customer
//      for good and is the reason a uid can never be both.
//   5. Email a link so the person chooses their own password.
//
// It deliberately does NOT write the staff_profiles or customer_accounts row.
// That is left to the client, under row level security, so the rules about who
// may create an administrator stay in one place - the policies - rather than
// being duplicated here where they could drift.
// ---------------------------------------------------------------------------
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL = Deno.env.get('APP_SITE_URL') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** The permission each kind of account requires of whoever is creating it. */
const REQUIRED_PERMISSION = {
  staff: 'employees:manage',
  customer: 'customers:edit',
} as const;

type AccountKind = keyof typeof REQUIRED_PERMISSION;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** A password the account is created with and nobody ever learns. */
function throwawayPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('');
  return `Dp1!${body.slice(0, 28)}`;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return json({ error: 'Not signed in.' }, 401);
  }

  let payload: { email?: string; kind?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const email = (payload.email ?? '').trim().toLowerCase();
  const kind = payload.kind as AccountKind | undefined;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: 'A valid email address is required.' }, 400);
  }
  if (!kind || !(kind in REQUIRED_PERMISSION)) {
    return json({ error: 'Unknown account kind.' }, 400);
  }

  // Step 1 and 2: act as the caller, so the permission check is the same one
  // the database would apply to them anywhere else.
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const { data: caller } = await asCaller.auth.getUser();
  if (!caller.user) return json({ error: 'Not signed in.' }, 401);

  const { data: allowed, error: permissionError } = await asCaller.rpc('has_permission', {
    p_permission: REQUIRED_PERMISSION[kind],
  });
  if (permissionError) return json({ error: 'Could not check your permissions.' }, 500);
  if (allowed !== true) {
    return json({ error: 'You do not have permission to create accounts.' }, 403);
  }

  // Step 3 onwards: the only work that needs the service role.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: throwawayPassword(),
    email_confirm: true,
  });

  if (createError || !created.user) {
    const message = createError?.message ?? 'Could not create the account.';
    const status = /already been registered|already exists/i.test(message) ? 409 : 400;
    return json({ error: message }, status);
  }

  const uid = created.user.id;

  const { error: principalError } = await admin.from('principals').insert({ id: uid, kind });

  if (principalError) {
    // Nothing references the auth user yet, so remove it rather than leaving an
    // account that can sign in but resolves to no kind of principal at all.
    await admin.auth.admin.deleteUser(uid).catch(() => undefined);
    return json({ error: 'Could not register the account.' }, 500);
  }

  // Best effort: the account exists either way, and the password can always be
  // reset again from the sign-in screen.
  await admin.auth
    .resetPasswordForEmail(email, SITE_URL ? { redirectTo: `${SITE_URL}/login` } : undefined)
    .catch(() => undefined);

  return json({ uid });
});
