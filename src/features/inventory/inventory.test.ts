import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDemoStore } from '@/features/demo/demo-store';
import {
  createInventoryItem,
  findInventoryItem,
  listInventoryItems,
  listInventoryTransactions,
  recordStockMovement,
  updateInventoryItem,
} from '@/features/inventory/services/inventory.service';
import { isLowStock, isOutOfStock, type InventoryItem } from '@/features/inventory/types';
import { AppError } from '@/types/common';

/**
 * Inventory, against the demo store.
 *
 * The demo store is the same service code with a memory backend. The refusal
 * to take stock below zero is repeated in the database, under a row lock - see
 * the integration suite.
 */
vi.mock('@/config/demo', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isDemoMode: () => true,
}));

const ACTOR = { uid: 'demo-owner', name: 'Demo Owner' };

beforeEach(() => {
  resetDemoStore();
});

async function item(id: string): Promise<InventoryItem> {
  const found = await findInventoryItem(id);
  if (!found) throw new Error(`demo material ${id} missing`);
  return found;
}

describe('stock can never go negative', () => {
  it('refuses to issue more than is on hand, and changes nothing', async () => {
    const flex = await item('demo-material-1');

    await expect(
      recordStockMovement({
        itemId: flex.id,
        direction: 'out',
        quantity: flex.currentStock + 1,
        actor: ACTOR,
      }),
    ).rejects.toBeInstanceOf(AppError);

    expect((await item(flex.id)).currentStock).toBe(flex.currentStock);
    expect(await listInventoryTransactions({ itemId: flex.id })).toHaveLength(2);
  });

  it('allows issuing exactly what is left', async () => {
    const flex = await item('demo-material-1');

    await recordStockMovement({
      itemId: flex.id,
      direction: 'out',
      quantity: flex.currentStock,
      reason: 'Cleared the roll',
      actor: ACTOR,
    });

    expect((await item(flex.id)).currentStock).toBe(0);
  });

  it('refuses anything issued against a material already at zero', async () => {
    const film = await item('demo-material-4');
    expect(film.currentStock).toBe(0);

    await expect(
      recordStockMovement({ itemId: film.id, direction: 'out', quantity: 1, actor: ACTOR }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('refuses a zero or negative quantity', async () => {
    await expect(
      recordStockMovement({
        itemId: 'demo-material-1',
        direction: 'in',
        quantity: 0,
        actor: ACTOR,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe('transaction history', () => {
  it('records the balance each movement left behind', async () => {
    const ink = await item('demo-material-2');

    await recordStockMovement({
      itemId: ink.id,
      direction: 'in',
      quantity: 10,
      reason: 'Supplier delivery',
      actor: ACTOR,
    });
    await recordStockMovement({
      itemId: ink.id,
      direction: 'out',
      quantity: 4,
      jobId: 'demo-job-1',
      actor: ACTOR,
    });

    const history = await listInventoryTransactions({ itemId: ink.id });
    expect(history).toHaveLength(2);
    expect(history[0]?.balanceAfter).toBe(9);
    expect(history[1]?.balanceAfter).toBe(13);
    expect((await item(ink.id)).currentStock).toBe(9);
  });

  it('keeps the job number so usage can be read job by job', async () => {
    const usage = await listInventoryTransactions({ jobId: 'demo-job-1' });

    expect(usage.length).toBeGreaterThan(0);
    expect(usage.every((entry) => entry.jobNumber === 'JOB-2627-0001')).toBe(true);
    expect(usage.every((entry) => entry.direction === 'out')).toBe(true);
  });

  it('snapshots who moved it and what it was called', async () => {
    await recordStockMovement({
      itemId: 'demo-material-3',
      direction: 'out',
      quantity: 10,
      actor: ACTOR,
    });

    const [latest] = await listInventoryTransactions({ itemId: 'demo-material-3' });
    expect(latest?.byName).toBe('Demo Owner');
    expect(latest?.itemName).toBe('Aluminium frame section');
    expect(latest?.unit).toBe('running-ft');
  });
});

describe('materials', () => {
  it('starts a new material empty and records the opening balance as a movement', async () => {
    const created = await createInventoryItem(
      {
        name: 'Vinyl 100 micron',
        category: 'media',
        unit: 'sq-ft',
        minimumStock: 100,
        isActive: true,
      },
      250,
      ACTOR,
    );

    expect(created.currentStock).toBe(250);

    const history = await listInventoryTransactions({ itemId: created.id });
    expect(history).toHaveLength(1);
    expect(history[0]?.direction).toBe('in');
    expect(history[0]?.quantity).toBe(250);
    expect(history[0]?.reason).toBe('Opening stock');
  });

  it('adds a material with no opening stock without inventing a movement', async () => {
    const created = await createInventoryItem(
      { name: 'Eyelets', category: 'hardware', unit: 'piece', minimumStock: 0, isActive: true },
      0,
      ACTOR,
    );

    expect(created.currentStock).toBe(0);
    expect(await listInventoryTransactions({ itemId: created.id })).toHaveLength(0);
  });

  it('refuses to move stock against a material no longer in use', async () => {
    await updateInventoryItem(
      'demo-material-3',
      {
        name: 'Aluminium frame section',
        category: 'hardware',
        unit: 'running-ft',
        minimumStock: 60,
        isActive: false,
      },
      ACTOR,
    );

    await expect(
      recordStockMovement({
        itemId: 'demo-material-3',
        direction: 'in',
        quantity: 10,
        actor: ACTOR,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe('low stock', () => {
  it('flags a material at or below its minimum, and only while it is in use', async () => {
    const items = await listInventoryItems();
    const low = items.filter(isLowStock).map((entry) => entry.name);

    expect(low).toContain('Solvent ink - cyan');
    expect(low).toContain('Matte lamination film');
    expect(low).not.toContain('Flex 440 GSM roll');

    expect(items.filter(isOutOfStock).map((entry) => entry.name)).toEqual([
      'Matte lamination film',
    ]);
  });

  it('does not flag a material whose minimum is zero', async () => {
    const created = await createInventoryItem(
      { name: 'Scrap board', category: 'other', unit: 'sheet', minimumStock: 0, isActive: true },
      0,
      ACTOR,
    );

    expect(isLowStock(created)).toBe(false);
    expect(isOutOfStock(created)).toBe(true);
  });

  it('clears the flag once stock comes back in', async () => {
    await recordStockMovement({
      itemId: 'demo-material-2',
      direction: 'in',
      quantity: 20,
      reason: 'Supplier delivery',
      actor: ACTOR,
    });

    expect(isLowStock(await item('demo-material-2'))).toBe(false);
  });
});
