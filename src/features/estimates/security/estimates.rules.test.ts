import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { USER_ROLES, type UserRole } from '@/types/auth';

/**
 * Rules for quotations.
 *
 * Two things are enforced here that the UI alone cannot guarantee: the priced
 * snapshot on a quotation can never be rewritten, and a status can only move
 * where the transition table allows, with approval reserved for the roles that
 * hold estimates:approve.
 */
let testEnv: RulesTestEnvironment;

const NOW = new Date('2026-08-24T10:00:00.000Z');
const LATER = new Date('2026-09-08T10:00:00.000Z');
const ESTIMATE_ID = 'estimate-1';

const UID: Record<UserRole, string> = {
  owner: 'uid-owner',
  admin: 'uid-admin',
  sales: 'uid-sales',
  designer: 'uid-designer',
  production: 'uid-production',
  accounts: 'uid-accounts',
  viewer: 'uid-viewer',
};

/** Roles the Module 2 matrix gives estimates:view. */
const READERS: UserRole[] = ['owner', 'admin', 'sales', 'accounts', 'viewer'];
const NON_READERS: UserRole[] = ['designer', 'production'];
/** Roles the matrix gives estimates:create, :edit and :approve. */
const WRITERS: UserRole[] = ['owner', 'admin', 'sales'];
const NON_WRITERS: UserRole[] = ['designer', 'production', 'accounts', 'viewer'];

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

function estimateDoc(actor: string, overrides: Record<string, unknown> = {}) {
  return {
    estimateNumber: 'EST-2627-0001',
    jobId: 'job-1',
    jobNumber: 'JOB-2627-0001',
    jobTitle: 'Wedding cards',
    customerId: 'customer-1',
    customerName: 'Ravi Kumar',
    customerMobile: '9812300011',
    estimateDate: NOW,
    validUntil: LATER,
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
    terms: 'Half in advance.',
    status: 'draft',
    sentAt: null,
    decision: null,
    cancelledAt: null,
    createdAt: NOW,
    createdBy: actor,
    updatedAt: NOW,
    updatedBy: actor,
    ...overrides,
  };
}

async function seedEstimate(overrides: Record<string, unknown> = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), 'estimates', ESTIMATE_ID),
      estimateDoc(UID.owner, overrides),
    );
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-devasriya-estimate-rules',
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
  });
  await seedEstimate();
});

describe('reading quotations', () => {
  it.each(READERS)('lets %s read the quotation list', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertSucceeds(getDocs(collection(db, 'estimates')));
  });

  it.each(NON_READERS)('denies %s, who must not see what work costs', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertFails(getDocs(collection(db, 'estimates')));
  });

  it('denies a signed-out client and a deactivated employee', async () => {
    await assertFails(
      getDocs(collection(testEnv.unauthenticatedContext().firestore(), 'estimates')),
    );

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', UID.sales), {
        ...staffProfile('sales'),
        isActive: false,
      });
    });
    await assertFails(
      getDocs(collection(testEnv.authenticatedContext(UID.sales).firestore(), 'estimates')),
    );
  });
});

describe('creating a quotation', () => {
  it.each(WRITERS)('lets %s create a draft', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertSucceeds(setDoc(doc(db, 'estimates', `new-${role}`), estimateDoc(UID[role])));
  });

  it.each(NON_WRITERS)('denies %s', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertFails(setDoc(doc(db, 'estimates', `new-${role}`), estimateDoc(UID[role])));
  });

  it('refuses one that starts anywhere other than draft, or already decided', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();

    await assertFails(
      setDoc(doc(db, 'estimates', 'new-sent'), estimateDoc(UID.sales, { status: 'sent' })),
    );
    await assertFails(
      setDoc(
        doc(db, 'estimates', 'new-approved'),
        estimateDoc(UID.sales, {
          status: 'approved',
          decision: { outcome: 'approved', at: NOW, byId: UID.sales, byName: 'sales user' },
        }),
      ),
    );
  });

  it('refuses a malformed total, an empty quotation and an unsigned adjustment reason', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();

    await assertFails(
      setDoc(doc(db, 'estimates', 'bad-total'), estimateDoc(UID.sales, { total: 60_000 })),
    );
    await assertFails(
      setDoc(doc(db, 'estimates', 'no-lines'), estimateDoc(UID.sales, { lines: [] })),
    );
    await assertFails(
      setDoc(doc(db, 'estimates', 'negative-total'), estimateDoc(UID.sales, { total: rupees(-1) })),
    );
    await assertFails(
      setDoc(
        doc(db, 'estimates', 'blank-reason'),
        estimateDoc(UID.sales, {
          adjustment: { amount: rupees(-50), reason: '' },
          total: rupees(550),
        }),
      ),
    );
  });

  it('refuses a quotation attributed to somebody else', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();
    await assertFails(setDoc(doc(db, 'estimates', 'not-mine'), estimateDoc(UID.owner)));
  });
});

describe('the priced snapshot', () => {
  it('cannot be rewritten, by anybody, at any status', async () => {
    const db = testEnv.authenticatedContext(UID.owner).firestore();

    await assertFails(
      updateDoc(doc(db, 'estimates', ESTIMATE_ID), {
        total: rupees(900),
        updatedAt: NOW,
        updatedBy: UID.owner,
      }),
    );
    await assertFails(
      updateDoc(doc(db, 'estimates', ESTIMATE_ID), {
        subtotal: rupees(900),
        updatedAt: NOW,
        updatedBy: UID.owner,
      }),
    );
    await assertFails(
      updateDoc(doc(db, 'estimates', ESTIMATE_ID), {
        lines: [],
        updatedAt: NOW,
        updatedBy: UID.owner,
      }),
    );
    await assertFails(
      updateDoc(doc(db, 'estimates', ESTIMATE_ID), {
        customerName: 'Someone Else',
        updatedAt: NOW,
        updatedBy: UID.owner,
      }),
    );
    await assertFails(
      updateDoc(doc(db, 'estimates', ESTIMATE_ID), {
        estimateNumber: 'EST-2627-9999',
        updatedAt: NOW,
        updatedBy: UID.owner,
      }),
    );
    await assertFails(
      updateDoc(doc(db, 'estimates', ESTIMATE_ID), {
        jobId: 'job-2',
        updatedAt: NOW,
        updatedBy: UID.owner,
      }),
    );
  });

  it('cannot be replaced by overwriting the whole document', async () => {
    const db = testEnv.authenticatedContext(UID.owner).firestore();
    await assertFails(
      setDoc(
        doc(db, 'estimates', ESTIMATE_ID),
        estimateDoc(UID.owner, { total: rupees(1), subtotal: rupees(1) }),
      ),
    );
  });
});

describe('editing a draft', () => {
  it.each(WRITERS)('lets %s change the wording and validity', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'estimates', ESTIMATE_ID), {
        validUntil: LATER,
        notes: 'Includes delivery within the city.',
        terms: 'Half in advance.',
        updatedAt: NOW,
        updatedBy: UID[role],
      }),
    );
  });

  it.each(NON_WRITERS)('denies %s', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertFails(
      updateDoc(doc(db, 'estimates', ESTIMATE_ID), {
        notes: 'Trying to edit.',
        updatedAt: NOW,
        updatedBy: UID[role],
      }),
    );
  });

  it('refuses wording changes once it has been sent', async () => {
    await seedEstimate({ status: 'sent', sentAt: NOW });
    const db = testEnv.authenticatedContext(UID.owner).firestore();
    await assertFails(
      updateDoc(doc(db, 'estimates', ESTIMATE_ID), {
        notes: 'Quietly changed after sending.',
        updatedAt: NOW,
        updatedBy: UID.owner,
      }),
    );
  });
});

describe('status moves', () => {
  it('lets a draft be sent or cancelled, and nothing else', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();

    await assertFails(
      updateDoc(doc(db, 'estimates', ESTIMATE_ID), {
        status: 'approved',
        decision: { outcome: 'approved', at: NOW, byId: UID.sales, byName: 'sales user' },
        updatedAt: NOW,
        updatedBy: UID.sales,
      }),
    );
    await assertFails(
      updateDoc(doc(db, 'estimates', ESTIMATE_ID), {
        status: 'expired',
        cancelledAt: null,
        updatedAt: NOW,
        updatedBy: UID.sales,
      }),
    );
    await assertSucceeds(
      updateDoc(doc(db, 'estimates', ESTIMATE_ID), {
        status: 'sent',
        sentAt: NOW,
        updatedAt: NOW,
        updatedBy: UID.sales,
      }),
    );
  });

  it('never lets a sent quotation go back to draft', async () => {
    await seedEstimate({ status: 'sent', sentAt: NOW });
    const db = testEnv.authenticatedContext(UID.owner).firestore();
    await assertFails(
      updateDoc(doc(db, 'estimates', ESTIMATE_ID), {
        status: 'draft',
        sentAt: null,
        updatedAt: NOW,
        updatedBy: UID.owner,
      }),
    );
  });

  it('freezes a quotation once the customer has decided', async () => {
    await seedEstimate({
      status: 'approved',
      sentAt: NOW,
      decision: { outcome: 'approved', at: NOW, byId: UID.owner, byName: 'owner user' },
    });
    const db = testEnv.authenticatedContext(UID.owner).firestore();

    for (const status of ['draft', 'sent', 'rejected', 'cancelled', 'expired']) {
      await assertFails(
        updateDoc(doc(db, 'estimates', ESTIMATE_ID), {
          status,
          updatedAt: NOW,
          updatedBy: UID.owner,
        }),
      );
    }
  });
});

describe('recording what the customer decided', () => {
  beforeEach(async () => {
    await seedEstimate({ status: 'sent', sentAt: NOW });
  });

  it.each(WRITERS)('lets %s record an approval against their own name', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'estimates', ESTIMATE_ID), {
        status: 'approved',
        decision: {
          outcome: 'approved',
          at: NOW,
          byId: UID[role],
          byName: `${role} user`,
          note: 'Confirmed on the phone.',
        },
        updatedAt: NOW,
        updatedBy: UID[role],
      }),
    );
  });

  it.each(NON_WRITERS)('denies %s, who does not hold estimates:approve', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertFails(
      updateDoc(doc(db, 'estimates', ESTIMATE_ID), {
        status: 'approved',
        decision: { outcome: 'approved', at: NOW, byId: UID[role], byName: `${role} user` },
        updatedAt: NOW,
        updatedBy: UID[role],
      }),
    );
  });

  it('refuses a decision that disagrees with the status or names somebody else', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();

    await assertFails(
      updateDoc(doc(db, 'estimates', ESTIMATE_ID), {
        status: 'approved',
        decision: { outcome: 'rejected', at: NOW, byId: UID.sales, byName: 'sales user' },
        updatedAt: NOW,
        updatedBy: UID.sales,
      }),
    );
    await assertFails(
      updateDoc(doc(db, 'estimates', ESTIMATE_ID), {
        status: 'approved',
        decision: { outcome: 'approved', at: NOW, byId: UID.owner, byName: 'owner user' },
        updatedAt: NOW,
        updatedBy: UID.sales,
      }),
    );
  });
});

describe('deleting', () => {
  it('is refused for everybody, including the owner', async () => {
    for (const role of USER_ROLES) {
      const db = testEnv.authenticatedContext(UID[role]).firestore();
      await assertFails(deleteDoc(doc(db, 'estimates', ESTIMATE_ID)));
    }
    expect(true).toBe(true);
  });
});
