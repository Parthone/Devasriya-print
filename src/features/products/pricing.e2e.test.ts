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
const { createJob, findJob, newJobId, updateJobPricing } =
  await import('@/features/jobs/services/job.service');
const { EMPTY_PICKUP } = await import('@/features/locations/types');
const { createProduct, listProducts, updateProduct } =
  await import('@/features/products/services/product.service');
const { calculateLine, summarisePricing } = await import('@/lib/pricing');
const { fromRupees, toRupees } = await import('@/lib/money');
const { AppError } = await import('@/types/common');

const adminApp = initializeAdminApp({ projectId: PROJECT_ID }, 'pricing-e2e');
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminFirestore(adminApp);

const OWNER = { email: 'owner.m5@devasriya.test', password: 'Owner@12345', uid: '' };
const SALES = { email: 'sales.m5@devasriya.test', password: 'Sales@12345', uid: '' };
const PRODUCTION = { email: 'prod.m5@devasriya.test', password: 'Prod@123456', uid: '' };

const NOW = new Date('2026-08-24T10:00:00.000Z');
const CUSTOMER = { id: 'customer-m5', name: 'Ravi Kumar', mobile: '9812300011' };

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

async function createTestJob() {
  return createJob({
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
}

beforeAll(async () => {
  await seedStaff(OWNER, 'owner');
  await seedStaff(SALES, 'sales');
  await seedStaff(PRODUCTION, 'production');
});

afterAll(async () => {
  await signOutCurrentUser().catch(() => undefined);
  await deleteAdminApp(adminApp);
});

beforeEach(async () => {
  await signOutCurrentUser().catch(() => undefined);
  await clearCollection('jobs');
  await clearCollection('products');
  await clearCollection('counters');
});

describe('the rate card against the emulators', () => {
  it('lets the owner add an item and everybody read it', async () => {
    await signInWithEmail(OWNER.email, OWNER.password);

    const product = await createProduct(
      {
        name: 'Flex Print 440 GSM',
        category: 'printing',
        pricingMethod: 'per-square-foot',
        defaultRate: fromRupees(25),
        defaultRateUnit: 'sq-ft',
        isActive: true,
      },
      OWNER.uid,
    );

    expect(product.defaultRate.paise).toBe(2500);

    await signInWithEmail(PRODUCTION.email, PRODUCTION.password);
    const visible = await listProducts();
    expect(visible.map((entry) => entry.id)).toContain(product.id);
  });

  it('stops anybody but the owner changing a rate', async () => {
    await signInWithEmail(OWNER.email, OWNER.password);
    const product = await createProduct(
      {
        name: 'Vinyl',
        category: 'printing',
        pricingMethod: 'per-square-foot',
        defaultRate: fromRupees(65),
        defaultRateUnit: 'sq-ft',
        isActive: true,
      },
      OWNER.uid,
    );

    await signInWithEmail(SALES.email, SALES.password);
    await expect(
      updateProduct(
        product.id,
        {
          name: 'Vinyl',
          category: 'printing',
          pricingMethod: 'per-square-foot',
          defaultRate: fromRupees(10),
          defaultRateUnit: 'sq-ft',
          isActive: true,
        },
        SALES.uid,
      ),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe('pricing a job against the emulators', () => {
  async function priceJob(jobId: string, ratePerSqFt: number, actorUid: string) {
    const line = calculateLine({
      id: 'line-1',
      productId: 'product-1',
      productName: 'Flex Print 440 GSM',
      pricingMethod: 'per-square-foot',
      measurementUnit: 'foot',
      width: 6,
      height: 4,
      quantity: 2,
      rate: fromRupees(ratePerSqFt),
    });
    if (!line.ok) throw new Error('expected a priced line');

    const summary = summarisePricing([line.line]);
    if (!summary.ok) throw new Error('expected a summary');

    await updateJobPricing(jobId, summary.pricing, actorFor({ uid: actorUid }, 'Actor'));
    return summary.pricing;
  }

  it('stores lines and totals together, exactly as calculated', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const job = await createTestJob();

    const pricing = await priceJob(job.id, 25, SALES.uid);
    expect(toRupees(pricing.total)).toBe(1200);

    const stored = await findJob(job.id);
    expect(stored?.pricing?.lines).toHaveLength(1);
    expect(stored?.pricing?.subtotal.paise).toBe(120_000);
    expect(stored?.pricing?.total.paise).toBe(120_000);
    expect(stored?.pricing?.lines[0]?.lineAmount.paise).toBe(120_000);

    const raw = await adminDb.collection('jobs').doc(job.id).get();
    expect(raw.data()?.pricing?.total).toEqual({ paise: 120_000, currency: 'INR' });
  });

  it('keeps the measurement snapshot needed to reproduce the calculation', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const job = await createTestJob();
    await priceJob(job.id, 25, SALES.uid);

    const stored = await findJob(job.id);
    const line = stored?.pricing?.lines[0];
    expect(line).toMatchObject({
      productId: 'product-1',
      productName: 'Flex Print 440 GSM',
      pricingMethod: 'per-square-foot',
      measurementUnit: 'foot',
      width: 6,
      height: 4,
      quantity: 2,
      rateUnit: 'sq-ft',
      calculatedArea: 24,
    });
    expect(line?.rate.paise).toBe(2500);
  });

  it('leaves a priced job alone when the rate card changes afterwards', async () => {
    await signInWithEmail(OWNER.email, OWNER.password);
    const product = await createProduct(
      {
        name: 'Flex Print 440 GSM',
        category: 'printing',
        pricingMethod: 'per-square-foot',
        defaultRate: fromRupees(25),
        defaultRateUnit: 'sq-ft',
        isActive: true,
      },
      OWNER.uid,
    );

    await signInWithEmail(SALES.email, SALES.password);
    const job = await createTestJob();
    await priceJob(job.id, 25, SALES.uid);

    // The rate card doubles the next day.
    await signInWithEmail(OWNER.email, OWNER.password);
    await updateProduct(
      product.id,
      {
        name: 'Flex Print 440 GSM',
        category: 'printing',
        pricingMethod: 'per-square-foot',
        defaultRate: fromRupees(50),
        defaultRateUnit: 'sq-ft',
        isActive: true,
      },
      OWNER.uid,
    );

    const stored = await findJob(job.id);
    expect(stored?.pricing?.lines[0]?.rate.paise).toBe(2500);
    expect(stored?.pricing?.total.paise).toBe(120_000);
  });

  it('stops production changing a price while still letting it move the job', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const job = await createTestJob();
    await priceJob(job.id, 25, SALES.uid);

    await signInWithEmail(PRODUCTION.email, PRODUCTION.password);

    const line = calculateLine({
      id: 'line-1',
      productId: null,
      productName: 'Cheaper flex',
      pricingMethod: 'per-square-foot',
      measurementUnit: 'foot',
      width: 6,
      height: 4,
      quantity: 2,
      rate: fromRupees(1),
    });
    if (!line.ok) throw new Error('expected a line');
    const summary = summarisePricing([line.line]);
    if (!summary.ok) throw new Error('expected a summary');

    await expect(
      updateJobPricing(job.id, summary.pricing, actorFor(PRODUCTION, 'Production')),
    ).rejects.toMatchObject({ code: 'permission-denied' });

    const stored = await findJob(job.id);
    expect(stored?.pricing?.total.paise).toBe(120_000);
  });

  it('refuses a total below zero at the database, not just in the form', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const job = await createTestJob();

    const line = calculateLine({
      id: 'line-1',
      productId: null,
      productName: 'Flex',
      pricingMethod: 'flat-rate',
      measurementUnit: 'foot',
      quantity: 1,
      rate: fromRupees(100),
    });
    if (!line.ok) throw new Error('expected a line');

    // Build a deliberately inconsistent payload, as a tampered client would.
    const tampered = {
      lines: [line.line],
      subtotal: fromRupees(100),
      adjustment: { amount: fromRupees(-500), reason: 'Tampered' },
      total: fromRupees(-400),
    };

    await expect(
      updateJobPricing(job.id, tampered, actorFor(SALES, 'Sales User')),
    ).rejects.toBeInstanceOf(AppError);
  });
});
