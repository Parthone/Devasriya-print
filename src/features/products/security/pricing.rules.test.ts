import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

import { USER_ROLES, type UserRole } from '@/types/auth';

/**
 * Rules for the rate card and for pricing held on a job.
 *
 * The rule that matters: production holds jobs:edit, so it can move a job
 * along, but it must not be able to change what the job costs.
 */
let testEnv: RulesTestEnvironment;

const NOW = new Date('2026-08-24T10:00:00.000Z');
const JOB_ID = 'job-1';

const UID: Record<UserRole, string> = {
  owner: 'uid-owner',
  admin: 'uid-admin',
  sales: 'uid-sales',
  designer: 'uid-designer',
  production: 'uid-production',
  accounts: 'uid-accounts',
  viewer: 'uid-viewer',
};

function staffProfile(role: UserRole) {
  return {
    name: `${role} user`,
    email: `${role}@devasriya.test`,
    mobile: '9876500001',
    designation: 'manager',
    department: 'management',
    role,
    isActive: true,
    createdAt: NOW,
    createdBy: 'uid-owner',
    updatedAt: NOW,
    updatedBy: 'uid-owner',
  };
}

const rupees = (value: number) => ({ paise: Math.round(value * 100), currency: 'INR' });

function productDoc(actor: string, overrides: Record<string, unknown> = {}) {
  return {
    name: 'Flex Print 440 GSM',
    category: 'printing',
    pricingMethod: 'per-square-foot',
    defaultRate: rupees(25),
    defaultRateUnit: 'sq-ft',
    isActive: true,
    createdAt: NOW,
    createdBy: actor,
    updatedAt: NOW,
    updatedBy: actor,
    ...overrides,
  };
}

function pricingDoc(overrides: Record<string, unknown> = {}) {
  return {
    lines: [
      {
        id: 'line-1',
        productId: null,
        productName: 'Flex print',
        pricingMethod: 'per-square-foot',
        width: 6,
        height: 4,
        measurementUnit: 'foot',
        quantity: 1,
        rate: rupees(25),
        rateUnit: 'sq-ft',
        calculatedArea: 24,
        lineAmount: rupees(600),
      },
    ],
    subtotal: rupees(600),
    adjustment: null,
    total: rupees(600),
    ...overrides,
  };
}

function jobDoc(actor: string, overrides: Record<string, unknown> = {}) {
  return {
    jobNumber: 'JOB-2627-0001',
    customerId: 'customer-1',
    customerName: 'Ravi Kumar',
    customerMobile: '9812300011',
    enquiryId: null,
    enquiryNumber: null,
    jobDate: NOW,
    title: 'Wedding cards',
    requirementText: 'Gold foil',
    requirementAudio: null,
    priority: 'normal',
    expectedDeliveryDate: null,
    pickupLocationId: null,
    pickupLocationName: null,
    contactPersonId: null,
    contactPersonName: null,
    contactPersonMobile: null,
    assignedToId: null,
    assignedToName: null,
    status: 'open',
    pricing: null,
    createdAt: NOW,
    createdBy: actor,
    updatedAt: NOW,
    updatedBy: actor,
    ...overrides,
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-devasriya-pricing-rules',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const role of USER_ROLES) {
      await setDoc(doc(db, 'users', UID[role]), staffProfile(role));
    }
    await setDoc(doc(db, 'jobs', JOB_ID), jobDoc(UID.owner));
    await setDoc(doc(db, 'products', 'product-1'), productDoc(UID.owner));
  });
});

describe('rate card', () => {
  it.each(USER_ROLES)('lets %s read the rate card, since anyone may price work', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertSucceeds(getDocs(collection(db, 'products')));
  });

  it('denies a signed-out client and a deactivated employee', async () => {
    await assertFails(
      getDocs(collection(testEnv.unauthenticatedContext().firestore(), 'products')),
    );

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', UID.sales), {
        ...staffProfile('sales'),
        isActive: false,
      });
    });
    const db = testEnv.authenticatedContext(UID.sales).firestore();
    await assertFails(getDocs(collection(db, 'products')));
  });

  it('lets only the owner add or change an item', async () => {
    const owner = testEnv.authenticatedContext(UID.owner).firestore();
    await assertSucceeds(setDoc(doc(owner, 'products', 'new-owner'), productDoc(UID.owner)));
    await assertSucceeds(
      updateDoc(doc(owner, 'products', 'product-1'), {
        defaultRate: rupees(30),
        updatedBy: UID.owner,
      }),
    );

    const others: UserRole[] = ['admin', 'sales', 'production', 'accounts', 'designer', 'viewer'];
    for (const role of others) {
      const db = testEnv.authenticatedContext(UID[role]).firestore();
      await assertFails(setDoc(doc(db, 'products', `new-${role}`), productDoc(UID[role])));
      await assertFails(
        updateDoc(doc(db, 'products', 'product-1'), {
          defaultRate: rupees(1),
          updatedBy: UID[role],
        }),
      );
    }
  });

  it('rejects an invalid rate, method or unit', async () => {
    const db = testEnv.authenticatedContext(UID.owner).firestore();

    await assertFails(
      setDoc(doc(db, 'products', 'bad-1'), productDoc(UID.owner, { defaultRate: rupees(-5) })),
    );
    await assertFails(
      setDoc(doc(db, 'products', 'bad-2'), productDoc(UID.owner, { pricingMethod: 'per-guess' })),
    );
    await assertFails(
      setDoc(doc(db, 'products', 'bad-3'), productDoc(UID.owner, { defaultRateUnit: 'furlong' })),
    );
    await assertFails(
      setDoc(
        doc(db, 'products', 'bad-4'),
        productDoc(UID.owner, { defaultRate: { paise: 2500, currency: 'USD' } }),
      ),
    );
  });

  it('rejects stock or inventory fields, which belong to another module', async () => {
    const db = testEnv.authenticatedContext(UID.owner).firestore();
    await assertFails(
      setDoc(doc(db, 'products', 'bad-5'), productDoc(UID.owner, { stockOnHand: 40 })),
    );
  });

  it('never allows a rate card item to be deleted', async () => {
    for (const role of USER_ROLES) {
      const db = testEnv.authenticatedContext(UID[role]).firestore();
      await assertFails(deleteDoc(doc(db, 'products', 'product-1')));
    }
  });
});

describe('pricing on a job', () => {
  const canPrice: UserRole[] = ['owner', 'admin', 'sales'];

  it.each(canPrice)('lets %s price a job', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'jobs', JOB_ID), { pricing: pricingDoc(), updatedBy: UID[role] }),
    );
  });

  it('stops production changing the price, even though it may edit the job', async () => {
    const db = testEnv.authenticatedContext(UID.production).firestore();

    // It can still move the job along.
    await assertSucceeds(
      updateDoc(doc(db, 'jobs', JOB_ID), { status: 'in-progress', updatedBy: UID.production }),
    );
    // But not touch the money.
    await assertFails(
      updateDoc(doc(db, 'jobs', JOB_ID), { pricing: pricingDoc(), updatedBy: UID.production }),
    );
  });

  it.each(['designer', 'accounts', 'viewer'] as UserRole[])(
    'stops %s pricing a job',
    async (role) => {
      const db = testEnv.authenticatedContext(UID[role]).firestore();
      await assertFails(
        updateDoc(doc(db, 'jobs', JOB_ID), { pricing: pricingDoc(), updatedBy: UID[role] }),
      );
    },
  );

  it('refuses a total below zero', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();
    await assertFails(
      updateDoc(doc(db, 'jobs', JOB_ID), {
        pricing: pricingDoc({
          adjustment: { amount: rupees(-700), reason: 'Too much' },
          total: rupees(-100),
        }),
        updatedBy: UID.sales,
      }),
    );
  });

  it('refuses an adjustment with no reason, and accepts one that has a reason', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();

    await assertFails(
      updateDoc(doc(db, 'jobs', JOB_ID), {
        pricing: pricingDoc({
          adjustment: { amount: rupees(-100), reason: '' },
          total: rupees(500),
        }),
        updatedBy: UID.sales,
      }),
    );

    await assertSucceeds(
      updateDoc(doc(db, 'jobs', JOB_ID), {
        pricing: pricingDoc({
          adjustment: { amount: rupees(-100), reason: 'Repeat customer' },
          total: rupees(500),
        }),
        updatedBy: UID.sales,
      }),
    );
  });

  it('refuses money that is not whole paise in rupees', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();

    await assertFails(
      updateDoc(doc(db, 'jobs', JOB_ID), {
        pricing: pricingDoc({ total: { paise: 600.5, currency: 'INR' } }),
        updatedBy: UID.sales,
      }),
    );
    await assertFails(
      updateDoc(doc(db, 'jobs', JOB_ID), {
        pricing: pricingDoc({ subtotal: { paise: 600, currency: 'USD' } }),
        updatedBy: UID.sales,
      }),
    );
  });

  it('refuses more than fifty priced lines', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();
    const [line] = pricingDoc().lines;
    const tooMany = Array.from({ length: 51 }, (_, index) => ({
      ...line,
      id: `line-${String(index)}`,
    }));

    await assertFails(
      updateDoc(doc(db, 'jobs', JOB_ID), {
        pricing: pricingDoc({ lines: tooMany }),
        updatedBy: UID.sales,
      }),
    );
  });

  it('refuses unexpected fields inside the pricing summary', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();
    await assertFails(
      updateDoc(doc(db, 'jobs', JOB_ID), {
        pricing: pricingDoc({ gstAmount: rupees(108) }),
        updatedBy: UID.sales,
      }),
    );
  });

  it('lets a priced job still be moved along by production', async () => {
    const sales = testEnv.authenticatedContext(UID.sales).firestore();
    await assertSucceeds(
      updateDoc(doc(sales, 'jobs', JOB_ID), { pricing: pricingDoc(), updatedBy: UID.sales }),
    );

    const production = testEnv.authenticatedContext(UID.production).firestore();
    await assertSucceeds(
      updateDoc(doc(production, 'jobs', JOB_ID), { status: 'ready', updatedBy: UID.production }),
    );
  });
});
