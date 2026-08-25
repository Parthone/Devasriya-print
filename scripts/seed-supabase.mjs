#!/usr/bin/env node
/**
 * Seeds a Supabase project with accounts and sample data for manual testing.
 *
 * Development convenience only. It refuses to run against anything that is not
 * a local stack unless SEED_ALLOW_REMOTE=true is set explicitly, because it
 * needs the service role key and that key bypasses every security policy.
 *
 *   supabase start                 # terminal 1 (needs Docker)
 *   supabase db reset              # applies the migrations
 *   npm run seed:supabase          # terminal 2
 *
 * Creates:
 *   owner@devasriya.test      Owner@12345      active owner
 *   sales@devasriya.test      Sales@12345      active sales
 *   designer@devasriya.test   Design@12345     active designer
 *   inactive@devasriya.test   Inactive@123     deactivated employee
 *   ghost@devasriya.test      Ghost@12345      auth account, no profile at all
 *   portal@shreeji.test       Portal@12345     customer portal login
 */
import { createClient } from '@supabase/supabase-js';
import process from 'node:process';

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!serviceRoleKey) {
  console.error('\n  SUPABASE_SERVICE_ROLE_KEY is not set. Run `supabase status` to find it.\n');
  process.exit(1);
}

const isLocal = url.includes('127.0.0.1') || url.includes('localhost');
if (!isLocal && process.env.SEED_ALLOW_REMOTE !== 'true') {
  console.error(`\n  Refusing to seed ${url}: set SEED_ALLOW_REMOTE=true if you really mean it.\n`);
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function upsertUser(email, password) {
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = existing.users.find((user) => user.email === email);
  if (found) {
    await admin.auth.admin.updateUserById(found.id, { password, email_confirm: true });
    return found.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';

async function staff(email, password, role, isActive = true) {
  const uid = await upsertUser(email, password);
  await admin.from('principals').upsert({ id: uid, kind: 'staff' });
  const { error } = await admin.from('staff_profiles').upsert({
    id: uid,
    name: role === 'owner' ? 'Devasriya Owner' : `${role[0].toUpperCase()}${role.slice(1)} User`,
    email,
    mobile: '9876500001',
    designation: role === 'owner' ? 'owner' : 'manager',
    department: role === 'designer' ? 'design' : 'management',
    role,
    is_active: isActive,
    created_by: uid,
    updated_by: uid,
  });
  if (error) throw error;
  console.log(
    `  ${email.padEnd(28)} ${password.padEnd(16)} ${role}${isActive ? '' : ' (inactive)'}`,
  );
  return uid;
}

async function main() {
  console.log(`\nSeeding ${url}\n`);

  const ownerUid = await staff('owner@devasriya.test', 'Owner@12345', 'owner');
  await staff('sales@devasriya.test', 'Sales@12345', 'sales');
  await staff('designer@devasriya.test', 'Design@12345', 'designer');
  await staff('inactive@devasriya.test', 'Inactive@123', 'viewer', false);

  // An auth account with no profile and no portal record at all. Both the
  // application and the policies must refuse it - that is what it is here for.
  await upsertUser('ghost@devasriya.test', 'Ghost@12345');
  console.log('  ghost@devasriya.test         Ghost@12345      no profile at all');

  await admin.from('customers').upsert([
    {
      id: CUSTOMER_ID,
      name: 'Shreeji Traders',
      business_name: 'Shreeji Traders Pvt Ltd',
      type: 'business',
      mobile: '9829100022',
      email: 'accounts@shreejitraders.example',
      address: '4 Market Road, Shop 18',
      city: 'Udaipur',
      state: 'Rajasthan',
      pincode: '313001',
      gstin: '08AABCU9603R1ZM',
      preferred_language: 'hi',
      created_by: ownerUid,
      updated_by: ownerUid,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Ravi Kumar',
      type: 'individual',
      mobile: '9812300011',
      address: '12 MG Road',
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '452001',
      preferred_language: 'hi',
      created_by: ownerUid,
      updated_by: ownerUid,
    },
  ]);

  const portalUid = await upsertUser('portal@shreeji.test', 'Portal@12345');
  await admin.from('principals').upsert({ id: portalUid, kind: 'customer' });
  await admin.from('customer_accounts').upsert({
    id: portalUid,
    customer_id: CUSTOMER_ID,
    customer_name: 'Shreeji Traders',
    email: 'portal@shreeji.test',
    preferred_language: 'hi',
    is_active: true,
    created_by: ownerUid,
    updated_by: ownerUid,
  });
  console.log('  portal@shreeji.test          Portal@12345     customer portal login');

  await admin.from('locations').upsert({
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Main Road Office',
    address: '22 Main Road, Udaipur 313001',
    phone: '9829100011',
    contact_name: 'Anil Verma',
    contact_mobile: '9829100012',
    is_active: true,
    created_by: ownerUid,
    updated_by: ownerUid,
  });

  await admin.from('products').upsert([
    {
      id: '44444444-4444-4444-8444-444444444444',
      name: 'Flex Print 440 GSM',
      category: 'printing',
      pricing_method: 'per-square-foot',
      default_rate_paise: 2500,
      default_rate_unit: 'sq-ft',
      is_active: true,
      created_by: ownerUid,
      updated_by: ownerUid,
    },
    {
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Vinyl Sticker',
      category: 'signage',
      pricing_method: 'per-square-foot',
      default_rate_paise: 4000,
      default_rate_unit: 'sq-ft',
      is_active: true,
      created_by: ownerUid,
      updated_by: ownerUid,
    },
  ]);

  console.log('\nDone. Sign in at http://127.0.0.1:5173\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
