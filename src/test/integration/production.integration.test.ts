import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  HAS_BACKEND,
  SKIP_MESSAGE,
  adminClient,
  assertNoError,
  assertOk,
  seedCustomerAccount,
  seedStaff,
  signedInAs,
  type TestAccount,
} from '@/test/integration/harness';

/**
 * The shop floor, against a real database.
 *
 * The rules that have to hold whoever is calling: work moves in order, holding
 * or skipping says why, the history cannot be edited, and the job's own status
 * follows the stages rather than being typed in by hand.
 */
const describeIf = HAS_BACKEND ? describe : describe.skip;

let admin: SupabaseClient;
let owner: TestAccount;
let production: TestAccount;
let designer: TestAccount;
let sales: TestAccount;
let viewer: TestAccount;
let accounts: TestAccount;
let portal: TestAccount;

const CUSTOMER = 'bbbbbbbb-0000-4000-8000-00000000000b';
const FY = '2627';
const createdJobs: string[] = [];

async function makeJob(title: string) {
  const job = assertOk(
    await sales.client
      .rpc('create_job', {
        p_payload: {
          customer_id: CUSTOMER,
          customer_name: 'Production Fixtures',
          customer_mobile: '9812300011',
          job_date: new Date().toISOString(),
          title,
          requirement_text: 'Fixture',
          status: 'open',
        },
        p_year_key: FY,
      })
      .single<{ id: string; job_number: string; status: string }>(),
    'create_job',
  );
  createdJobs.push(job.id);
  return job;
}

async function startRun(client: SupabaseClient, jobId: string, byName: string) {
  return client.rpc('start_production_run', { p_job_id: jobId, p_by_name: byName }).single<{
    id: string;
    job_id: string;
    approved_design_id: string | null;
    approved_design_version: number | null;
    status: string;
  }>();
}

async function tasksFor(jobId: string) {
  return assertOk(
    await production.client
      .from('production_tasks')
      .select('id, position, status, stage_name, hold_reason, skip_reason, assigned_to_name')
      .eq('job_id', jobId)
      .order('position')
      .returns<
        {
          id: string;
          position: number;
          status: string;
          stage_name: string;
          hold_reason: string | null;
          skip_reason: string | null;
          assigned_to_name: string | null;
        }[]
      >(),
    'read production tasks',
  );
}

async function jobStatus(jobId: string) {
  const job = assertOk(
    await production.client
      .from('jobs')
      .select('status')
      .eq('id', jobId)
      .single<{ status: string }>(),
    'read job status',
  );
  return job.status;
}

beforeAll(async () => {
  if (!HAS_BACKEND) {
    console.warn(SKIP_MESSAGE);
    return;
  }
  admin = adminClient();

  owner = await signedInAs(admin, 'owner.prod@devasriya.test', 'Owner@12345678');
  production = await signedInAs(admin, 'prod.prod@devasriya.test', 'Prod@12345678');
  designer = await signedInAs(admin, 'design.prod@devasriya.test', 'Design@1234567');
  sales = await signedInAs(admin, 'sales.prod@devasriya.test', 'Sales@12345678');
  viewer = await signedInAs(admin, 'view.prod@devasriya.test', 'Viewer@1234567');
  accounts = await signedInAs(admin, 'acct.prod@devasriya.test', 'Acct@12345678');
  portal = await signedInAs(admin, 'portal.prod@customer.test', 'Portal@1234567');

  await seedStaff(admin, owner, 'owner');
  await seedStaff(admin, production, 'production');
  await seedStaff(admin, designer, 'designer');
  await seedStaff(admin, sales, 'sales');
  await seedStaff(admin, viewer, 'viewer');
  await seedStaff(admin, accounts, 'accounts');

  assertNoError(
    await admin.from('customers').upsert({
      id: CUSTOMER,
      name: 'Production Fixtures',
      type: 'business',
      mobile: '9829100077',
      address: '9 Works Road',
      city: 'Udaipur',
      state: 'Rajasthan',
      pincode: '313001',
      preferred_language: 'hi',
      created_by: owner.uid,
      updated_by: owner.uid,
    }),
    'seed production customer',
  );
  await seedCustomerAccount(admin, portal, CUSTOMER, 'Production Fixtures');

  // The shop's stages. Seeded once; the suite never depends on how many other
  // stages a real project might have beyond these.
  assertNoError(
    await admin.from('workflow_stages').upsert(
      ['Pre-press', 'Printing', 'Finishing'].map((name, index) => ({
        id: `cccccccc-0000-4000-8000-00000000000${String(index)}`,
        name,
        department: 'printing',
        position: index,
        is_active: true,
        created_by: owner.uid,
        updated_by: owner.uid,
      })),
    ),
    'seed workflow stages',
  );
  assertNoError(
    await admin
      .from('workflow_stages')
      .delete()
      .not(
        'id',
        'in',
        '(cccccccc-0000-4000-8000-000000000000,cccccccc-0000-4000-8000-000000000001,cccccccc-0000-4000-8000-000000000002)',
      ),
    'clear other stages',
  );
});

afterAll(async () => {
  if (!HAS_BACKEND) return;
  for (const account of [owner, production, designer, sales, viewer, accounts, portal]) {
    await account?.client.auth.signOut();
  }
});

describeIf('sending a job to production', () => {
  it('creates one task per stage, only the first ready, and moves the job on', async () => {
    const job = await makeJob('Sequential start');
    const run = assertOk(await startRun(production.client, job.id, 'Prod User'), 'start run');

    expect(run.status).toBe('in-progress');

    const tasks = await tasksFor(job.id);
    expect(tasks.map((task) => task.stage_name)).toEqual(['Pre-press', 'Printing', 'Finishing']);
    expect(tasks.map((task) => task.status)).toEqual(['ready', 'pending', 'pending']);
    expect(await jobStatus(job.id)).toBe('in-progress');
  });

  it('refuses a second run for the same job', async () => {
    const job = await makeJob('Only once');
    assertOk(await startRun(production.client, job.id, 'Prod User'), 'start run');

    const again = await startRun(production.client, job.id, 'Prod User');
    expect(again.error?.message).toMatch(/already in production/i);
  });

  it('writes the opening history entry', async () => {
    const job = await makeJob('History start');
    const run = assertOk(await startRun(production.client, job.id, 'Prod User'), 'start run');

    const events = assertOk(
      await production.client
        .from('production_events')
        .select('action, by_name')
        .eq('run_id', run.id)
        .returns<{ action: string; by_name: string }[]>(),
      'read events',
    );
    expect(events.map((event) => event.action)).toContain('run-started');
    expect(events.every((event) => event.by_name === 'Prod User')).toBe(true);
  });
});

describeIf('work moves in order', () => {
  it('unlocks the next stage only when the one in front is settled', async () => {
    const job = await makeJob('In order');
    assertOk(await startRun(production.client, job.id, 'Prod User'), 'start run');
    const tasks = await tasksFor(job.id);

    // The second stage cannot be started while the first is still open.
    const early = await production.client.rpc('advance_production_task', {
      p_task_id: tasks[1]!.id,
      p_to_status: 'in-progress',
      p_reason: null,
      p_by_name: 'Prod User',
    });
    expect(early.error?.message).toMatch(/cannot become in progress/i);

    assertNoError(
      await production.client.rpc('advance_production_task', {
        p_task_id: tasks[0]!.id,
        p_to_status: 'in-progress',
        p_reason: null,
        p_by_name: 'Prod User',
      }),
      'start first stage',
    );
    assertNoError(
      await production.client.rpc('advance_production_task', {
        p_task_id: tasks[0]!.id,
        p_to_status: 'completed',
        p_reason: null,
        p_by_name: 'Prod User',
      }),
      'complete first stage',
    );

    const after = await tasksFor(job.id);
    expect(after.map((task) => task.status)).toEqual(['completed', 'ready', 'pending']);
  });

  it('refuses to complete a stage that was never started', async () => {
    const job = await makeJob('No shortcuts');
    assertOk(await startRun(production.client, job.id, 'Prod User'), 'start run');
    const tasks = await tasksFor(job.id);

    const jump = await production.client.rpc('advance_production_task', {
      p_task_id: tasks[0]!.id,
      p_to_status: 'completed',
      p_reason: null,
      p_by_name: 'Prod User',
    });
    expect(jump.error?.message).toMatch(/cannot become completed/i);
  });

  it('hands over to the next stage when one is skipped', async () => {
    const job = await makeJob('Skip forward');
    assertOk(await startRun(production.client, job.id, 'Prod User'), 'start run');
    const tasks = await tasksFor(job.id);

    assertNoError(
      await production.client.rpc('advance_production_task', {
        p_task_id: tasks[0]!.id,
        p_to_status: 'skipped',
        p_reason: 'Artwork already checked with the customer.',
        p_by_name: 'Prod User',
      }),
      'skip first stage',
    );

    const after = await tasksFor(job.id);
    expect(after[0]?.status).toBe('skipped');
    expect(after[0]?.skip_reason).toBe('Artwork already checked with the customer.');
    expect(after[1]?.status).toBe('ready');
  });
});

describeIf('holding and skipping always say why', () => {
  it('refuses a hold with no reason, through the RPC and through a direct update', async () => {
    const job = await makeJob('Hold needs a reason');
    assertOk(await startRun(production.client, job.id, 'Prod User'), 'start run');
    const tasks = await tasksFor(job.id);

    assertNoError(
      await production.client.rpc('advance_production_task', {
        p_task_id: tasks[0]!.id,
        p_to_status: 'in-progress',
        p_reason: null,
        p_by_name: 'Prod User',
      }),
      'start stage',
    );

    const viaRpc = await production.client.rpc('advance_production_task', {
      p_task_id: tasks[0]!.id,
      p_to_status: 'on-hold',
      p_reason: '   ',
      p_by_name: 'Prod User',
    });
    expect(viaRpc.error?.message).toMatch(/why this stage is being put on hold/i);

    // The rule lives on the table, so going around the RPC does not get past it.
    const direct = await production.client
      .from('production_tasks')
      .update({ status: 'on-hold', updated_by: production.uid })
      .eq('id', tasks[0]!.id);
    expect(direct.error?.message).toMatch(/why this stage is being put on hold/i);
  });

  it('refuses a skip with no reason', async () => {
    const job = await makeJob('Skip needs a reason');
    assertOk(await startRun(production.client, job.id, 'Prod User'), 'start run');
    const tasks = await tasksFor(job.id);

    const skipped = await production.client.rpc('advance_production_task', {
      p_task_id: tasks[0]!.id,
      p_to_status: 'skipped',
      p_reason: null,
      p_by_name: 'Prod User',
    });
    expect(skipped.error?.message).toMatch(/why this stage is being skipped/i);
  });

  it('keeps the reason on the stage and in the history, and allows a resume', async () => {
    const job = await makeJob('Hold and resume');
    const run = assertOk(await startRun(production.client, job.id, 'Prod User'), 'start run');
    const tasks = await tasksFor(job.id);

    for (const status of ['in-progress'] as const) {
      assertNoError(
        await production.client.rpc('advance_production_task', {
          p_task_id: tasks[0]!.id,
          p_to_status: status,
          p_reason: null,
          p_by_name: 'Prod User',
        }),
        `move to ${status}`,
      );
    }

    assertNoError(
      await production.client.rpc('advance_production_task', {
        p_task_id: tasks[0]!.id,
        p_to_status: 'on-hold',
        p_reason: 'Waiting for the vinyl roll.',
        p_by_name: 'Prod User',
      }),
      'hold stage',
    );

    const held = await tasksFor(job.id);
    expect(held[0]?.status).toBe('on-hold');
    expect(held[0]?.hold_reason).toBe('Waiting for the vinyl roll.');
    expect(await jobStatus(job.id)).toBe('on-hold');

    const events = assertOk(
      await production.client
        .from('production_events')
        .select('action, reason')
        .eq('run_id', run.id)
        .eq('action', 'stage-held')
        .returns<{ action: string; reason: string }[]>(),
      'read hold event',
    );
    expect(events[0]?.reason).toBe('Waiting for the vinyl roll.');

    assertNoError(
      await production.client.rpc('advance_production_task', {
        p_task_id: tasks[0]!.id,
        p_to_status: 'in-progress',
        p_reason: null,
        p_by_name: 'Prod User',
      }),
      'resume stage',
    );
    expect(await jobStatus(job.id)).toBe('in-progress');
  });
});

describeIf('the job status follows the shop floor', () => {
  it('becomes ready once every stage is settled, and delivery stays separate', async () => {
    const job = await makeJob('Right through');
    assertOk(await startRun(production.client, job.id, 'Prod User'), 'start run');
    const tasks = await tasksFor(job.id);

    for (const task of tasks) {
      assertNoError(
        await production.client.rpc('advance_production_task', {
          p_task_id: task.id,
          p_to_status: 'in-progress',
          p_reason: null,
          p_by_name: 'Prod User',
        }),
        `start ${task.stage_name}`,
      );
      assertNoError(
        await production.client.rpc('advance_production_task', {
          p_task_id: task.id,
          p_to_status: 'completed',
          p_reason: null,
          p_by_name: 'Prod User',
        }),
        `complete ${task.stage_name}`,
      );
    }

    expect(await jobStatus(job.id)).toBe('ready');

    const run = assertOk(
      await production.client
        .from('production_runs')
        .select('status, completed_at')
        .eq('job_id', job.id)
        .single<{ status: string; completed_at: string | null }>(),
      'read run',
    );
    expect(run.status).toBe('completed');
    expect(run.completed_at).not.toBeNull();
  });

  it('leaves a delivered job alone', async () => {
    const job = await makeJob('Already delivered');
    assertOk(await startRun(production.client, job.id, 'Prod User'), 'start run');

    assertNoError(
      await owner.client
        .from('jobs')
        .update({ status: 'delivered', updated_by: owner.uid })
        .eq('id', job.id),
      'mark delivered',
    );

    const tasks = await tasksFor(job.id);
    assertNoError(
      await production.client.rpc('advance_production_task', {
        p_task_id: tasks[0]!.id,
        p_to_status: 'in-progress',
        p_reason: null,
        p_by_name: 'Prod User',
      }),
      'start a stage on a delivered job',
    );

    // Production does not get to undo a decision made elsewhere.
    expect(await jobStatus(job.id)).toBe('delivered');
  });
});

describeIf('the design snapshot', () => {
  it('records the approved version the run was started against, and holds it', async () => {
    const job = await makeJob('Snapshot');
    const designId = crypto.randomUUID();

    assertNoError(
      await admin.from('designs').insert({
        id: designId,
        job_id: job.id,
        job_number: job.job_number,
        job_title: 'Snapshot',
        customer_id: CUSTOMER,
        customer_name: 'Production Fixtures',
        version: 1,
        file_id: designId,
        file_path: `${job.id}/${designId}.png`,
        file_mime: 'image/png',
        file_size_bytes: 1024,
        file_original_name: 'art.png',
        file_uploaded_at: new Date().toISOString(),
        file_uploaded_by: designer.uid,
        preview_kind: 'image',
        uploaded_by_id: designer.uid,
        uploaded_by_name: 'Designer',
        status: 'approved',
        decision_outcome: 'approved',
        decision_comment: 'Go ahead',
        decision_at: new Date().toISOString(),
        decision_source: 'staff',
        decision_by_id: designer.uid,
        decision_by_name: 'Designer',
        created_by: designer.uid,
        updated_by: designer.uid,
      }),
      'seed an approved design',
    );

    const run = assertOk(await startRun(production.client, job.id, 'Prod User'), 'start run');
    expect(run.approved_design_id).toBe(designId);
    expect(run.approved_design_version).toBe(1);

    // A later revision supersedes the approval; the run still points at what
    // the shop floor actually worked from.
    assertNoError(
      await admin
        .from('designs')
        .update({ status: 'superseded', superseded_at: new Date().toISOString() })
        .eq('id', designId),
      'supersede the design',
    );

    const after = assertOk(
      await production.client
        .from('production_runs')
        .select('approved_design_id, approved_design_version')
        .eq('job_id', job.id)
        .single<{ approved_design_id: string; approved_design_version: number }>(),
      'read run back',
    );
    expect(after.approved_design_id).toBe(designId);
    expect(after.approved_design_version).toBe(1);
  });

  it('still starts a job with no approved design', async () => {
    const job = await makeJob('No artwork');
    const run = assertOk(await startRun(production.client, job.id, 'Prod User'), 'start run');

    expect(run.approved_design_id).toBeNull();
  });
});

describeIf('who may do what on the shop floor', () => {
  it.each([
    ['owner', () => owner],
    ['production', () => production],
    ['designer', () => designer],
    ['sales', () => sales],
    ['viewer', () => viewer],
  ] as const)('lets %s read the board', async (_role, account) => {
    assertNoError(
      await account().client.from('production_runs').select('id').limit(1),
      'read runs',
    );
  });

  it('hides the shop floor from accounts entirely', async () => {
    for (const table of ['production_runs', 'production_tasks', 'production_events']) {
      const rows = await accounts.client.from(table).select('id').limit(1);
      expect(rows.data ?? [], table).toHaveLength(0);
    }
  });

  it('hides it from a customer too', async () => {
    const rows = await portal.client.from('production_runs').select('id');
    expect(rows.data ?? []).toHaveLength(0);
  });

  it.each([
    ['sales', () => sales],
    ['viewer', () => viewer],
  ] as const)('stops %s moving a stage along', async (role, account) => {
    const job = await makeJob(`Read only ${role}`);
    assertOk(await startRun(production.client, job.id, 'Prod User'), 'start run');
    const tasks = await tasksFor(job.id);

    const attempt = await account().client.rpc('advance_production_task', {
      p_task_id: tasks[0]!.id,
      p_to_status: 'in-progress',
      p_reason: null,
      p_by_name: 'Nope',
    });
    expect(attempt.error).not.toBeNull();
  });

  it('stops anybody without production:update starting a run', async () => {
    const job = await makeJob('Sales cannot start');
    const attempt = await startRun(sales.client, job.id, 'Sales User');
    expect(attempt.error).not.toBeNull();
  });

  it('lets only somebody with jobs:assign put a name against a stage', async () => {
    const job = await makeJob('Assignment');
    assertOk(await startRun(production.client, job.id, 'Prod User'), 'start run');
    const tasks = await tasksFor(job.id);

    // Production can do the work but not hand it out.
    const byProduction = await production.client.rpc('assign_production_task', {
      p_task_id: tasks[0]!.id,
      p_assignee_id: production.uid,
      p_assignee_name: 'Prod User',
      p_by_name: 'Prod User',
    });
    expect(byProduction.error?.message).toMatch(/permission to assign/i);

    assertNoError(
      await owner.client.rpc('assign_production_task', {
        p_task_id: tasks[0]!.id,
        p_assignee_id: production.uid,
        p_assignee_name: 'Prod User',
        p_by_name: 'Owner',
      }),
      'owner assigns the stage',
    );
  });

  it('lets only the owner change the stage list', async () => {
    const attempt = await production.client.from('workflow_stages').insert({
      name: 'Sneaky stage',
      department: 'printing',
      position: 9,
      is_active: true,
      created_by: production.uid,
      updated_by: production.uid,
    });
    expect(attempt.error).not.toBeNull();

    const stages = await production.client.from('workflow_stages').select('id');
    assertNoError(stages, 'production reads the stage list');
    expect(stages.data ?? []).not.toHaveLength(0);
  });
});

describeIf('the history is not editable', () => {
  it('refuses every update and delete on production events', async () => {
    const job = await makeJob('Immutable history');
    const run = assertOk(await startRun(production.client, job.id, 'Prod User'), 'start run');

    const events = assertOk(
      await production.client
        .from('production_events')
        .select('id')
        .eq('run_id', run.id)
        .returns<{ id: string }[]>(),
      'read events',
    );
    expect(events).not.toHaveLength(0);

    const edited = await owner.client
      .from('production_events')
      .update({ reason: 'rewritten' })
      .eq('id', events[0]!.id);
    expect(edited.error).not.toBeNull();

    const removed = await owner.client.from('production_events').delete().eq('id', events[0]!.id);
    expect(removed.error).not.toBeNull();
  });

  it('refuses to reorder a run or repoint a task at another job', async () => {
    const job = await makeJob('Immutable shape');
    assertOk(await startRun(production.client, job.id, 'Prod User'), 'start run');
    const tasks = await tasksFor(job.id);

    const reordered = await owner.client
      .from('production_tasks')
      .update({ position: 99 })
      .eq('id', tasks[0]!.id);
    expect(reordered.error).not.toBeNull();

    const repointed = await owner.client
      .from('production_tasks')
      .update({ job_id: crypto.randomUUID() })
      .eq('id', tasks[0]!.id);
    expect(repointed.error).not.toBeNull();

    const deleted = await owner.client.from('production_tasks').delete().eq('id', tasks[0]!.id);
    expect(deleted.error).not.toBeNull();
  });
});

describeIf('operations control', () => {
  it('refuses to hand work to somebody who no longer works here', async () => {
    const job = await makeJob('Inactive assignee');
    assertOk(await startRun(production.client, job.id, 'Prod User'), 'start run');
    const tasks = await tasksFor(job.id);

    assertNoError(
      await admin.from('staff_profiles').update({ is_active: false }).eq('id', designer.uid),
      'deactivate the designer',
    );

    const attempt = await owner.client.rpc('assign_production_task', {
      p_task_id: tasks[0]!.id,
      p_assignee_id: designer.uid,
      p_assignee_name: 'Designer',
      p_by_name: 'Owner',
    });
    expect(attempt.error?.message).toMatch(/not active/i);

    assertNoError(
      await admin.from('staff_profiles').update({ is_active: true }).eq('id', designer.uid),
      'reactivate the designer',
    );
  });

  it('records who the work was taken from, and trusts the roll for the name', async () => {
    const job = await makeJob('Reassignment history');
    const run = assertOk(await startRun(production.client, job.id, 'Prod User'), 'start run');
    const tasks = await tasksFor(job.id);

    assertNoError(
      await owner.client.rpc('assign_production_task', {
        p_task_id: tasks[0]!.id,
        p_assignee_id: production.uid,
        // A caller-supplied name is ignored: the history reads the employee
        // record, so it cannot be made to say somebody else did the work.
        p_assignee_name: 'Not my real name',
        p_by_name: 'Owner',
      }),
      'first assignment',
    );
    assertNoError(
      await owner.client.rpc('assign_production_task', {
        p_task_id: tasks[0]!.id,
        p_assignee_id: designer.uid,
        p_assignee_name: 'Designer',
        p_by_name: 'Owner',
      }),
      'reassignment',
    );

    const events = assertOk(
      await production.client
        .from('production_events')
        .select('reason, at')
        .eq('run_id', run.id)
        .eq('action', 'stage-assigned')
        .order('at', { ascending: true })
        .returns<{ reason: string }[]>(),
      'read assignment history',
    );

    expect(events[0]?.reason).toBe('Assigned to production user');
    expect(events[1]?.reason).toBe('Reassigned from production user to designer user');

    const task = (await tasksFor(job.id))[0];
    expect(task?.assigned_to_name).toBe('designer user');
  });

  it('lets a production user work on their own stage but never hand it out', async () => {
    const job = await makeJob('My work');
    assertOk(await startRun(production.client, job.id, 'Prod User'), 'start run');
    const tasks = await tasksFor(job.id);

    assertNoError(
      await owner.client.rpc('assign_production_task', {
        p_task_id: tasks[0]!.id,
        p_assignee_id: production.uid,
        p_assignee_name: 'Prod User',
        p_by_name: 'Owner',
      }),
      'owner assigns the stage',
    );

    // It is theirs, and they can get on with it.
    const mine = assertOk(
      await production.client
        .from('production_tasks')
        .select('id, assigned_to_id')
        .eq('assigned_to_id', production.uid)
        .eq('id', tasks[0]!.id)
        .returns<{ id: string }[]>(),
      'read my work',
    );
    expect(mine).toHaveLength(1);

    assertNoError(
      await production.client.rpc('advance_production_task', {
        p_task_id: tasks[0]!.id,
        p_to_status: 'in-progress',
        p_reason: null,
        p_by_name: 'Prod User',
      }),
      'work on my own stage',
    );

    // Passing it on is somebody else's decision.
    const handOff = await production.client.rpc('assign_production_task', {
      p_task_id: tasks[0]!.id,
      p_assignee_id: designer.uid,
      p_assignee_name: 'Designer',
      p_by_name: 'Prod User',
    });
    expect(handOff.error?.message).toMatch(/permission to assign/i);
  });
});
