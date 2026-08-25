import { beforeEach, describe, expect, it, vi } from 'vitest';

import { demoEmployees, demoProductionEvents, resetDemoStore } from '@/features/demo/demo-store';
import {
  assignProductionTask,
  listProductionRuns,
} from '@/features/production/services/production.service';
import {
  byDeadline,
  deadlineStateFor,
  queryRuns,
  workloadFor,
} from '@/features/production/services/production-search';
import type { ProductionRun, ProductionTask } from '@/features/production/types';

/**
 * Operations control: who is doing what, and what is late.
 *
 * Runs against the demo store, which is the same service code with a memory
 * backend - so the assignment rules it exercises are the ones the application
 * actually applies.
 */
vi.mock('@/config/demo', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isDemoMode: () => true,
}));

const NOW = new Date('2026-08-26T10:00:00.000Z');
const ACTOR = { uid: 'demo-owner', name: 'Demo Owner' };

function task(overrides: Partial<ProductionTask> = {}): ProductionTask {
  return {
    id: 't',
    runId: 'r',
    jobId: 'j',
    stageId: null,
    stageName: 'Printing',
    department: 'printing',
    position: 0,
    status: 'ready',
    assignedToId: null,
    assignedToName: null,
    createdAt: NOW,
    createdBy: 'u',
    updatedAt: NOW,
    updatedBy: 'u',
    ...overrides,
  };
}

function run(overrides: Partial<ProductionRun> = {}): ProductionRun {
  return {
    id: 'r',
    jobId: 'j',
    jobNumber: 'JOB-2627-0001',
    jobTitle: 'Shop board',
    customerId: 'c',
    customerName: 'Shreeji',
    status: 'in-progress',
    startedAt: NOW,
    startedById: 'u',
    startedByName: 'U',
    tasks: [task()],
    createdAt: NOW,
    createdBy: 'u',
    updatedAt: NOW,
    updatedBy: 'u',
    ...overrides,
  };
}

const QUERY = {
  term: '',
  status: 'all' as const,
  scope: 'all' as const,
  deadline: 'any' as const,
  department: 'all',
  assigneeId: 'all',
  uid: 'me',
  now: NOW,
};

beforeEach(() => {
  resetDemoStore();
});

describe('deadline state', () => {
  const day = 24 * 60 * 60 * 1000;

  it('reads the delivery date against today', () => {
    expect(
      deadlineStateFor(run({ expectedDeliveryDate: new Date(NOW.getTime() - day) }), NOW),
    ).toBe('overdue');
    expect(deadlineStateFor(run({ expectedDeliveryDate: NOW }), NOW)).toBe('today');
    expect(
      deadlineStateFor(run({ expectedDeliveryDate: new Date(NOW.getTime() + 2 * day) }), NOW),
    ).toBe('soon');
    expect(
      deadlineStateFor(run({ expectedDeliveryDate: new Date(NOW.getTime() + 30 * day) }), NOW),
    ).toBe('any');
    expect(deadlineStateFor(run({ expectedDeliveryDate: null }), NOW)).toBe('any');
  });

  it('never calls finished work late - that is waiting to be collected', () => {
    const done = run({
      expectedDeliveryDate: new Date(NOW.getTime() - 5 * day),
      tasks: [task({ status: 'completed' })],
    });
    expect(deadlineStateFor(done, NOW)).toBe('any');
  });

  it('groups the late and the due, worst first', () => {
    const late = run({ id: 'a', expectedDeliveryDate: new Date(NOW.getTime() - day) });
    const later = run({ id: 'b', expectedDeliveryDate: new Date(NOW.getTime() - 5 * day) });

    expect(byDeadline([late, later], 'overdue', NOW).map((entry) => entry.id)).toEqual(['b', 'a']);
  });
});

describe('whose work it is', () => {
  const mine = run({ id: 'mine', tasks: [task({ assignedToId: 'me', assignedToName: 'Me' })] });
  const theirs = run({
    id: 'theirs',
    tasks: [task({ assignedToId: 'you', assignedToName: 'You' })],
  });
  const nobody = run({ id: 'nobody' });
  const all = [mine, theirs, nobody];

  it('shows only what is assigned to me', () => {
    expect(queryRuns(all, { ...QUERY, scope: 'mine' }).map((entry) => entry.id)).toEqual(['mine']);
  });

  it('shows only what nobody has picked up', () => {
    expect(queryRuns(all, { ...QUERY, scope: 'unassigned' }).map((entry) => entry.id)).toEqual([
      'nobody',
    ]);
  });

  it('ignores finished stages when deciding whose work it is', () => {
    const done = run({
      id: 'done',
      tasks: [task({ status: 'completed', assignedToId: 'me', assignedToName: 'Me' })],
    });
    expect(queryRuns([done], { ...QUERY, scope: 'mine' })).toHaveLength(0);
  });

  it('filters by department and by employee', () => {
    expect(queryRuns(all, { ...QUERY, department: 'printing' })).toHaveLength(3);
    expect(queryRuns(all, { ...QUERY, department: 'installation' })).toHaveLength(0);
    expect(queryRuns(all, { ...QUERY, assigneeId: 'you' }).map((entry) => entry.id)).toEqual([
      'theirs',
    ]);
  });

  it('counts open work per person, and what nobody holds', () => {
    const workload = workloadFor(all);

    expect(workload.unassigned).toBe(1);
    expect(workload.assigned).toEqual([
      { id: 'me', name: 'Me', open: 1 },
      { id: 'you', name: 'You', open: 1 },
    ]);
  });
});

describe('assignment', () => {
  it('refuses an employee who no longer works here', async () => {
    const inactive = demoEmployees().find((employee) => !employee.isActive);
    expect(inactive).toBeDefined();

    const runs = await listProductionRuns();
    const target = runs[0]!.tasks[0]!;

    await expect(
      assignProductionTask(target, { id: inactive!.id, name: inactive!.name }, ACTOR),
    ).rejects.toThrow(/not active/i);
  });

  it('records who the work was taken from, not just who it went to', async () => {
    const runs = await listProductionRuns();
    const target = runs.find((entry) => entry.id === 'demo-run-1')!.tasks[0]!;
    const active = demoEmployees().filter((employee) => employee.isActive);

    await assignProductionTask(target, { id: active[0]!.id, name: active[0]!.name }, ACTOR);
    const reassigned = (await listProductionRuns()).find((entry) => entry.id === 'demo-run-1')!
      .tasks[0]!;
    await assignProductionTask(reassigned, { id: active[1]!.id, name: active[1]!.name }, ACTOR);

    const [latest] = demoProductionEvents('demo-run-1');
    expect(latest?.action).toBe('stage-assigned');
    expect(latest?.reason).toBe(`Reassigned from ${active[0]!.name} to ${active[1]!.name}`);
  });

  it('records an unassignment too', async () => {
    const runs = await listProductionRuns();
    const target = runs.find((entry) => entry.id === 'demo-run-1')!.tasks[1]!;

    await assignProductionTask(target, null, ACTOR);

    const [latest] = demoProductionEvents('demo-run-1');
    expect(latest?.reason).toMatch(/^Unassigned from /);
  });
});
