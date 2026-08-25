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
 * Stock, against a real database.
 *
 * The rule that has to hold whoever is calling: stock never goes below zero,
 * the running figure is never written by a client, and a movement once
 * recorded cannot be edited or removed.
 */
const describeIf = HAS_BACKEND ? describe : describe.skip;

let admin: SupabaseClient;
let owner: TestAccount;
let production: TestAccount;
let accounts: TestAccount;
let sales: TestAccount;
let viewer: TestAccount;
let portal: TestAccount;

const CUSTOMER = 'eeeeeeee-0000-4000-8000-00000000000e';
const FY = '2627';
let jobId = '';

interface ItemRow {
  id: string;
  name: string;
  current_stock: number;
  minimum_stock: number;
  is_active: boolean;
}

let sequence = 0;

/** A fresh material per test, so a persistent database cannot leak between them. */
async function makeItem(label: string, opening: number, minimum = 0): Promise<ItemRow> {
  sequence += 1;
  const item = assertOk(
    await production.client
      .from('inventory_items')
      .insert({
        name: `${label} ${String(sequence)}-${String(Date.now())}`,
        category: 'media',
        unit: 'sq-ft',
        minimum_stock: minimum,
        is_active: true,
        created_by: production.uid,
        updated_by: production.uid,
      })
      .select('id, name, current_stock, minimum_stock, is_active')
      .single<ItemRow>(),
    'create inventory item',
  );

  if (opening > 0) {
    assertOk(
      await move(production.client, item.id, 'in', opening, null, 'Opening stock'),
      'opening stock',
    );
  }
  return item;
}

async function move(
  client: SupabaseClient,
  itemId: string,
  direction: 'in' | 'out',
  quantity: number,
  jobRef: string | null = null,
  reason: string | null = null,
) {
  return client
    .rpc('record_stock_movement', {
      p_item_id: itemId,
      p_direction: direction,
      p_quantity: quantity,
      p_job_id: jobRef,
      p_reason: reason,
    })
    .single<{
      id: string;
      item_name: string;
      unit: string;
      balance_after: number;
      job_number: string | null;
      by_name: string;
    }>();
}

async function readItem(id: string): Promise<ItemRow> {
  return assertOk(
    await production.client
      .from('inventory_items')
      .select('id, name, current_stock, minimum_stock, is_active')
      .eq('id', id)
      .single<ItemRow>(),
    'read inventory item',
  );
}

beforeAll(async () => {
  if (!HAS_BACKEND) {
    console.warn(SKIP_MESSAGE);
    return;
  }
  admin = adminClient();

  owner = await signedInAs(admin, 'owner.inv@devasriya.test', 'Owner@12345678');
  production = await signedInAs(admin, 'prod.inv@devasriya.test', 'Prod@12345678');
  accounts = await signedInAs(admin, 'acct.inv@devasriya.test', 'Acct@12345678');
  sales = await signedInAs(admin, 'sales.inv@devasriya.test', 'Sales@12345678');
  viewer = await signedInAs(admin, 'view.inv@devasriya.test', 'Viewer@1234567');
  portal = await signedInAs(admin, 'portal.inv@customer.test', 'Portal@1234567');

  await seedStaff(admin, owner, 'owner');
  await seedStaff(admin, production, 'production');
  await seedStaff(admin, accounts, 'accounts');
  await seedStaff(admin, sales, 'sales');
  await seedStaff(admin, viewer, 'viewer');

  assertNoError(
    await admin.from('customers').upsert({
      id: CUSTOMER,
      name: 'Inventory Fixtures',
      type: 'business',
      mobile: '9829100066',
      address: '3 Store Lane',
      city: 'Udaipur',
      state: 'Rajasthan',
      pincode: '313001',
      preferred_language: 'hi',
      created_by: owner.uid,
      updated_by: owner.uid,
    }),
    'seed inventory customer',
  );
  await seedCustomerAccount(admin, portal, CUSTOMER, 'Inventory Fixtures');

  const job = assertOk(
    await sales.client
      .rpc('create_job', {
        p_payload: {
          customer_id: CUSTOMER,
          customer_name: 'Inventory Fixtures',
          customer_mobile: '9812300033',
          job_date: new Date().toISOString(),
          title: 'Inventory fixture job',
          requirement_text: 'Fixture',
          status: 'open',
        },
        p_year_key: FY,
      })
      .single<{ id: string; job_number: string }>(),
    'create_job',
  );
  jobId = job.id;
});

afterAll(async () => {
  if (!HAS_BACKEND) return;
  for (const account of [owner, production, accounts, sales, viewer, portal]) {
    await account?.client.auth.signOut();
  }
});

describeIf('stock can never go below zero', () => {
  it('refuses to issue more than is on hand, and changes nothing', async () => {
    const item = await makeItem('Refuses overdraw', 100);

    const refused = await move(production.client, item.id, 'out', 101);
    expect(refused.error?.message).toMatch(/not enough/i);

    expect((await readItem(item.id)).current_stock).toBe(100);
    const history = assertOk(
      await production.client
        .from('inventory_transactions')
        .select('id')
        .eq('item_id', item.id)
        .returns<{ id: string }[]>(),
      'read history',
    );
    expect(history).toHaveLength(1);
  });

  it('allows issuing exactly what is left', async () => {
    const item = await makeItem('Allows exact', 60);

    const last = assertOk(await move(production.client, item.id, 'out', 60), 'issue the rest');
    expect(last.balance_after).toBe(60 - 60);
    expect((await readItem(item.id)).current_stock).toBe(0);
  });

  it('refuses a zero or negative quantity', async () => {
    const item = await makeItem('Refuses nothing', 10);

    expect((await move(production.client, item.id, 'in', 0)).error?.message).toMatch(/how much/i);
    expect((await move(production.client, item.id, 'out', -5)).error).not.toBeNull();
  });

  it('refuses a movement against a material no longer in use', async () => {
    const item = await makeItem('Retired material', 25);
    assertNoError(
      await production.client
        .from('inventory_items')
        .update({ is_active: false, updated_by: production.uid })
        .eq('id', item.id),
      'retire the material',
    );

    const refused = await move(production.client, item.id, 'in', 5);
    expect(refused.error?.message).toMatch(/no longer in use/i);
  });
});

describeIf('the movement ledger', () => {
  it('snapshots the material, the job and who moved it', async () => {
    const item = await makeItem('Ledger snapshot', 200);

    const out = assertOk(
      await move(production.client, item.id, 'out', 30, jobId, 'Two boards'),
      'issue against a job',
    );

    expect(out.item_name).toBe(item.name);
    expect(out.unit).toBe('sq-ft');
    expect(out.balance_after).toBe(170);
    expect(out.job_number).toMatch(/^JOB-/);
    expect(out.by_name).toBe('production user');
  });

  it('is append-only: a movement cannot be edited or removed', async () => {
    const item = await makeItem('Ledger immutable', 50);
    const entry = assertOk(await move(production.client, item.id, 'out', 5), 'issue');

    const edited = await production.client
      .from('inventory_transactions')
      .update({ quantity: 1 })
      .eq('id', entry.id);
    expect(edited.error).not.toBeNull();

    const removed = await production.client
      .from('inventory_transactions')
      .delete()
      .eq('id', entry.id);
    expect(removed.error).not.toBeNull();

    expect((await readItem(item.id)).current_stock).toBe(45);
  });

  it('will not let the running figure be written directly', async () => {
    const item = await makeItem('Figure is derived', 40);

    // current_stock carries no update grant, for any role.
    for (const account of [production, owner]) {
      const forged = await account.client
        .from('inventory_items')
        .update({ current_stock: 9_999, updated_by: account.uid })
        .eq('id', item.id);
      expect(forged.error).not.toBeNull();
    }

    expect((await readItem(item.id)).current_stock).toBe(40);
  });

  it('starts a new material empty whatever the insert asks for', async () => {
    sequence += 1;
    const item = assertOk(
      await production.client
        .from('inventory_items')
        .insert({
          name: `Starts empty ${String(sequence)}-${String(Date.now())}`,
          category: 'ink',
          unit: 'litre',
          current_stock: 500,
          minimum_stock: 5,
          is_active: true,
          created_by: production.uid,
          updated_by: production.uid,
        })
        .select('id, name, current_stock, minimum_stock, is_active')
        .single<ItemRow>(),
      'create with an opening figure',
    );

    expect(item.current_stock).toBe(0);
  });
});

describeIf('who may do what', () => {
  it('lets accounts and sales look but never move stock', async () => {
    const item = await makeItem('Read only roles', 20);

    for (const account of [accounts, sales]) {
      const read = await account.client
        .from('inventory_items')
        .select('id')
        .eq('id', item.id)
        .maybeSingle();
      expect(read.error).toBeNull();
      expect(read.data).not.toBeNull();

      expect((await move(account.client, item.id, 'in', 1)).error).not.toBeNull();
    }

    expect((await readItem(item.id)).current_stock).toBe(20);
  });

  it('shows nothing at all to roles without inventory:view', async () => {
    const item = await makeItem('Hidden material', 15);

    // Row level security answers "no rows", not "forbidden".
    for (const account of [viewer, portal]) {
      const items = await account.client.from('inventory_items').select('id').eq('id', item.id);
      expect(items.data ?? []).toHaveLength(0);

      const history = await account.client
        .from('inventory_transactions')
        .select('id')
        .eq('item_id', item.id);
      expect(history.data ?? []).toHaveLength(0);
    }
  });

  it('refuses a movement recorded under another employee name', async () => {
    const item = await makeItem('Forged mover', 10);

    const forged = await production.client.from('inventory_transactions').insert({
      item_id: item.id,
      item_name: item.name,
      unit: 'sq-ft',
      direction: 'out',
      quantity: 1,
      balance_after: 9,
      at: new Date().toISOString(),
      by_id: owner.uid,
      by_name: 'owner user',
      created_by: production.uid,
    });
    expect(forged.error).not.toBeNull();
    expect((await readItem(item.id)).current_stock).toBe(10);
  });
});
