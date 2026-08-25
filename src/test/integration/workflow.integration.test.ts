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
 * The business rules that only a real database can prove.
 *
 * Numbering under concurrency, the estimate snapshot holding still while the
 * rate card moves underneath it, version numbering on designs, and storage
 * objects being write-once. These replace the Firebase emulator end-to-end
 * suites.
 */
const describeIf = HAS_BACKEND ? describe : describe.skip;

let admin: SupabaseClient;
let owner: TestAccount;
let sales: TestAccount;
let designer: TestAccount;
let portal: TestAccount;

const CUSTOMER = 'aaaaaaaa-0000-4000-8000-00000000000a';
const FY = '2627';

async function makeJob(title = 'Shop board') {
  const { data, error } = await sales.client
    .rpc('create_job', {
      p_payload: {
        customer_id: CUSTOMER,
        customer_name: 'Shreeji Traders',
        customer_mobile: '9812300011',
        job_date: new Date().toISOString(),
        title,
        requirement_text: 'Backlit board',
        status: 'open',
      },
      p_year_key: FY,
    })
    .single<{ id: string; job_number: string }>();
  return assertOk({ data, error }, 'create_job');
}

async function priceJob(jobId: string, ratePaise: number, amountPaise: number) {
  const result = await owner.client.rpc('save_job_pricing', {
    p_job_id: jobId,
    p_pricing: {
      subtotal_paise: amountPaise,
      adjustment_paise: null,
      adjustment_reason: null,
      total_paise: amountPaise,
      lines: [
        {
          product_name: 'Flex Print 440 GSM',
          pricing_method: 'per-square-foot',
          measurement_unit: 'foot',
          width: 6,
          height: 4,
          length: null,
          quantity: 2,
          rate_paise: ratePaise,
          rate_unit: 'sq-ft',
          calculated_area: 24,
          calculated_length: null,
          line_amount_paise: amountPaise,
          notes: null,
        },
      ],
    },
  });
  assertNoError(result, 'save_job_pricing');
}

beforeAll(async () => {
  if (!HAS_BACKEND) {
    console.warn(SKIP_MESSAGE);
    return;
  }
  admin = adminClient();

  owner = await signedInAs(admin, 'owner.wf@devasriya.test', 'Owner@12345678');
  sales = await signedInAs(admin, 'sales.wf@devasriya.test', 'Sales@12345678');
  designer = await signedInAs(admin, 'design.wf@devasriya.test', 'Design@1234567');
  portal = await signedInAs(admin, 'mine.wf@customer.test', 'Mine@12345678');

  await seedStaff(admin, owner, 'owner');
  await seedStaff(admin, sales, 'sales');
  await seedStaff(admin, designer, 'designer');

  assertNoError(
    await admin.from('customers').upsert({
      id: CUSTOMER,
      name: 'Shreeji Traders (workflow)',
      type: 'business',
      mobile: '9829100099',
      address: '1 Market Road',
      city: 'Udaipur',
      state: 'Rajasthan',
      pincode: '313001',
      preferred_language: 'hi',
      created_by: owner.uid,
      updated_by: owner.uid,
    }),
    'seed workflow customer',
  );
  await seedCustomerAccount(admin, portal, CUSTOMER, 'Shreeji Traders (workflow)');
  // Deliberately not resetting document_counters. The records from previous
  // runs are still in this database, so restarting the counter would hand out a
  // number that is already taken. Every assertion below is relative - the next
  // number is one higher than the last - which is the property that matters.
});

afterAll(async () => {
  if (!HAS_BACKEND) return;
  for (const account of [owner, sales, designer, portal]) {
    await account.client.auth.signOut();
  }
});

describeIf('financial year numbering', () => {
  it('counts up in sequence for each kind of document', async () => {
    const first = await makeJob('First');
    const second = await makeJob('Second');

    expect(first.job_number).toMatch(/^JOB-\d{4}-\d{4}$/);
    expect(Number(second.job_number.slice(-4))).toBe(Number(first.job_number.slice(-4)) + 1);
  });

  it('never hands the same number to two people creating at once', async () => {
    const made = await Promise.all(
      Array.from({ length: 8 }, (_, i) => makeJob(`Race ${String(i)}`)),
    );
    const numbers = new Set(made.map((job) => job.job_number));

    // Eight simultaneous creations, eight distinct numbers. The counter row is
    // locked until each transaction commits, so there is nothing to collide on.
    expect(numbers.size).toBe(8);
  });

  it('keeps the series gapless when a creation is rolled back', async () => {
    const before = await makeJob('Before');

    // A job with no customer violates the foreign key, so the whole
    // transaction - including the number it took - is rolled back.
    const failed = await sales.client.rpc('create_job', {
      p_payload: {
        customer_id: '00000000-0000-4000-8000-000000000000',
        customer_name: 'Nobody',
        customer_mobile: '9812300011',
        job_date: new Date().toISOString(),
        title: 'Doomed',
        requirement_text: 'x',
        status: 'open',
      },
      p_year_key: FY,
    });
    expect(failed.error).not.toBeNull();

    const after = await makeJob('After');
    expect(Number(after.job_number.slice(-4))).toBe(Number(before.job_number.slice(-4)) + 1);
  });

  it('refuses to hand a number to a customer', async () => {
    // A portal user holds no permission at all, so the insert inside the RPC
    // fails the policy and the number it took is rolled back with it.
    const { error } = await portal.client.rpc('create_job', {
      p_payload: {
        customer_id: CUSTOMER,
        customer_name: 'Shreeji Traders',
        customer_mobile: '9812300011',
        job_date: new Date().toISOString(),
        title: 'Not allowed',
        requirement_text: 'x',
        status: 'open',
      },
      p_year_key: FY,
    });
    expect(error).not.toBeNull();
  });
});

describeIf('the estimate snapshot is a historical record', () => {
  it('copies the priced lines and does not move when the job is re-priced', async () => {
    const job = await makeJob('Snapshot');
    await priceJob(job.id, 2500, 120_000);

    const created = assertOk(
      await owner.client
        .rpc('create_estimate', {
          p_job_id: job.id,
          p_valid_until: new Date(Date.now() + 15 * 864e5).toISOString(),
          p_notes: null,
          p_terms: 'Half in advance.',
          p_year_key: FY,
        })
        .single<{ id: string; estimate_number: string; total_paise: number }>(),
      'create_estimate',
    );
    expect(created.estimate_number).toMatch(/^EST-\d{4}-\d{4}$/);

    const lines = assertOk(
      await owner.client
        .from('estimate_lines')
        .select('rate_paise, line_amount_paise')
        .eq('estimate_id', created.id),
      'read estimate_lines',
    );
    expect(lines).toHaveLength(1);
    expect(Number(lines[0]?.rate_paise)).toBe(2500);

    // Re-price the job at three times the rate.
    await priceJob(job.id, 7500, 360_000);

    const after = assertOk(
      await owner.client
        .from('estimates')
        .select('total_paise, estimate_lines(rate_paise)')
        .eq('id', created.id)
        .single<{ total_paise: number; estimate_lines: { rate_paise: number }[] }>(),
      'read estimate back',
    );

    expect(Number(after.total_paise)).toBe(120_000);
    expect(Number(after.estimate_lines[0]?.rate_paise)).toBe(2500);
  });

  it('refuses a quotation for a job that has not been priced', async () => {
    const job = await makeJob('Unpriced');
    const { error } = await owner.client.rpc('create_estimate', {
      p_job_id: job.id,
      p_valid_until: new Date().toISOString(),
      p_notes: null,
      p_terms: null,
      p_year_key: FY,
    });
    expect(error?.message).toMatch(/Price the job/i);
  });

  it('refuses to rewrite the snapshot, even for the owner', async () => {
    const job = await makeJob('Immutable');
    await priceJob(job.id, 2500, 120_000);
    const created = assertOk(
      await owner.client
        .rpc('create_estimate', {
          p_job_id: job.id,
          p_valid_until: new Date().toISOString(),
          p_notes: null,
          p_terms: null,
          p_year_key: FY,
        })
        .single<{ id: string }>(),
      'create_estimate',
    );

    const total = await owner.client
      .from('estimates')
      .update({ total_paise: 1, updated_by: owner.uid })
      .eq('id', created.id);
    expect(total.error).not.toBeNull();

    const line = await owner.client
      .from('estimate_lines')
      .update({ rate_paise: 1 })
      .eq('estimate_id', created.id);
    expect(line.error).not.toBeNull();
  });

  it('refuses an invalid status move and keeps the wording locked once sent', async () => {
    const job = await makeJob('Transitions');
    await priceJob(job.id, 2500, 120_000);
    const created = assertOk(
      await owner.client
        .rpc('create_estimate', {
          p_job_id: job.id,
          p_valid_until: new Date().toISOString(),
          p_notes: null,
          p_terms: null,
          p_year_key: FY,
        })
        .single<{ id: string }>(),
      'create_estimate',
    );
    const id = created.id;

    // draft cannot jump straight to approved.
    const jump = await owner.client
      .from('estimates')
      .update({
        status: 'approved',
        decision_outcome: 'approved',
        decision_at: new Date().toISOString(),
        decision_by_id: owner.uid,
        decision_by_name: 'owner user',
        updated_by: owner.uid,
      })
      .eq('id', id)
      .select();
    expect(jump.data ?? []).toHaveLength(0);

    const sent = await owner.client
      .from('estimates')
      .update({ status: 'sent', sent_at: new Date().toISOString(), updated_by: owner.uid })
      .eq('id', id)
      .select();
    expect(sent.data ?? []).toHaveLength(1);

    const reword = await owner.client
      .from('estimates')
      .update({ notes: 'Quietly changed after sending', updated_by: owner.uid })
      .eq('id', id);
    expect(reword.error?.message).toMatch(/can no longer be changed/i);
  });
});

describeIf('design versions', () => {
  async function addVersion(jobId: string, submitNow = true) {
    const attachmentId = crypto.randomUUID();
    const { data, error } = await designer.client
      .rpc('create_design_version', {
        p_job_id: jobId,
        p_payload: {
          file_id: attachmentId,
          file_path: `${jobId}/${attachmentId}.png`,
          file_mime: 'image/png',
          file_size_bytes: 204_800,
          file_original_name: 'board.png',
          file_uploaded_at: new Date().toISOString(),
          preview_kind: 'image',
          preview_width: 1600,
          preview_height: 900,
          uploaded_by_name: 'designer user',
          designer_note: 'First pass',
        },
        p_submit_now: submitNow,
      })
      .single<{ id: string; version: number; status: string; file_path: string }>();
    return assertOk({ data, error }, 'create_design_version');
  }

  it('numbers versions in order and gives each its own file', async () => {
    const job = await makeJob('Versions');
    const first = await addVersion(job.id);
    const second = await addVersion(job.id);

    expect([first.version, second.version]).toEqual([1, 2]);
    expect(first.file_path).not.toBe(second.file_path);

    // The version that was still with the customer stepped aside, unanswered.
    const all = await designer.client
      .from('designs')
      .select('version, status, decision_outcome')
      .eq('job_id', job.id)
      .order('version');
    expect(all.data?.[0]?.status).toBe('superseded');
    expect(all.data?.[0]?.decision_outcome).toBeNull();
    expect(all.data?.[1]?.status).toBe('submitted-for-review');
  });

  it('never lets two designers take the same version number', async () => {
    const job = await makeJob('Concurrent versions');
    const made = await Promise.all([addVersion(job.id), addVersion(job.id), addVersion(job.id)]);
    expect(new Set(made.map((design) => design.version)).size).toBe(3);
  });

  it('keeps a change request and its comment when the revision arrives', async () => {
    const job = await makeJob('History');
    const first = await addVersion(job.id);

    const answered = await portal.client.rpc('record_design_decision', {
      p_design_id: first.id,
      p_outcome: 'changes-requested',
      p_comment: 'Please make the discount bigger.',
      p_source: 'customer',
      p_by_name: 'Shreeji Traders',
      p_language: 'hi',
    });
    expect(answered.error).toBeNull();

    await addVersion(job.id);

    const v1 = await designer.client
      .from('designs')
      .select('status, decision_comment')
      .eq('job_id', job.id)
      .eq('version', 1)
      .single<{ status: string; decision_comment: string }>();

    expect(v1.data?.status).toBe('changes-requested');
    expect(v1.data?.decision_comment).toBe('Please make the discount bigger.');
  });

  it('keeps a comment on an approval, and never lets a job have two approved', async () => {
    const job = await makeJob('Approvals');
    const first = await addVersion(job.id);

    await portal.client.rpc('record_design_decision', {
      p_design_id: first.id,
      p_outcome: 'approved',
      p_comment: 'Approved, but please make the font size bigger.',
      p_source: 'customer',
      p_by_name: 'Shreeji Traders',
      p_language: 'hi',
    });

    const second = await addVersion(job.id);
    await portal.client.rpc('record_design_decision', {
      p_design_id: second.id,
      p_outcome: 'approved',
      p_comment: 'Use this one',
      p_source: 'customer',
      p_by_name: 'Shreeji Traders',
    });

    const all = await designer.client
      .from('designs')
      .select('version, status, decision_comment')
      .eq('job_id', job.id)
      .order('version');

    const approved = all.data?.filter((row) => row.status === 'approved') ?? [];
    expect(approved).toHaveLength(1);
    expect(approved[0]?.version).toBe(2);
    // The replaced approval keeps its comment; only its status moved.
    expect(all.data?.[0]?.decision_comment).toBe('Approved, but please make the font size bigger.');
  });

  it('insists on a reason for a rejection or a change request', async () => {
    const job = await makeJob('Reasons');
    const version = await addVersion(job.id);

    const { error } = await portal.client.rpc('record_design_decision', {
      p_design_id: version.id,
      p_outcome: 'rejected',
      p_comment: '   ',
      p_source: 'customer',
      p_by_name: 'Shreeji Traders',
    });
    expect(error?.message).toMatch(/why it was rejected/i);
  });

  it('refuses to answer a version twice', async () => {
    const job = await makeJob('Answered once');
    const version = await addVersion(job.id);

    await portal.client.rpc('record_design_decision', {
      p_design_id: version.id,
      p_outcome: 'approved',
      p_comment: 'Yes',
      p_source: 'customer',
      p_by_name: 'Shreeji Traders',
    });

    const again = await portal.client.rpc('record_design_decision', {
      p_design_id: version.id,
      p_outcome: 'rejected',
      p_comment: 'Changed our mind',
      p_source: 'customer',
      p_by_name: 'Shreeji Traders',
    });
    expect(again.error).not.toBeNull();
  });
});

describeIf('storage objects are private and written once', () => {
  const BYTES = new Uint8Array([137, 80, 78, 71]);

  it('refuses a second write to the same design path', async () => {
    const job = await makeJob('Storage');
    const path = `${job.id}/${crypto.randomUUID()}.png`;

    const first = await designer.client.storage
      .from('designs')
      .upload(path, BYTES, { contentType: 'image/png', upsert: false });
    expect(first.error).toBeNull();

    const second = await designer.client.storage
      .from('designs')
      .upload(path, BYTES, { contentType: 'image/png', upsert: true });
    expect(second.error).not.toBeNull();
  });

  it('refuses a delete, so approved artwork stays openable', async () => {
    const job = await makeJob('No deletes');
    const path = `${job.id}/${crypto.randomUUID()}.png`;
    await designer.client.storage.from('designs').upload(path, BYTES, { contentType: 'image/png' });

    const removed = await designer.client.storage.from('designs').remove([path]);
    expect(removed.data ?? []).toHaveLength(0);
  });

  it('signs a URL for the customer whose order it is, and keeps the bucket private', async () => {
    const job = await makeJob('Signed');
    const path = `${job.id}/${crypto.randomUUID()}.png`;
    await designer.client.storage.from('designs').upload(path, BYTES, { contentType: 'image/png' });

    const signed = await portal.client.storage.from('designs').createSignedUrl(path, 60);
    expect(signed.data?.signedUrl).toContain('token=');

    // The bucket is private: there is no permanent public URL to hand out, so
    // nothing that could be stored on a row and reused later.
    const { data: publicUrl } = portal.client.storage.from('designs').getPublicUrl(path);
    const fetched = await fetch(publicUrl.publicUrl);
    expect(fetched.ok).toBe(false);
  });

  it('never lets a designer upload into a bucket they have no permission for', async () => {
    const attempt = await designer.client.storage
      .from('enquiry-audio')
      .upload(`${crypto.randomUUID()}/a.webm`, BYTES, { contentType: 'audio/webm' });
    expect(attempt.error).not.toBeNull();
  });

  it('keeps enquiry audio out of reach of a customer', async () => {
    const path = `${crypto.randomUUID()}/a.webm`;
    await sales.client.storage
      .from('enquiry-audio')
      .upload(path, BYTES, { contentType: 'audio/webm' });

    const attempt = await portal.client.storage.from('enquiry-audio').createSignedUrl(path, 60);
    expect(attempt.error).not.toBeNull();
  });
});

describeIf('the enquiry to job conversion', () => {
  it('writes the job and stamps the enquiry together, and refuses a second time', async () => {
    const enquiry = assertOk(
      await sales.client
        .rpc('create_enquiry', {
          p_payload: {
            customer_id: CUSTOMER,
            customer_name: 'Shreeji Traders',
            customer_mobile: '9812300011',
            enquiry_date: new Date().toISOString(),
            source: 'walk-in',
            requirement_text: 'Wedding cards',
            status: 'new',
          },
          p_year_key: FY,
        })
        .single<{ id: string; enquiry_number: string }>(),
      'create_enquiry',
    );
    expect(enquiry.enquiry_number).toMatch(/^ENQ-\d{4}-\d{4}$/);

    const converted = await sales.client
      .rpc('convert_enquiry_to_job', {
        p_enquiry_id: enquiry.id,
        p_payload: {
          customer_id: CUSTOMER,
          customer_name: 'Shreeji Traders',
          customer_mobile: '9812300011',
          job_date: new Date().toISOString(),
          title: 'Wedding cards',
          requirement_text: 'Wedding cards',
          status: 'open',
        },
        p_year_key: FY,
      })
      .single<{ id: string; enquiry_id: string; enquiry_number: string }>();

    const job = assertOk(converted, 'convert_enquiry_to_job');
    expect(job.enquiry_id).toBe(enquiry.id);
    expect(job.enquiry_number).toBe(enquiry.enquiry_number);

    const stamped = assertOk(
      await sales.client
        .from('enquiries')
        .select('status, converted_job_id')
        .eq('id', enquiry.id)
        .single<{ status: string; converted_job_id: string }>(),
      'read enquiry back',
    );
    expect(stamped.status).toBe('converted');
    expect(stamped.converted_job_id).toBe(job.id);

    const again = await sales.client.rpc('convert_enquiry_to_job', {
      p_enquiry_id: enquiry.id,
      p_payload: {
        customer_id: CUSTOMER,
        customer_name: 'Shreeji Traders',
        customer_mobile: '9812300011',
        job_date: new Date().toISOString(),
        title: 'Wedding cards again',
        requirement_text: 'x',
        status: 'open',
      },
      p_year_key: FY,
    });
    expect(again.error?.message).toMatch(/already been converted/i);
  });

  it('records a follow-up and the status move together', async () => {
    const enquiry = assertOk(
      await sales.client
        .rpc('create_enquiry', {
          p_payload: {
            customer_id: CUSTOMER,
            customer_name: 'Shreeji Traders',
            customer_mobile: '9812300011',
            enquiry_date: new Date().toISOString(),
            source: 'phone',
            requirement_text: 'Banner',
            status: 'new',
          },
          p_year_key: FY,
        })
        .single<{ id: string }>(),
      'create_enquiry',
    );

    assertNoError(
      await sales.client.rpc('add_enquiry_follow_up', {
        p_enquiry_id: enquiry.id,
        p_note: 'Shared two paper options',
        p_by_name: 'sales user',
        p_status: 'contacted',
        p_next_follow_up_at: new Date(Date.now() + 864e5).toISOString(),
      }),
      'add_enquiry_follow_up',
    );

    const after = assertOk(
      await sales.client
        .from('enquiries')
        .select('status, enquiry_follow_ups(note)')
        .eq('id', enquiry.id)
        .single<{ status: string; enquiry_follow_ups: { note: string }[] }>(),
      'read enquiry with follow-ups',
    );

    expect(after.status).toBe('contacted');
    expect(after.enquiry_follow_ups[0]?.note).toBe('Shared two paper options');
  });
});
