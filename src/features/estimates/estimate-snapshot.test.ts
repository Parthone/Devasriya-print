import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDemoStore, setDemoJobPricing } from '@/features/demo/demo-store';
import {
  closeEstimate,
  createEstimate,
  findEstimate,
  markEstimateSent,
  recordEstimateDecision,
  updateDraftEstimate,
} from '@/features/estimates/services/estimate.service';
import {
  canTransition,
  ESTIMATE_STATUSES,
  isEditable,
  isFinished,
  type Estimate,
} from '@/features/estimates/types';
import type { JobPricingDocument } from '@/features/jobs/pricing-types';
import type { Job } from '@/features/jobs/types';
import { fromRupees } from '@/lib/money';
import type { PricingLine } from '@/lib/pricing';

/**
 * A quotation is a historical record.
 *
 * These run against the demo store, which is the same service code path with a
 * memory backend, so they exercise the real snapshot and transition logic.
 */
vi.mock('@/config/demo', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isDemoMode: () => true,
}));

const NOW = new Date('2026-08-24T10:00:00.000Z');
const VALID_UNTIL = new Date('2026-09-08T10:00:00.000Z');
const ACTOR = { uid: 'uid-owner', name: 'Demo Owner' };

function line(overrides: Partial<PricingLine> = {}): PricingLine {
  return {
    id: 'line-1',
    productId: null,
    productName: 'Flex print',
    pricingMethod: 'per-square-foot',
    width: 6,
    height: 4,
    measurementUnit: 'foot',
    quantity: 1,
    rate: fromRupees(25),
    rateUnit: 'sq-ft',
    calculatedArea: 24,
    lineAmount: fromRupees(600),
    ...overrides,
  } as PricingLine;
}

function job(): Job {
  return {
    id: 'job-x',
    jobNumber: 'JOB-2627-0009',
    customerId: 'customer-1',
    customerName: 'Ravi Kumar',
    customerMobile: '9812300011',
    title: 'Shop board',
  } as Job;
}

function pricing(overrides: Partial<JobPricingDocument> = {}): JobPricingDocument {
  return {
    id: 'job-x',
    jobId: 'job-x',
    lines: [line()],
    subtotal: fromRupees(600),
    adjustment: null,
    total: fromRupees(600),
    createdAt: NOW,
    createdBy: ACTOR.uid,
    updatedAt: NOW,
    updatedBy: ACTOR.uid,
    ...overrides,
  };
}

async function makeDraft(): Promise<Estimate> {
  return createEstimate({
    job: job(),
    pricing: pricing(),
    customer: null,
    validUntil: VALID_UNTIL,
    actor: ACTOR,
  });
}

beforeEach(() => {
  resetDemoStore();
});

describe('the transition table', () => {
  it('lets a draft go out or be withdrawn, and nothing else', () => {
    expect(canTransition('draft', 'sent')).toBe(true);
    expect(canTransition('draft', 'cancelled')).toBe(true);
    expect(canTransition('draft', 'approved')).toBe(false);
    expect(canTransition('draft', 'rejected')).toBe(false);
    expect(canTransition('draft', 'expired')).toBe(false);
  });

  it('never lets a sent quotation go back to draft', () => {
    expect(canTransition('sent', 'draft')).toBe(false);
  });

  it('treats a decided, expired or cancelled quotation as finished', () => {
    for (const status of ['approved', 'rejected', 'expired', 'cancelled'] as const) {
      expect(isFinished(status)).toBe(true);
      for (const next of ESTIMATE_STATUSES) {
        expect(canTransition(status, next)).toBe(false);
      }
    }
  });

  it('only calls a draft editable', () => {
    expect(isEditable('draft')).toBe(true);
    for (const status of ESTIMATE_STATUSES.filter((value) => value !== 'draft')) {
      expect(isEditable(status)).toBe(false);
    }
  });
});

describe('creating a quotation from a priced job', () => {
  it('copies the priced lines and totals exactly', async () => {
    const source = pricing();
    const estimate = await createEstimate({
      job: job(),
      pricing: source,
      customer: null,
      validUntil: VALID_UNTIL,
      actor: ACTOR,
    });

    expect(estimate.lines).toEqual(source.lines);
    expect(estimate.subtotal).toEqual(source.subtotal);
    expect(estimate.total).toEqual(source.total);
    expect(estimate.status).toBe('draft');
    expect(estimate.decision).toBeNull();
    expect(estimate.jobNumber).toBe('JOB-2627-0009');
  });

  it('numbers quotations in the Indian financial year sequence', async () => {
    const first = await makeDraft();
    const second = await makeDraft();

    expect(first.estimateNumber).toMatch(/^EST-\d{4}-\d{4}$/);
    expect(Number(second.estimateNumber.slice(-4))).toBe(
      Number(first.estimateNumber.slice(-4)) + 1,
    );
  });

  it('refuses a job that has not been priced', async () => {
    await expect(
      createEstimate({
        job: job(),
        pricing: pricing({ lines: [], subtotal: fromRupees(0), total: fromRupees(0) }),
        customer: null,
        validUntil: VALID_UNTIL,
        actor: ACTOR,
      }),
    ).rejects.toThrow(/Price the job/i);
  });

  it('is untouched when the job pricing is changed afterwards', async () => {
    const estimate = await makeDraft();

    setDemoJobPricing(
      'job-x',
      {
        lines: [line({ rate: fromRupees(90), lineAmount: fromRupees(2160) })],
        subtotal: fromRupees(2160),
        adjustment: null,
        total: fromRupees(2160),
      },
      ACTOR.uid,
    );

    const stored = await findEstimate(estimate.id);
    expect(stored?.total).toEqual(fromRupees(600));
    expect(stored?.lines[0]?.rate).toEqual(fromRupees(25));
  });
});

describe('editing a draft', () => {
  it('changes the wording and validity, never the money', async () => {
    const estimate = await makeDraft();

    await updateDraftEstimate({
      estimate,
      validUntil: new Date('2026-09-20T10:00:00.000Z'),
      notes: 'Delivery included.',
      actor: ACTOR,
    });

    const stored = await findEstimate(estimate.id);
    expect(stored?.notes).toBe('Delivery included.');
    expect(stored?.validUntil.toISOString()).toBe('2026-09-20T10:00:00.000Z');
    expect(stored?.total).toEqual(fromRupees(600));
    expect(stored?.lines).toEqual(estimate.lines);
  });

  it('refuses once the quotation has been sent', async () => {
    const estimate = await makeDraft();
    await markEstimateSent(estimate, ACTOR);
    const sent = await findEstimate(estimate.id);

    await expect(
      updateDraftEstimate({
        estimate: sent as Estimate,
        validUntil: VALID_UNTIL,
        notes: 'Too late.',
        actor: ACTOR,
      }),
    ).rejects.toThrow(/Create a new one from the job instead/i);
  });
});

describe('recording what happened next', () => {
  it('keeps who recorded the approval, when, and what the customer said', async () => {
    const draft = await makeDraft();
    await markEstimateSent(draft, ACTOR);
    const sent = (await findEstimate(draft.id)) as Estimate;

    await recordEstimateDecision(sent, 'approved', '  Go ahead  ', ACTOR);

    const stored = await findEstimate(draft.id);
    expect(stored?.status).toBe('approved');
    expect(stored?.decision?.outcome).toBe('approved');
    expect(stored?.decision?.byId).toBe(ACTOR.uid);
    expect(stored?.decision?.byName).toBe(ACTOR.name);
    expect(stored?.decision?.note).toBe('Go ahead');
    expect(stored?.decision?.at).toBeInstanceOf(Date);
  });

  it('refuses to approve something that was never sent', async () => {
    const draft = await makeDraft();

    await expect(recordEstimateDecision(draft, 'approved', undefined, ACTOR)).rejects.toThrow(
      /cannot become approved/i,
    );
  });

  it('refuses to change a decision once it is recorded', async () => {
    const draft = await makeDraft();
    await markEstimateSent(draft, ACTOR);
    const sent = (await findEstimate(draft.id)) as Estimate;
    await recordEstimateDecision(sent, 'rejected', 'Too expensive', ACTOR);
    const rejected = (await findEstimate(draft.id)) as Estimate;

    await expect(
      recordEstimateDecision(rejected, 'approved', 'Changed their mind', ACTOR),
    ).rejects.toThrow(/cannot become approved/i);
    await expect(closeEstimate(rejected, 'cancelled', ACTOR)).rejects.toThrow(
      /cannot become cancelled/i,
    );
  });

  it('cancels a draft without deleting anything', async () => {
    const draft = await makeDraft();
    await closeEstimate(draft, 'cancelled', ACTOR);

    const stored = await findEstimate(draft.id);
    expect(stored).not.toBeNull();
    expect(stored?.status).toBe('cancelled');
    expect(stored?.cancelledAt).toBeInstanceOf(Date);
  });

  it('refuses to send a cancelled quotation', async () => {
    const draft = await makeDraft();
    await closeEstimate(draft, 'cancelled', ACTOR);
    const cancelled = (await findEstimate(draft.id)) as Estimate;

    await expect(markEstimateSent(cancelled, ACTOR)).rejects.toThrow(/cannot become sent/i);
  });
});
