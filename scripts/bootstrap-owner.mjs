#!/usr/bin/env node
/**
 * Creates the very first owner account on a real Supabase project.
 *
 * A chicken-and-egg problem: the application refuses anyone without an active
 * staff profile, and only somebody holding employees:manage can create one.
 * This breaks that loop once, using the service role key, and should never be
 * needed again - every other account is created from inside the application.
 *
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/bootstrap-owner.mjs owner@yourbusiness.in "Owner Name" 9876543210
 *
 * The service role key must never be committed. Read it from the Supabase
 * dashboard (Project Settings > API) and pass it in the environment.
 */
import { createClient } from '@supabase/supabase-js';
import process from 'node:process';

const [email, name, mobile] = process.argv.slice(2);
const url = process.env.SUPABASE_URL ?? '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!email || !name || !mobile) {
  console.error('\n  Usage: node scripts/bootstrap-owner.mjs <email> <name> <mobile>\n');
  process.exit(1);
}
if (!url || !serviceRoleKey) {
  console.error('\n  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.\n');
  process.exit(1);
}
if (!/^[6-9][0-9]{9}$/.test(mobile)) {
  console.error('\n  Mobile must be a ten digit Indian number.\n');
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Never shown to anybody: the owner sets their own from the emailed link. */
function throwawayPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const body = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('');
  return `Dp1!${body.slice(0, 28)}`;
}

async function main() {
  const { count } = await admin
    .from('staff_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'owner');

  if ((count ?? 0) > 0) {
    console.error('\n  This project already has an owner. Create further accounts in the app.\n');
    process.exit(1);
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: throwawayPassword(),
    email_confirm: true,
  });
  if (error) throw error;

  const uid = data.user.id;
  const principal = await admin.from('principals').insert({ id: uid, kind: 'staff' });
  if (principal.error) throw principal.error;

  const profile = await admin.from('staff_profiles').insert({
    id: uid,
    name,
    email,
    mobile,
    designation: 'owner',
    department: 'management',
    role: 'owner',
    is_active: true,
    created_by: uid,
    updated_by: uid,
  });
  if (profile.error) throw profile.error;

  await admin.auth.resetPasswordForEmail(email);

  console.log(`\n  Owner created: ${email}`);
  console.log('  A "set your password" email has been sent. Nothing else is needed.\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
