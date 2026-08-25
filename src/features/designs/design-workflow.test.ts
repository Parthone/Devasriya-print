import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDemoStore } from '@/features/demo/demo-store';
import {
  listDesignsForJob,
  recordDesignDecision,
  submitDesignForReview,
  uploadDesign,
} from '@/features/designs/services/design.service';
import {
  approvedDesign,
  canTransition,
  currentDesign,
  designIdFor,
  DESIGN_STATUSES,
  nextVersionNumber,
  type Design,
} from '@/features/designs/types';
import type { Job } from '@/features/jobs/types';
import { checkDesignFile } from '@/services/storage/design-storage.service';
import { MAX_DESIGN_BYTES } from '@/types/attachments';

/**
 * The design conversation, end to end.
 *
 * These run against the demo store, which is the same service code with a
 * memory backend, so the version numbering, the transition guard and the
 * "nothing is ever overwritten" promise are all exercised for real.
 */
vi.mock('@/config/demo', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isDemoMode: () => true,
}));

const DESIGNER = { uid: 'uid-designer', name: 'Kavita Nair' };
const CUSTOMER = { uid: 'uid-customer', name: 'Shreeji Traders' };

function job(): Job {
  return {
    id: 'job-w',
    jobNumber: 'JOB-2627-0021',
    customerId: 'customer-1',
    customerName: 'Shreeji Traders',
    title: 'Shop board',
  } as Job;
}

function pngFile(sizeBytes = 2048): Blob & { name?: string } {
  const blob = new Blob([new Uint8Array(sizeBytes)], { type: 'image/png' });
  return Object.assign(blob, { name: 'artwork.png' });
}

async function upload(existing: readonly Design[], submitNow = true): Promise<Design> {
  return uploadDesign({
    job: job(),
    existing,
    file: pngFile(),
    mimeType: 'image/png',
    originalFileName: 'artwork.png',
    designerNote: 'First pass',
    submitNow,
    actor: DESIGNER,
  });
}

beforeEach(() => {
  resetDemoStore();
});

describe('the transition table', () => {
  it('lets a draft go out or be replaced, and nothing else', () => {
    expect(canTransition('draft', 'submitted-for-review')).toBe(true);
    expect(canTransition('draft', 'superseded')).toBe(true);
    expect(canTransition('draft', 'approved')).toBe(false);
    expect(canTransition('draft', 'rejected')).toBe(false);
  });

  it('only answers a version that is actually with the customer', () => {
    for (const outcome of ['approved', 'rejected', 'changes-requested'] as const) {
      expect(canTransition('submitted-for-review', outcome)).toBe(true);
      expect(canTransition('draft', outcome)).toBe(false);
      expect(canTransition('approved', outcome)).toBe(false);
      expect(canTransition('changes-requested', outcome)).toBe(false);
    }
  });

  it('never reopens an answered version except to mark it replaced', () => {
    for (const status of ['approved', 'rejected', 'changes-requested'] as const) {
      for (const next of DESIGN_STATUSES) {
        expect(canTransition(status, next)).toBe(next === 'superseded');
      }
    }
  });

  it('treats a superseded version as finished for good', () => {
    for (const next of DESIGN_STATUSES) {
      expect(canTransition('superseded', next)).toBe(false);
    }
  });
});

describe('checking a file before it is uploaded', () => {
  it('accepts the review formats and refuses source files', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']) {
      expect(checkDesignFile({ type, size: 1024 }).ok).toBe(true);
    }

    const refused = checkDesignFile({ type: 'application/postscript', size: 1024 });
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.message).toMatch(/JPG, PNG, WEBP, PDF/);
  });

  it('refuses a file over the size limit, and an empty one', () => {
    const tooBig = checkDesignFile({ type: 'image/png', size: MAX_DESIGN_BYTES + 1 });
    expect(tooBig.ok).toBe(false);
    expect(tooBig.ok === false && tooBig.message).toMatch(/limit is 25\.0 MB/);

    expect(checkDesignFile({ type: 'image/png', size: 0 }).ok).toBe(false);
    expect(checkDesignFile({ type: 'image/png', size: MAX_DESIGN_BYTES }).ok).toBe(true);
  });
});

describe('uploading versions', () => {
  it('numbers the first design version 1 and gives it its own id', async () => {
    const first = await upload([]);

    expect(first.version).toBe(1);
    expect(first.id).toBe(designIdFor('job-w', 1));
    expect(first.status).toBe('submitted-for-review');
    expect(first.decision).toBeNull();
    expect(first.file.storagePath).toBe(`job-w/${first.file.id}.png`);
  });

  it('counts up and writes each version to a path of its own', async () => {
    const first = await upload([]);
    const second = await upload([first]);
    const third = await upload([first, second]);

    expect([first.version, second.version, third.version]).toEqual([1, 2, 3]);
    expect(
      new Set([first.file.storagePath, second.file.storagePath, third.file.storagePath]).size,
    ).toBe(3);
    expect(nextVersionNumber([first, second, third])).toBe(4);
  });

  it('keeps a draft as a draft until it is sent', async () => {
    const draft = await upload([], false);
    expect(draft.status).toBe('draft');
    expect(draft.submittedAt).toBeNull();

    await submitDesignForReview(draft, DESIGNER);
    const stored = (await listDesignsForJob('job-w')).find((item) => item.id === draft.id);
    expect(stored?.status).toBe('submitted-for-review');
    expect(stored?.submittedAt).toBeInstanceOf(Date);
  });

  it('refuses to send a version that has already gone out', async () => {
    const sent = await upload([]);
    await expect(submitDesignForReview(sent, DESIGNER)).rejects.toThrow(/cannot become/i);
  });
});

describe('what the customer says', () => {
  it('keeps a comment on an approval, not only on a rejection', async () => {
    const design = await upload([]);

    await recordDesignDecision({
      design,
      outcome: 'approved',
      comment: '  Approved, but please make the font size bigger.  ',
      source: 'customer',
      actor: CUSTOMER,
      language: 'hi',
    });

    const stored = (await listDesignsForJob('job-w'))[0];
    expect(stored?.status).toBe('approved');
    expect(stored?.decision?.comment).toBe('Approved, but please make the font size bigger.');
    expect(stored?.decision?.source).toBe('customer');
    expect(stored?.decision?.byId).toBe(CUSTOMER.uid);
    expect(stored?.decision?.language).toBe('hi');
  });

  it('insists on a reason for a rejection or a change request', async () => {
    const design = await upload([]);

    await expect(
      recordDesignDecision({
        design,
        outcome: 'rejected',
        comment: '   ',
        source: 'customer',
        actor: CUSTOMER,
      }),
    ).rejects.toThrow(/why it was rejected/i);
  });

  it('tells a staff-recorded answer apart from one the customer typed', async () => {
    const design = await upload([]);

    await recordDesignDecision({
      design,
      outcome: 'changes-requested',
      comment: 'Rang gehra karein',
      source: 'staff',
      actor: { uid: 'uid-sales', name: 'Priya Sharma' },
    });

    const stored = (await listDesignsForJob('job-w'))[0];
    expect(stored?.decision?.source).toBe('staff');
    expect(stored?.decision?.byName).toBe('Priya Sharma');
  });

  it('will not answer a version twice', async () => {
    const design = await upload([]);
    await recordDesignDecision({
      design,
      outcome: 'rejected',
      comment: 'Not what we wanted',
      source: 'customer',
      actor: CUSTOMER,
    });
    const answered = (await listDesignsForJob('job-w'))[0] as Design;

    await expect(
      recordDesignDecision({
        design: answered,
        outcome: 'approved',
        comment: 'Changed our mind',
        source: 'customer',
        actor: CUSTOMER,
      }),
    ).rejects.toThrow(/cannot become approved/i);
  });
});

describe('revisions never overwrite history', () => {
  it('keeps a change request and its comment after the new version arrives', async () => {
    const first = await upload([]);
    await recordDesignDecision({
      design: first,
      outcome: 'changes-requested',
      comment: 'Make the discount bigger.',
      source: 'customer',
      actor: CUSTOMER,
    });

    const afterDecision = await listDesignsForJob('job-w');
    const second = await upload(afterDecision);

    const versions = await listDesignsForJob('job-w');
    const v1 = versions.find((design) => design.version === 1);
    const v2 = versions.find((design) => design.version === 2);

    expect(versions).toHaveLength(2);
    expect(v1?.status).toBe('changes-requested');
    expect(v1?.decision?.comment).toBe('Make the discount bigger.');
    expect(v1?.file.storagePath).not.toBe(v2?.file.storagePath);
    expect(currentDesign(versions)?.id).toBe(second.id);
  });

  it('replaces a version that was still with the customer, without answering it', async () => {
    const first = await upload([]);
    await upload([first]);

    const versions = await listDesignsForJob('job-w');
    const v1 = versions.find((design) => design.version === 1);

    expect(v1?.status).toBe('superseded');
    expect(v1?.supersededAt).toBeInstanceOf(Date);
    expect(v1?.decision).toBeNull();
  });

  it('leaves an approved version alone when a further revision is uploaded', async () => {
    const first = await upload([]);
    await recordDesignDecision({
      design: first,
      outcome: 'approved',
      comment: 'Looks good',
      source: 'customer',
      actor: CUSTOMER,
    });

    await upload(await listDesignsForJob('job-w'));

    const versions = await listDesignsForJob('job-w');
    const v1 = versions.find((design) => design.version === 1);
    expect(v1?.status).toBe('approved');
    expect(v1?.decision?.comment).toBe('Looks good');
  });
});

describe('the approved design for production', () => {
  it('is the version the customer said yes to', async () => {
    const first = await upload([]);
    await recordDesignDecision({
      design: first,
      outcome: 'changes-requested',
      comment: 'Bigger logo',
      source: 'customer',
      actor: CUSTOMER,
    });
    const second = await upload(await listDesignsForJob('job-w'));
    await recordDesignDecision({
      design: second,
      outcome: 'approved',
      comment: 'Perfect',
      source: 'customer',
      actor: CUSTOMER,
    });

    const versions = await listDesignsForJob('job-w');
    const approved = approvedDesign(versions);

    expect(approved?.version).toBe(2);
    expect(approved?.id).toBe(designIdFor('job-w', 2));
  });

  it('is never two versions at once', async () => {
    const first = await upload([]);
    await recordDesignDecision({
      design: first,
      outcome: 'approved',
      comment: 'Fine',
      source: 'customer',
      actor: CUSTOMER,
    });

    const afterFirst = await listDesignsForJob('job-w');
    const second = await upload(afterFirst);
    await recordDesignDecision({
      design: second,
      outcome: 'approved',
      comment: 'Use this one',
      source: 'customer',
      actor: CUSTOMER,
      previouslyApproved: approvedDesign(afterFirst),
    });

    const versions = await listDesignsForJob('job-w');
    expect(versions.filter((design) => design.status === 'approved')).toHaveLength(1);
    expect(approvedDesign(versions)?.version).toBe(2);

    // The replaced approval keeps its comment; only its status moved.
    const v1 = versions.find((design) => design.version === 1);
    expect(v1?.status).toBe('superseded');
    expect(v1?.decision?.comment).toBe('Fine');
  });
});
