import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDemoStore } from '@/features/demo/demo-store';
import {
  advanceProductionTask,
  findRunForJob,
  listProductionRuns,
  startProductionRun,
} from '@/features/production/services/production.service';
import {
  bucketFor,
  countByBucket,
  filterRuns,
} from '@/features/production/services/production-search';
import {
  PRODUCTION_STATUSES,
  canStart,
  canTransition,
  currentTask,
  isSettled,
  requiresReason,
  runProgress,
  type ProductionRun,
} from '@/features/production/types';
import { findJob } from '@/features/jobs/services/job.service';

/**
 * The shop floor rules.
 *
 * These run against the demo store, which is the same service code with a
 * memory backend, so the transition table, the sequential flow and the reason
 * requirement are all exercised for real.
 */
vi.mock('@/config/demo', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isDemoMode: () => true,
}));

const ACTOR = { uid: 'demo-production', name: 'Rakesh Meena' };
const JOB = 'demo-job-2';

async function run(): Promise<ProductionRun> {
  const found = await findRunForJob(JOB);
  if (!found) throw new Error('no run');
  return found;
}

beforeEach(() => {
  resetDemoStore();
});

describe('the transition table', () => {
  it('lets a waiting stage be unlocked or passed over, and nothing else', () => {
    expect(canTransition('pending', 'ready')).toBe(true);
    expect(canTransition('pending', 'skipped')).toBe(true);
    expect(canTransition('pending', 'in-progress')).toBe(false);
    expect(canTransition('pending', 'completed')).toBe(false);
  });

  it('never lets a stage be completed without being started', () => {
    expect(canTransition('ready', 'completed')).toBe(false);
    expect(canTransition('in-progress', 'completed')).toBe(true);
  });

  it('treats a finished or skipped stage as done for good', () => {
    for (const status of ['completed', 'skipped'] as const) {
      expect(isSettled(status)).toBe(true);
      for (const next of PRODUCTION_STATUSES) {
        expect(canTransition(status, next)).toBe(false);
      }
    }
  });

  it('asks why only for the two moves that need explaining', () => {
    expect(requiresReason('on-hold')).toBe(true);
    expect(requiresReason('skipped')).toBe(true);
    expect(requiresReason('in-progress')).toBe(false);
    expect(requiresReason('completed')).toBe(false);
  });
});

describe('starting a run', () => {
  it('creates one task per stage, with only the first ready', async () => {
    const created = await startProductionRun(JOB, ACTOR);

    expect(created.tasks).toHaveLength(4);
    expect(created.tasks[0]?.status).toBe('ready');
    expect(created.tasks.slice(1).every((task) => task.status === 'pending')).toBe(true);
    expect(created.tasks.map((task) => task.position)).toEqual([0, 1, 2, 3]);
  });

  it('moves the job to in-progress', async () => {
    await startProductionRun(JOB, ACTOR);
    expect((await findJob(JOB))?.status).toBe('in-progress');
  });

  it('refuses a second run for the same job', async () => {
    await startProductionRun(JOB, ACTOR);
    await expect(startProductionRun(JOB, ACTOR)).rejects.toThrow(/already in production/i);
  });
});

describe('work moves in order', () => {
  it('unlocks the next stage only when the one in front is finished', async () => {
    const created = await startProductionRun(JOB, ACTOR);
    const [first, second] = created.tasks;

    expect(canStart(created, first!)).toBe(true);
    expect(canStart(created, second!)).toBe(false);

    await advanceProductionTask({ task: first!, toStatus: 'in-progress', actor: ACTOR });
    await advanceProductionTask({ task: first!, toStatus: 'completed', actor: ACTOR });

    const after = await run();
    expect(after.tasks[0]?.status).toBe('completed');
    expect(after.tasks[1]?.status).toBe('ready');
    expect(after.tasks[2]?.status).toBe('pending');
    expect(canStart(after, after.tasks[1]!)).toBe(true);
  });

  it('refuses to start a stage that is still waiting its turn', async () => {
    const created = await startProductionRun(JOB, ACTOR);

    await expect(
      advanceProductionTask({ task: created.tasks[1]!, toStatus: 'in-progress', actor: ACTOR }),
    ).rejects.toThrow(/cannot become in progress/i);
  });

  it('hands the next stage over when one is skipped rather than done', async () => {
    const created = await startProductionRun(JOB, ACTOR);
    await advanceProductionTask({
      task: created.tasks[0]!,
      toStatus: 'skipped',
      reason: 'Artwork already checked by the customer.',
      actor: ACTOR,
    });

    const after = await run();
    expect(after.tasks[0]?.status).toBe('skipped');
    expect(after.tasks[1]?.status).toBe('ready');
  });
});

describe('holding and skipping always say why', () => {
  it('refuses a hold with no reason', async () => {
    const created = await startProductionRun(JOB, ACTOR);
    const first = created.tasks[0]!;
    await advanceProductionTask({ task: first, toStatus: 'in-progress', actor: ACTOR });
    const started = (await run()).tasks[0]!;

    await expect(
      advanceProductionTask({ task: started, toStatus: 'on-hold', reason: '  ', actor: ACTOR }),
    ).rejects.toThrow(/why this stage is being put on hold/i);
  });

  it('refuses a skip with no reason', async () => {
    const created = await startProductionRun(JOB, ACTOR);

    await expect(
      advanceProductionTask({ task: created.tasks[0]!, toStatus: 'skipped', actor: ACTOR }),
    ).rejects.toThrow(/why this stage is being skipped/i);
  });

  it('keeps the reason on the stage, and lets it be resumed', async () => {
    const created = await startProductionRun(JOB, ACTOR);
    await advanceProductionTask({ task: created.tasks[0]!, toStatus: 'in-progress', actor: ACTOR });

    const started = (await run()).tasks[0]!;
    await advanceProductionTask({
      task: started,
      toStatus: 'on-hold',
      reason: 'Waiting for the vinyl roll.',
      actor: ACTOR,
    });

    const held = (await run()).tasks[0]!;
    expect(held.status).toBe('on-hold');
    expect(held.holdReason).toBe('Waiting for the vinyl roll.');

    await advanceProductionTask({ task: held, toStatus: 'in-progress', actor: ACTOR });
    expect((await run()).tasks[0]?.status).toBe('in-progress');
  });
});

describe('the job status follows the shop floor', () => {
  it('goes on hold when any stage stops, and back when it resumes', async () => {
    const created = await startProductionRun(JOB, ACTOR);
    await advanceProductionTask({ task: created.tasks[0]!, toStatus: 'in-progress', actor: ACTOR });

    const started = (await run()).tasks[0]!;
    await advanceProductionTask({
      task: started,
      toStatus: 'on-hold',
      reason: 'Machine down.',
      actor: ACTOR,
    });
    expect((await findJob(JOB))?.status).toBe('on-hold');

    await advanceProductionTask({
      task: (await run()).tasks[0]!,
      toStatus: 'in-progress',
      actor: ACTOR,
    });
    expect((await findJob(JOB))?.status).toBe('in-progress');
  });

  it('becomes ready once every stage is settled, and delivery stays separate', async () => {
    let created = await startProductionRun(JOB, ACTOR);

    for (let index = 0; index < created.tasks.length; index += 1) {
      const task = (await run()).tasks[index]!;
      await advanceProductionTask({ task, toStatus: 'in-progress', actor: ACTOR });
      await advanceProductionTask({
        task: (await run()).tasks[index]!,
        toStatus: 'completed',
        actor: ACTOR,
      });
    }

    created = await run();
    expect(created.status).toBe('completed');
    expect(runProgress(created)).toEqual({ done: 4, total: 4, percent: 100 });

    // Ready for collection - handing it over is a separate decision.
    expect((await findJob(JOB))?.status).toBe('ready');
  });
});

describe('the design snapshot', () => {
  it('records the approved version the run was started against', async () => {
    // demo-job-1 is already in production, started against the version the
    // customer approved. That snapshot is the record of what was printed.
    const existing = await findRunForJob('demo-job-1');

    expect(existing?.approvedDesignId).toBe('demo-job-1-v2');
    expect(existing?.approvedDesignVersion).toBe(2);
  });

  it('still starts a job that has no approved design, and says so', async () => {
    const created = await startProductionRun(JOB, ACTOR);

    expect(created.approvedDesignId).toBeNull();
    expect(created.approvedDesignVersion).toBeNull();
  });
});

describe('the board buckets', () => {
  it('describes a run by what needs doing next, not by how far along it is', () => {
    const make = (statuses: string[]): ProductionRun =>
      ({
        id: 'r',
        tasks: statuses.map((status, index) => ({ status, position: index })),
      }) as unknown as ProductionRun;

    expect(bucketFor(make(['ready', 'pending']))).toBe('ready');
    expect(bucketFor(make(['in-progress', 'pending']))).toBe('in-progress');
    // Three of four done still reads as "on hold": that is the one a person
    // has to act on.
    expect(bucketFor(make(['completed', 'completed', 'completed', 'on-hold']))).toBe('on-hold');
    expect(bucketFor(make(['completed', 'skipped']))).toBe('completed');
  });

  it('counts every bucket and filters to one', async () => {
    // Two runs are already on the board: one working, one stopped. A third
    // starts fresh, so all three buckets are represented at once.
    const started = await startProductionRun(JOB, ACTOR);
    const runs = await listProductionRuns();

    const counts = countByBucket(runs);
    expect(counts.all).toBe(3);
    expect(counts.ready).toBe(1);
    expect(counts['in-progress']).toBe(1);
    expect(counts['on-hold']).toBe(1);

    expect(filterRuns(runs, '', 'ready').map((entry) => entry.id)).toEqual([started.id]);
    expect(filterRuns(runs, '', 'completed')).toHaveLength(0);
  });

  it('searches by job number, customer or the stage in hand', async () => {
    const created = await startProductionRun(JOB, ACTOR);

    expect(filterRuns([created], created.jobNumber, 'all')).toHaveLength(1);
    expect(filterRuns([created], created.customerName.slice(0, 5), 'all')).toHaveLength(1);
    expect(filterRuns([created], 'pre-press', 'all')).toHaveLength(1);
    expect(filterRuns([created], 'nothing here', 'all')).toHaveLength(0);
  });

  it('points at the stage the shop floor should pick up', async () => {
    const created = await startProductionRun(JOB, ACTOR);
    expect(currentTask(created)?.position).toBe(0);

    await advanceProductionTask({ task: created.tasks[0]!, toStatus: 'in-progress', actor: ACTOR });
    await advanceProductionTask({
      task: (await run()).tasks[0]!,
      toStatus: 'completed',
      actor: ACTOR,
    });

    expect(currentTask(await run())?.position).toBe(1);
  });
});
