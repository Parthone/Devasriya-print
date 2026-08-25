import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  HAS_BACKEND,
  SKIP_MESSAGE,
  adminClient,
  anonClient,
  assertNoError,
  seedCustomerAccount,
  seedStaff,
  signedInAs,
  type TestAccount,
} from '@/test/integration/harness';

/**
 * Row level security, against a real database.
 *
 * This is the file that replaces the Firebase rules tests. Every assertion runs
 * through an ordinary signed-in client with the anon key, because that is the
 * only thing policies are applied to - the service role client here exists only
 * to seed rows that a test needs to already be there.
 *
 * One difference from the Firestore suites worth knowing: PostgreSQL filters a
 * SELECT rather than rejecting it. A customer asking for another customer's
 * rows gets an empty list, not an error. The security outcome is identical, and
 * the assertions say so explicitly.
 */
const describeIf = HAS_BACKEND ? describe : describe.skip;

let admin: SupabaseClient;
const staff: Record<string, TestAccount> = {};
let mine: TestAccount;
let theirs: TestAccount;

const CUSTOMER_MINE = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_THEIRS = '22222222-2222-4222-8222-222222222222';
const JOB_MINE = '33333333-3333-4333-8333-333333333333';
const JOB_THEIRS = '44444444-4444-4444-8444-444444444444';

const ROLES = ['owner', 'admin', 'sales', 'designer', 'production', 'accounts', 'viewer'] as const;
type Role = (typeof ROLES)[number];

async function seedCustomer(id: string, name: string, mobile: string) {
  const result = await admin.from('customers').upsert({
    id,
    name,
    type: 'business',
    mobile,
    address: '1 Market Road',
    city: 'Udaipur',
    state: 'Rajasthan',
    pincode: '313001',
    preferred_language: 'hi',
    created_by: staff.owner!.uid,
    updated_by: staff.owner!.uid,
  });
  assertNoError(result, `seed customer ${name}`);
}

async function seedJob(id: string, customerId: string, customerName: string, number: string) {
  const result = await admin.from('jobs').upsert({
    id,
    job_number: number,
    customer_id: customerId,
    customer_name: customerName,
    customer_mobile: '9812300011',
    job_date: new Date().toISOString(),
    title: 'Shop board',
    requirement_text: 'Backlit board',
    status: 'open',
    created_by: staff.owner!.uid,
    updated_by: staff.owner!.uid,
  });
  assertNoError(result, `seed job ${number}`);
}

beforeAll(async () => {
  if (!HAS_BACKEND) {
    console.warn(SKIP_MESSAGE);
    return;
  }
  admin = adminClient();

  for (const role of ROLES) {
    const account = await signedInAs(admin, `${role}.rls@devasriya.test`, `Rls@${role}12345`);
    staff[role] = account;
    await seedStaff(admin, account, role);
  }

  mine = await signedInAs(admin, 'mine.rls@customer.test', 'Mine@12345678');
  theirs = await signedInAs(admin, 'theirs.rls@customer.test', 'Theirs@1234567');

  await seedCustomer(CUSTOMER_MINE, 'Shreeji Traders', '9829100022');
  await seedCustomer(CUSTOMER_THEIRS, 'Gupta Sweets', '9414300044');
  await seedCustomerAccount(admin, mine, CUSTOMER_MINE, 'Shreeji Traders');
  await seedCustomerAccount(admin, theirs, CUSTOMER_THEIRS, 'Gupta Sweets');

  await seedJob(JOB_MINE, CUSTOMER_MINE, 'Shreeji Traders', 'JOB-9999-0001');
  await seedJob(JOB_THEIRS, CUSTOMER_THEIRS, 'Gupta Sweets', 'JOB-9999-0002');
});

afterAll(async () => {
  if (!HAS_BACKEND) return;
  await Promise.all(Object.values(staff).map((account) => account.client.auth.signOut()));
  await mine.client.auth.signOut();
  await theirs.client.auth.signOut();
});

describeIf('the permission matrix is enforced by the database', () => {
  it.each(ROLES)('resolves %s permissions from the role table', async (role) => {
    const { data, error } = await staff[role]!.client.rpc('has_permission', {
      p_permission: 'dashboard:view',
    });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it('gives a customer no permissions at all', async () => {
    for (const permission of ['jobs:view', 'designs:view', 'estimates:view', 'customers:view']) {
      const { data } = await mine.client.rpc('has_permission', { p_permission: permission });
      expect(data, permission).toBe(false);
    }
  });

  it('shuts out a deactivated employee entirely', async () => {
    await admin.from('staff_profiles').update({ is_active: false }).eq('id', staff.sales!.uid);

    const { data: allowed } = await staff.sales!.client.rpc('has_permission', {
      p_permission: 'jobs:view',
    });
    expect(allowed).toBe(false);

    const jobs = await staff.sales!.client.from('jobs').select('id');
    expect(jobs.data ?? []).toHaveLength(0);

    await admin.from('staff_profiles').update({ is_active: true }).eq('id', staff.sales!.uid);
  });

  it('shuts out a signed-out client', async () => {
    const stranger = anonClient();
    const jobs = await stranger.from('jobs').select('id');
    expect(jobs.data ?? []).toHaveLength(0);

    const write = await stranger.from('customers').insert({ name: 'Nobody' });
    expect(write.error).not.toBeNull();
  });
});

describeIf('pricing is hidden from designer and production', () => {
  beforeAll(async () => {
    assertNoError(
      await admin.from('job_pricing').upsert({
        job_id: JOB_MINE,
        subtotal_paise: 120_000,
        total_paise: 120_000,
        created_by: staff.owner!.uid,
        updated_by: staff.owner!.uid,
      }),
      'seed job_pricing',
    );
    assertNoError(
      await admin.from('job_pricing_lines').upsert({
        id: '55555555-5555-4555-8555-555555555555',
        job_id: JOB_MINE,
        position: 0,
        product_name: 'Flex Print 440 GSM',
        pricing_method: 'per-square-foot',
        measurement_unit: 'foot',
        width: 6,
        height: 4,
        quantity: 2,
        rate_paise: 2500,
        rate_unit: 'sq-ft',
        calculated_area: 24,
        line_amount_paise: 120_000,
      }),
      'seed job_pricing_lines',
    );
  });

  it.each(['owner', 'admin', 'sales', 'accounts', 'viewer'] as Role[])(
    'lets %s read what a job costs',
    async (role) => {
      const { data } = await staff[role]!.client.from('job_pricing')
        .select('total_paise')
        .eq('job_id', JOB_MINE);
      expect(data ?? []).toHaveLength(1);
    },
  );

  it.each(['designer', 'production'] as Role[])('hides the money from %s', async (role) => {
    const pricing = await staff[role]!.client.from('job_pricing').select('total_paise');
    expect(pricing.data ?? []).toHaveLength(0);

    const lines = await staff[role]!.client.from('job_pricing_lines').select('line_amount_paise');
    expect(lines.data ?? []).toHaveLength(0);

    // ... while the job itself stays readable, which is the whole point of
    // keeping pricing in a table of its own.
    const job = await staff[role]!.client.from('jobs').select('id').eq('id', JOB_MINE);
    expect(job.data ?? []).toHaveLength(1);
  });

  it('stops production changing a price while still letting it move the job', async () => {
    const price = await staff
      .production!.client.from('job_pricing')
      .update({ total_paise: 1, updated_by: staff.production!.uid })
      .eq('job_id', JOB_MINE)
      .select();
    expect(price.data ?? []).toHaveLength(0);

    const job = await staff
      .production!.client.from('jobs')
      .update({ status: 'in-progress', updated_by: staff.production!.uid })
      .eq('id', JOB_MINE)
      .select();
    expect(job.data ?? []).toHaveLength(1);
  });

  it('never lets a customer see any pricing', async () => {
    const pricing = await mine.client.from('job_pricing').select('total_paise');
    expect(pricing.data ?? []).toHaveLength(0);
  });
});

describeIf('one customer never reaches another customer', () => {
  const DESIGN_MINE = '66666666-6666-4666-8666-666666666666';
  const DESIGN_THEIRS = '77777777-7777-4777-8777-777777777777';
  const createdDesigns: string[] = [];
  const createdJobs: string[] = [];

  beforeAll(async () => {
    assertNoError(
      await admin.from('designs').delete().in('id', [DESIGN_MINE, DESIGN_THEIRS]),
      'clear design fixtures',
    );

    for (const [id, jobId, customerId, name, number] of [
      [DESIGN_MINE, JOB_MINE, CUSTOMER_MINE, 'Shreeji Traders', 'JOB-9999-0001'],
      [DESIGN_THEIRS, JOB_THEIRS, CUSTOMER_THEIRS, 'Gupta Sweets', 'JOB-9999-0002'],
    ] as const) {
      assertNoError(
        await admin.from('designs').insert({
          id,
          job_id: jobId,
          job_number: number,
          job_title: 'Shop board',
          customer_id: customerId,
          customer_name: name,
          version: 1,
          file_id: id,
          file_path: `${jobId}/${id}.png`,
          file_mime: 'image/png',
          file_size_bytes: 204_800,
          file_original_name: 'board.png',
          file_uploaded_at: new Date().toISOString(),
          file_uploaded_by: staff.designer!.uid,
          preview_kind: 'image',
          uploaded_by_id: staff.designer!.uid,
          uploaded_by_name: 'designer user',
          status: 'submitted-for-review',
          submitted_at: new Date().toISOString(),
          created_by: staff.designer!.uid,
          updated_by: staff.designer!.uid,
        }),
        `seed design ${id}`,
      );
    }
  });

  /**
   * A job and a version of its own, for a test that is going to answer one.
   *
   * Answering is a one-way move by design: the transition table has no path back
   * from approved to submitted-for-review, and an admin UPDATE cannot talk its
   * way past that either. On top of that, `designs_one_approved_per_job` allows
   * exactly one approved version per job - so two tests that both approve
   * something need two jobs, not just two designs. Both constraints are the
   * point of the system; the fixtures bend around them.
   */
  async function freshDesign(customerId: string, customerName: string) {
    const jobId = crypto.randomUUID();
    createdJobs.push(jobId);
    const digits = () => String(Math.floor(Math.random() * 10_000)).padStart(4, '0');

    assertNoError(
      await admin.from('jobs').insert({
        id: jobId,
        job_number: `JOB-${digits()}-${digits()}`,
        customer_id: customerId,
        customer_name: customerName,
        customer_mobile: '9812300011',
        job_date: new Date().toISOString(),
        title: 'Fixture job',
        requirement_text: 'Fixture',
        status: 'open',
        created_by: staff.owner!.uid,
        updated_by: staff.owner!.uid,
      }),
      'seed a fresh job',
    );

    const id = crypto.randomUUID();
    assertNoError(
      await admin.from('designs').insert({
        id,
        job_id: jobId,
        job_number: 'JOB-9999-0000',
        job_title: 'Fixture job',
        customer_id: customerId,
        customer_name: customerName,
        version: 1,
        file_id: id,
        file_path: `${jobId}/${id}.png`,
        file_mime: 'image/png',
        file_size_bytes: 204_800,
        file_original_name: 'board.png',
        file_uploaded_at: new Date().toISOString(),
        file_uploaded_by: staff.designer!.uid,
        preview_kind: 'image',
        uploaded_by_id: staff.designer!.uid,
        uploaded_by_name: 'designer user',
        status: 'submitted-for-review',
        submitted_at: new Date().toISOString(),
        created_by: staff.designer!.uid,
        updated_by: staff.designer!.uid,
      }),
      'seed a fresh design version',
    );
    createdDesigns.push(id);
    return id;
  }

  afterAll(async () => {
    if (!HAS_BACKEND) return;
    // These are throwaway fixtures, not history: remove them so the project
    // does not slowly fill with them. Only the service role can, which is the
    // whole point - no client role has DELETE on designs.
    await admin.from('designs').delete().in('id', createdDesigns);
    await admin.from('jobs').delete().in('id', createdJobs);
  });

  it('serves a customer only their own designs, whatever they ask for', async () => {
    const own = await mine.client.from('designs').select('id, customer_id');
    assertNoError(own, 'customer reads designs');

    // Every row that comes back is theirs, their own design is among them, and
    // the other customer's is not. Asserting the count instead would only be
    // measuring how much fixture data happens to be in the project.
    expect(own.data ?? []).not.toHaveLength(0);
    expect(own.data?.every((row) => row.customer_id === CUSTOMER_MINE)).toBe(true);
    expect(own.data?.map((row) => row.id)).toContain(DESIGN_MINE);
    expect(own.data?.map((row) => row.id)).not.toContain(DESIGN_THEIRS);

    // Asking for everything returns only their own rows: the database filters
    // it, the browser does not.
    const wider = await mine.client.from('designs').select('id').eq('customer_id', CUSTOMER_THEIRS);
    expect(wider.data ?? []).toHaveLength(0);

    const byId = await mine.client.from('designs').select('id').eq('id', DESIGN_THEIRS);
    expect(byId.data ?? []).toHaveLength(0);
  });

  it('serves a customer only their own orders', async () => {
    const own = await mine.client.from('jobs').select('id, customer_id');
    assertNoError(own, 'customer reads jobs');

    expect(own.data ?? []).not.toHaveLength(0);
    expect(own.data?.every((row) => row.customer_id === CUSTOMER_MINE)).toBe(true);
    expect(own.data?.map((row) => row.id)).toContain(JOB_MINE);

    const other = await mine.client.from('jobs').select('id').eq('id', JOB_THEIRS);
    expect(other.data ?? []).toHaveLength(0);
  });

  it('lets a customer read their own account and nobody else', async () => {
    const own = await mine.client.from('customer_accounts').select('id').eq('id', mine.uid);
    expect(own.data ?? []).toHaveLength(1);

    const other = await mine.client.from('customer_accounts').select('id').eq('id', theirs.uid);
    expect(other.data ?? []).toHaveLength(0);
  });

  it('gives a customer no sight of the customer directory', async () => {
    const customers = await mine.client.from('customers').select('id');
    expect(customers.data ?? []).toHaveLength(0);
  });

  it('shuts out a revoked portal login completely', async () => {
    await admin.from('customer_accounts').update({ is_active: false }).eq('id', mine.uid);

    const designs = await mine.client.from('designs').select('id');
    expect(designs.data ?? []).toHaveLength(0);

    const jobs = await mine.client.from('jobs').select('id');
    expect(jobs.data ?? []).toHaveLength(0);

    await admin.from('customer_accounts').update({ is_active: true }).eq('id', mine.uid);
  });

  it('lets the customer answer their own design, and refuses another customer', async () => {
    const theirsAttempt = await theirs.client
      .from('designs')
      .update({
        status: 'approved',
        decision_outcome: 'approved',
        decision_comment: 'Not mine to approve',
        decision_at: new Date().toISOString(),
        decision_source: 'customer',
        decision_by_id: theirs.uid,
        decision_by_name: 'Gupta Sweets',
        updated_by: theirs.uid,
      })
      .eq('id', DESIGN_MINE)
      .select();
    expect(theirsAttempt.data ?? []).toHaveLength(0);

    const target = await freshDesign(CUSTOMER_MINE, 'Shreeji Traders');
    const own = await mine.client
      .from('designs')
      .update({
        status: 'approved',
        decision_outcome: 'approved',
        decision_comment: 'Approved, but make the font size bigger.',
        decision_at: new Date().toISOString(),
        decision_source: 'customer',
        decision_by_id: mine.uid,
        decision_by_name: 'Shreeji Traders',
        decision_language: 'hi',
        updated_by: mine.uid,
      })
      .eq('id', target)
      .select();
    assertNoError(own, 'customer answers their own design');
    expect(own.data ?? []).toHaveLength(1);
    expect(own.data?.[0]?.decision_comment).toBe('Approved, but make the font size bigger.');
  });

  it('stops a customer touching the artwork while answering', async () => {
    const attempt = await mine.client
      .from('designs')
      .update({
        status: 'approved',
        decision_outcome: 'approved',
        decision_comment: 'Swapping the file too',
        decision_at: new Date().toISOString(),
        decision_source: 'customer',
        decision_by_id: mine.uid,
        decision_by_name: 'Shreeji Traders',
        file_path: 'somewhere/else.png',
        updated_by: mine.uid,
      })
      .eq('id', DESIGN_MINE)
      .select();

    // file_path is not in the UPDATE grant at all, so PostgreSQL refuses the
    // statement outright rather than silently dropping the column.
    expect(attempt.error).not.toBeNull();
  });

  it('stops staff filing an answer as though the customer had typed it', async () => {
    const target = await freshDesign(CUSTOMER_MINE, 'Shreeji Traders');

    const forged = await staff
      .sales!.client.from('designs')
      .update({
        status: 'approved',
        decision_outcome: 'approved',
        decision_comment: 'Pretending to be them',
        decision_at: new Date().toISOString(),
        decision_source: 'customer',
        decision_by_id: staff.sales!.uid,
        decision_by_name: 'sales user',
        updated_by: staff.sales!.uid,
      })
      .eq('id', target)
      .select();
    expect(forged.data ?? []).toHaveLength(0);

    // The same person, the same design, the honest attribution: allowed.
    const honest = await staff
      .sales!.client.from('designs')
      .update({
        status: 'approved',
        decision_outcome: 'approved',
        decision_comment: 'They said yes on the phone.',
        decision_at: new Date().toISOString(),
        decision_source: 'staff',
        decision_by_id: staff.sales!.uid,
        decision_by_name: 'sales user',
        updated_by: staff.sales!.uid,
      })
      .eq('id', target)
      .select();
    assertNoError(honest, 'staff records the answer honestly');
    expect(honest.data ?? []).toHaveLength(1);
  });
});

describeIf('owner-only powers stay with the owner', () => {
  it('lets only the owner change the rate card', async () => {
    const product = {
      id: crypto.randomUUID(),
      name: 'Flex Print 440 GSM',
      category: 'printing',
      pricing_method: 'per-square-foot',
      default_rate_paise: 2500,
      default_rate_unit: 'sq-ft',
      is_active: true,
    };

    const owner = await staff
      .owner!.client.from('products')
      .insert({ ...product, created_by: staff.owner!.uid, updated_by: staff.owner!.uid })
      .select();
    assertNoError(owner, 'owner adds a rate card item');
    expect(owner.data ?? []).toHaveLength(1);

    for (const role of [
      'admin',
      'sales',
      'designer',
      'production',
      'accounts',
      'viewer',
    ] as Role[]) {
      const attempt = await staff[role]!.client.from('products')
        .update({ default_rate_paise: 1, updated_by: staff[role]!.uid })
        .eq('id', product.id)
        .select();
      expect(attempt.data ?? [], role).toHaveLength(0);
    }
  });

  it('lets only the owner hand out owner or admin', async () => {
    const target = staff.viewer!.uid;

    const byAdmin = await staff
      .admin!.client.from('staff_profiles')
      .update({ role: 'admin', updated_by: staff.admin!.uid })
      .eq('id', target)
      .select();
    expect(byAdmin.data ?? []).toHaveLength(0);

    const byOwner = await staff
      .owner!.client.from('staff_profiles')
      .update({ role: 'admin', updated_by: staff.owner!.uid })
      .eq('id', target)
      .select();
    expect(byOwner.data ?? []).toHaveLength(1);

    await admin.from('staff_profiles').update({ role: 'viewer' }).eq('id', target);
  });

  it('never lets anybody rewrite the permission matrix from a client', async () => {
    for (const role of ROLES) {
      const attempt = await staff[role]!.client.from('role_permissions').insert({
        role: 'viewer',
        permission: 'settings:manage',
      });
      expect(attempt.error, role).not.toBeNull();
    }
  });
});

describeIf('the two kinds of principal stay apart', () => {
  it('refuses to make an employee uid into a customer login, or the reverse', async () => {
    const asCustomer = await admin
      .from('principals')
      .insert({ id: staff.designer!.uid, kind: 'customer' });
    expect(asCustomer.error).not.toBeNull();

    const asStaff = await admin.from('principals').insert({ id: mine.uid, kind: 'staff' });
    expect(asStaff.error).not.toBeNull();
  });

  it('never lets a client write the principals table at all', async () => {
    const attempt = await staff
      .owner!.client.from('principals')
      .insert({ id: staff.owner!.uid, kind: 'staff' });
    expect(attempt.error).not.toBeNull();
  });
});

describeIf('records that must never be destroyed', () => {
  it('refuses every delete on designs, estimates and the audit trail', async () => {
    for (const table of ['designs', 'estimates', 'estimate_lines', 'audit_events', 'customers']) {
      const attempt = await staff
        .owner!.client.from(table)
        .delete()
        .eq('id', '99999999-9999-4999-8999-999999999999');
      expect(attempt.error, table).not.toBeNull();
    }
  });

  it('refuses every update on the audit trail', async () => {
    const attempt = await staff
      .owner!.client.from('audit_events')
      .update({ after: 'rewritten' })
      .eq('id', '99999999-9999-4999-8999-999999999999');
    expect(attempt.error).not.toBeNull();
  });

  it('never lets a document counter be read or reset from a client', async () => {
    const read = await staff.owner!.client.from('document_counters').select('last_value');
    expect(read.data ?? []).toHaveLength(0);

    const write = await staff
      .owner!.client.from('document_counters')
      .upsert({ scope: 'jobs', year_key: '2627', last_value: 0 });
    expect(write.error).not.toBeNull();
  });
});
