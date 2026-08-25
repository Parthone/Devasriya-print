import {
  deleteApp as deleteAdminApp,
  initializeApp as initializeAdminApp,
} from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const PROJECT_ID = 'demo-devasriya';

process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

vi.stubEnv('VITE_FIREBASE_API_KEY', 'demo-api-key');
vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', `${PROJECT_ID}.firebaseapp.com`);
vi.stubEnv('VITE_FIREBASE_PROJECT_ID', PROJECT_ID);
vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', `${PROJECT_ID}.appspot.com`);
vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', '1234567890');
vi.stubEnv('VITE_FIREBASE_APP_ID', '1:1234567890:web:demoappid');
vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');

const { signInWithEmail, signOutCurrentUser } =
  await import('@/features/auth/services/auth.service');
const { createJob, findJob, newJobId } = await import('@/features/jobs/services/job.service');
const { findJobPricing, saveJobPricing } =
  await import('@/features/jobs/services/job-pricing.service');
const { EMPTY_PICKUP } = await import('@/features/locations/types');
const {
  closeEstimate,
  createEstimate,
  findEstimate,
  listEstimates,
  markEstimateSent,
  recordEstimateDecision,
  updateDraftEstimate,
} = await import('@/features/estimates/services/estimate.service');
const { fromRupees } = await import('@/lib/money');
const { AppError } = await import('@/types/common');

const adminApp = initializeAdminApp({ projectId: PROJECT_ID }, 'estimates-e2e');
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminFirestore(adminApp);

const OWNER = { email: 'owner.m6@devasriya.test', password: 'Owner@12345', uid: '' };
const SALES = { email: 'sales.m6@devasriya.test', password: 'Sales@12345', uid: '' };
const PRODUCTION = { email: 'prod.m6@devasriya.test', password: 'Prod@123456', uid: '' };
const ACCOUNTS = { email: 'acct.m6@devasriya.test', password: 'Acct@123456', uid: '' };

const NOW = new Date('2026-08-24T10:00:00.000Z');
const VALID_UNTIL = new Date('2026-09-08T10:00:00.000Z');
const CUSTOMER = { id: 'customer-m6', name: 'Ravi Kumar', mobile: '9812300011' };

async function seedStaff(
  account: { email: string; password: string; uid: string },
  role: string,
): Promise<void> {
  let user;
  try {
    user = await adminAuth.getUserByEmail(account.email);
    await adminAuth.updateUser(user.uid, { password: account.password });
  } catch {
    user = await adminAuth.createUser({
      email: account.email,
      password: account.password,
      emailVerified: true,
    });
  }
  account.uid = user.uid;

  await adminDb
    .collection('users')
    .doc(user.uid)
    .set({
      name: `${role} user`,
      email: account.email,
      mobile: '9876500011',
      designation: 'manager',
      department: 'management',
      role,
      isActive: true,
      createdAt: NOW,
      createdBy: user.uid,
      updatedAt: NOW,
      updatedBy: user.uid,
    });
}

function actorFor(account: { uid: string }, name: string) {
  return { uid: account.uid, name };
}

async function clearCollection(name: string): Promise<void> {
  const snapshot = await adminDb.collection(name).get();
  await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
}

const LINE = {
  id: 'line-1',
  productId: null,
  productName: 'Flex Print 440 GSM',
  pricingMethod: 'per-square-foot' as const,
  width: 6,
  height: 4,
  measurementUnit: 'foot' as const,
  quantity: 2,
  rate: fromRupees(25),
  rateUnit: 'sq-ft' as const,
  calculatedArea: 24,
  lineAmount: fromRupees(1200),
};

async function pricedJob() {
  const job = await createJob({
    id: newJobId(),
    input: {
      customerId: CUSTOMER.id,
      jobDate: NOW,
      title: 'Flex banner',
      requirementText: 'Outdoor banner',
      priority: 'normal',
      expectedDeliveryDate: null,
      status: 'open',
      ...EMPTY_PICKUP,
    },
    customer: CUSTOMER,
    audio: null,
    actor: actorFor(SALES, 'Sales User'),
  });

  await saveJobPricing(
    job.id,
    {
      lines: [LINE],
      subtotal: fromRupees(1200),
      adjustment: null,
      total: fromRupees(1200),
    },
    actorFor(SALES, 'Sales User'),
  );

  const pricing = await findJobPricing(job.id);
  if (!pricing) throw new Error('pricing was not saved');
  return { job, pricing };
}

beforeAll(async () => {
  await seedStaff(OWNER, 'owner');
  await seedStaff(SALES, 'sales');
  await seedStaff(PRODUCTION, 'production');
  await seedStaff(ACCOUNTS, 'accounts');
});

afterAll(async () => {
  await signOutCurrentUser().catch(() => undefined);
  await deleteAdminApp(adminApp);
});

beforeEach(async () => {
  await signOutCurrentUser().catch(() => undefined);
  await clearCollection('jobs');
  await clearCollection('jobPricing');
  await clearCollection('estimates');
  await clearCollection('counters');
});

describe('quotation numbering', () => {
  it('gives each quotation the next number in the financial year', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const { job, pricing } = await pricedJob();

    const first = await createEstimate({
      job,
      pricing,
      customer: null,
      validUntil: VALID_UNTIL,
      actor: actorFor(SALES, 'Sales User'),
    });
    const second = await createEstimate({
      job,
      pricing,
      customer: null,
      validUntil: VALID_UNTIL,
      actor: actorFor(SALES, 'Sales User'),
    });

    expect(first.estimateNumber).toMatch(/^EST-\d{4}-0001$/);
    expect(second.estimateNumber).toMatch(/^EST-\d{4}-0002$/);

    const directory = await listEstimates();
    expect(directory.estimates).toHaveLength(2);
  });

  it('never hands the same number to two quotations made at once', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const { job, pricing } = await pricedJob();

    const made = await Promise.all(
      Array.from({ length: 4 }, () =>
        createEstimate({
          job,
          pricing,
          customer: null,
          validUntil: VALID_UNTIL,
          actor: actorFor(SALES, 'Sales User'),
        }),
      ),
    );

    const numbers = new Set(made.map((estimate) => estimate.estimateNumber));
    expect(numbers.size).toBe(4);
  });
});

describe('the quotation is a historical record', () => {
  it('does not move when the job pricing is changed afterwards', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const { job, pricing } = await pricedJob();

    const estimate = await createEstimate({
      job,
      pricing,
      customer: null,
      validUntil: VALID_UNTIL,
      actor: actorFor(SALES, 'Sales User'),
    });

    // The job is re-priced at a much higher rate.
    await saveJobPricing(
      job.id,
      {
        lines: [{ ...LINE, rate: fromRupees(90), lineAmount: fromRupees(4320) }],
        subtotal: fromRupees(4320),
        adjustment: null,
        total: fromRupees(4320),
      },
      actorFor(SALES, 'Sales User'),
    );

    const stored = await findEstimate(estimate.id);
    expect(stored?.total).toEqual(fromRupees(1200));
    expect(stored?.lines[0]?.rate).toEqual(fromRupees(25));

    const repriced = await findJobPricing(job.id);
    expect(repriced?.total).toEqual(fromRupees(4320));
  });

  it('keeps the customer and job details as they were quoted', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const { job, pricing } = await pricedJob();

    const estimate = await createEstimate({
      job,
      pricing,
      customer: null,
      validUntil: VALID_UNTIL,
      actor: actorFor(SALES, 'Sales User'),
    });

    await adminDb.collection('jobs').doc(job.id).update({ title: 'Renamed job' });

    const stored = await findEstimate(estimate.id);
    expect(stored?.jobTitle).toBe('Flex banner');
    expect((await findJob(job.id))?.title).toBe('Renamed job');
  });

  it('refuses to rewrite the snapshot from the client, even for the owner', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const { job, pricing } = await pricedJob();
    const estimate = await createEstimate({
      job,
      pricing,
      customer: null,
      validUntil: VALID_UNTIL,
      actor: actorFor(SALES, 'Sales User'),
    });

    await signInWithEmail(OWNER.email, OWNER.password);
    const { doc, updateDoc } = await import('firebase/firestore');
    const { getDb } = await import('@/lib/firebase/client');

    await expect(
      updateDoc(doc(getDb(), 'estimates', estimate.id), {
        total: fromRupees(1),
        updatedBy: OWNER.uid,
      }),
    ).rejects.toThrow();
  });
});

describe('the life of a quotation', () => {
  it('goes draft, sent, approved and then stops', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const { job, pricing } = await pricedJob();
    const draft = await createEstimate({
      job,
      pricing,
      customer: null,
      validUntil: VALID_UNTIL,
      notes: 'Artwork to be confirmed.',
      actor: actorFor(SALES, 'Sales User'),
    });

    expect(draft.status).toBe('draft');

    await markEstimateSent(draft, actorFor(SALES, 'Sales User'));
    const sent = await findEstimate(draft.id);
    expect(sent?.status).toBe('sent');
    expect(sent?.sentAt).toBeInstanceOf(Date);

    await recordEstimateDecision(
      sent as NonNullable<typeof sent>,
      'approved',
      'Confirmed on the phone',
      actorFor(SALES, 'Sales User'),
    );

    const approved = await findEstimate(draft.id);
    expect(approved?.status).toBe('approved');
    expect(approved?.decision?.byId).toBe(SALES.uid);
    expect(approved?.decision?.byName).toBe('Sales User');
    expect(approved?.decision?.note).toBe('Confirmed on the phone');
    expect(approved?.decision?.at).toBeInstanceOf(Date);

    await expect(
      closeEstimate(
        approved as NonNullable<typeof approved>,
        'cancelled',
        actorFor(SALES, 'Sales User'),
      ),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('refuses a wording change once the quotation has gone out', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const { job, pricing } = await pricedJob();
    const draft = await createEstimate({
      job,
      pricing,
      customer: null,
      validUntil: VALID_UNTIL,
      actor: actorFor(SALES, 'Sales User'),
    });

    await updateDraftEstimate({
      estimate: draft,
      validUntil: VALID_UNTIL,
      notes: 'Delivery included.',
      actor: actorFor(SALES, 'Sales User'),
    });
    expect((await findEstimate(draft.id))?.notes).toBe('Delivery included.');

    await markEstimateSent(draft, actorFor(SALES, 'Sales User'));
    const sent = await findEstimate(draft.id);

    await expect(
      updateDraftEstimate({
        estimate: sent as NonNullable<typeof sent>,
        validUntil: VALID_UNTIL,
        notes: 'Too late.',
        actor: actorFor(SALES, 'Sales User'),
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe('who may see and raise quotations', () => {
  it('hides them from production, who must not see what work costs', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const { job, pricing } = await pricedJob();
    await createEstimate({
      job,
      pricing,
      customer: null,
      validUntil: VALID_UNTIL,
      actor: actorFor(SALES, 'Sales User'),
    });

    await signInWithEmail(PRODUCTION.email, PRODUCTION.password);
    await expect(listEstimates()).rejects.toBeInstanceOf(AppError);
  });

  it('lets accounts read a quotation but not raise one', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const { job, pricing } = await pricedJob();
    await createEstimate({
      job,
      pricing,
      customer: null,
      validUntil: VALID_UNTIL,
      actor: actorFor(SALES, 'Sales User'),
    });

    await signInWithEmail(ACCOUNTS.email, ACCOUNTS.password);
    const directory = await listEstimates();
    expect(directory.estimates).toHaveLength(1);

    await expect(
      createEstimate({
        job,
        pricing,
        customer: null,
        validUntil: VALID_UNTIL,
        actor: actorFor(ACCOUNTS, 'Accounts User'),
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
