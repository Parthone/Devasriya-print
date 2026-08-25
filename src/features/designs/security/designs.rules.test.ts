import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { USER_ROLES, type UserRole } from '@/types/auth';

/**
 * Rules for design versions and for the customer portal identity.
 *
 * The two things that matter here: one customer can never reach another
 * customer's artwork, and neither side of the conversation can rewrite what the
 * other one said.
 */
let testEnv: RulesTestEnvironment;

const NOW = new Date('2026-08-24T10:00:00.000Z');
const DESIGN_ID = 'job-1-v1';
const OTHER_DESIGN_ID = 'job-2-v1';

const UID: Record<UserRole, string> = {
  owner: 'uid-owner',
  admin: 'uid-admin',
  sales: 'uid-sales',
  designer: 'uid-designer',
  production: 'uid-production',
  accounts: 'uid-accounts',
  viewer: 'uid-viewer',
};

/** The customer the designs belong to, and an unrelated one. */
const MINE = 'uid-portal-mine';
const THEIRS = 'uid-portal-theirs';

/** Roles the Module 2 matrix gives designs:view. */
const VIEWERS: UserRole[] = ['owner', 'admin', 'sales', 'designer', 'production', 'viewer'];
const NON_VIEWERS: UserRole[] = ['accounts'];
/** Roles with designs:upload. */
const UPLOADERS: UserRole[] = ['owner', 'admin', 'designer'];
const NON_UPLOADERS: UserRole[] = ['sales', 'production', 'accounts', 'viewer'];
/** Roles with designs:approve. */
const APPROVERS: UserRole[] = ['owner', 'admin', 'sales'];
const NON_APPROVERS: UserRole[] = ['designer', 'production', 'accounts', 'viewer'];

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

function portalAccount(customerId: string, overrides: Record<string, unknown> = {}) {
  return {
    customerId,
    customerName: `Customer ${customerId}`,
    email: `${customerId}@example.com`,
    preferredLanguage: 'hi',
    isActive: true,
    createdAt: NOW,
    createdBy: UID.owner,
    updatedAt: NOW,
    updatedBy: UID.owner,
    ...overrides,
  };
}

function designDoc(overrides: Record<string, unknown> = {}) {
  return {
    jobId: 'job-1',
    jobNumber: 'JOB-2627-0001',
    jobTitle: 'Shop board',
    customerId: 'customer-mine',
    customerName: 'Shreeji Traders',
    version: 1,
    file: {
      id: 'file-1',
      storagePath: 'designs/job-1/job-1-v1/file-1.png',
      mimeType: 'image/png',
      sizeBytes: 204_800,
      originalFileName: 'board.png',
      uploadedAt: NOW,
      uploadedById: UID.designer,
    },
    preview: { kind: 'image', width: 1600, height: 900 },
    uploadedById: UID.designer,
    uploadedByName: 'designer user',
    uploadedAt: NOW,
    status: 'submitted-for-review',
    designerNote: 'First pass',
    decision: null,
    submittedAt: NOW,
    supersededAt: null,
    createdAt: NOW,
    createdBy: UID.designer,
    updatedAt: NOW,
    updatedBy: UID.designer,
    ...overrides,
  };
}

async function seedDesign(id: string, overrides: Record<string, unknown> = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'designs', id), designDoc(overrides));
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-devasriya-design-rules',
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
    await setDoc(doc(db, 'customerAccounts', MINE), portalAccount('customer-mine'));
    await setDoc(doc(db, 'customerAccounts', THEIRS), portalAccount('customer-theirs'));
  });
  await seedDesign(DESIGN_ID);
  await seedDesign(OTHER_DESIGN_ID, { jobId: 'job-2', customerId: 'customer-theirs' });
});

describe('staff reading designs', () => {
  it.each(VIEWERS)('lets %s see the design list', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertSucceeds(getDocs(collection(db, 'designs')));
  });

  it.each(NON_VIEWERS)('denies %s, who has no designs:view', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertFails(getDocs(collection(db, 'designs')));
  });

  it('denies a signed-out client and a deactivated employee', async () => {
    await assertFails(getDocs(collection(testEnv.unauthenticatedContext().firestore(), 'designs')));

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', UID.designer), {
        ...staffProfile('designer'),
        isActive: false,
      });
    });
    await assertFails(
      getDocs(collection(testEnv.authenticatedContext(UID.designer).firestore(), 'designs')),
    );
  });
});

describe('one customer never reaches another customer', () => {
  it('lets a customer read their own design and refuses somebody else', async () => {
    const db = testEnv.authenticatedContext(MINE).firestore();

    await assertSucceeds(getDoc(doc(db, 'designs', DESIGN_ID)));
    await assertFails(getDoc(doc(db, 'designs', OTHER_DESIGN_ID)));
  });

  it('refuses a customer query that is not scoped to their own id', async () => {
    const db = testEnv.authenticatedContext(MINE).firestore();

    await assertFails(getDocs(collection(db, 'designs')));
    await assertFails(
      getDocs(query(collection(db, 'designs'), where('customerId', '==', 'customer-theirs'))),
    );
    await assertSucceeds(
      getDocs(query(collection(db, 'designs'), where('customerId', '==', 'customer-mine'))),
    );
  });

  it('refuses a customer whose portal access has been revoked', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'customerAccounts', MINE),
        portalAccount('customer-mine', { isActive: false }),
      );
    });

    const db = testEnv.authenticatedContext(MINE).firestore();
    await assertFails(getDoc(doc(db, 'designs', DESIGN_ID)));
  });

  it('lets a customer read their own order and no other', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'jobs', 'job-1'), {
        jobNumber: 'JOB-2627-0001',
        customerId: 'customer-mine',
        customerName: 'Shreeji Traders',
        customerMobile: '9812300011',
        jobDate: NOW,
        title: 'Shop board',
        requirementText: 'Backlit board',
        priority: 'normal',
        status: 'open',
        createdAt: NOW,
        createdBy: UID.sales,
        updatedAt: NOW,
        updatedBy: UID.sales,
      });
    });

    await assertSucceeds(
      getDoc(doc(testEnv.authenticatedContext(MINE).firestore(), 'jobs', 'job-1')),
    );
    await assertFails(
      getDoc(doc(testEnv.authenticatedContext(THEIRS).firestore(), 'jobs', 'job-1')),
    );
  });
});

describe('uploading a version', () => {
  it.each(UPLOADERS)('lets %s add a version', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertSucceeds(
      setDoc(
        doc(db, 'designs', `job-1-v9-${role}`),
        designDoc({
          version: 9,
          status: 'draft',
          submittedAt: null,
          uploadedById: UID[role],
          createdBy: UID[role],
          updatedBy: UID[role],
        }),
      ),
    );
  });

  it.each(NON_UPLOADERS)('denies %s', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertFails(
      setDoc(
        doc(db, 'designs', `job-1-v9-${role}`),
        designDoc({
          version: 9,
          uploadedById: UID[role],
          createdBy: UID[role],
          updatedBy: UID[role],
        }),
      ),
    );
  });

  it('refuses a version that arrives already answered', async () => {
    const db = testEnv.authenticatedContext(UID.designer).firestore();
    await assertFails(
      setDoc(
        doc(db, 'designs', 'job-1-v9'),
        designDoc({
          version: 9,
          status: 'approved',
          decision: {
            outcome: 'approved',
            comment: 'Self approved',
            decidedAt: NOW,
            source: 'customer',
            byId: MINE,
            byName: 'Shreeji Traders',
          },
        }),
      ),
    );
  });

  it('refuses a file type or size the review screen could not handle', async () => {
    const db = testEnv.authenticatedContext(UID.designer).firestore();

    await assertFails(
      setDoc(
        doc(db, 'designs', 'job-1-bad-type'),
        designDoc({
          version: 9,
          file: { ...designDoc().file, mimeType: 'application/postscript' },
        }),
      ),
    );
    await assertFails(
      setDoc(
        doc(db, 'designs', 'job-1-too-big'),
        designDoc({
          version: 9,
          file: { ...designDoc().file, sizeBytes: 26 * 1024 * 1024 },
        }),
      ),
    );
  });

  it('refuses a version attributed to another designer', async () => {
    const db = testEnv.authenticatedContext(UID.designer).firestore();
    await assertFails(
      setDoc(
        doc(db, 'designs', 'job-1-v9'),
        designDoc({ version: 9, uploadedById: UID.admin, createdBy: UID.admin }),
      ),
    );
  });

  it('never lets a customer create a version', async () => {
    const db = testEnv.authenticatedContext(MINE).firestore();
    await assertFails(
      setDoc(doc(db, 'designs', 'job-1-v9'), designDoc({ version: 9, uploadedById: MINE })),
    );
  });
});

describe('the artwork itself is immutable', () => {
  it('refuses any change to the file, the version or who it belongs to', async () => {
    const db = testEnv.authenticatedContext(UID.owner).firestore();

    await assertFails(
      updateDoc(doc(db, 'designs', DESIGN_ID), {
        file: { ...designDoc().file, storagePath: 'designs/job-1/job-1-v1/swapped.png' },
        updatedBy: UID.owner,
      }),
    );
    await assertFails(
      updateDoc(doc(db, 'designs', DESIGN_ID), { version: 7, updatedBy: UID.owner }),
    );
    await assertFails(
      updateDoc(doc(db, 'designs', DESIGN_ID), {
        customerId: 'customer-theirs',
        updatedBy: UID.owner,
      }),
    );
    await assertFails(
      updateDoc(doc(db, 'designs', DESIGN_ID), { jobId: 'job-2', updatedBy: UID.owner }),
    );
  });

  it('cannot be replaced by overwriting the whole document', async () => {
    const db = testEnv.authenticatedContext(UID.designer).firestore();
    await assertFails(
      setDoc(
        doc(db, 'designs', DESIGN_ID),
        designDoc({ file: { ...designDoc().file, storagePath: 'designs/elsewhere.png' } }),
      ),
    );
  });

  it('is never deleted, by anybody', async () => {
    for (const role of USER_ROLES) {
      const db = testEnv.authenticatedContext(UID[role]).firestore();
      await assertFails(deleteDoc(doc(db, 'designs', DESIGN_ID)));
    }
    await assertFails(
      deleteDoc(doc(testEnv.authenticatedContext(MINE).firestore(), 'designs', DESIGN_ID)),
    );
    expect(true).toBe(true);
  });
});

describe('answering a version', () => {
  const decision = (overrides: Record<string, unknown> = {}) => ({
    outcome: 'approved',
    comment: 'Approved, but make the font bigger.',
    decidedAt: NOW,
    source: 'customer',
    byId: MINE,
    byName: 'Shreeji Traders',
    language: 'hi',
    ...overrides,
  });

  it('lets the customer approve their own design, comment included', async () => {
    const db = testEnv.authenticatedContext(MINE).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'designs', DESIGN_ID), {
        status: 'approved',
        decision: decision(),
        updatedBy: MINE,
      }),
    );
  });

  it('refuses a customer answering a design that is not theirs', async () => {
    const db = testEnv.authenticatedContext(THEIRS).firestore();
    await assertFails(
      updateDoc(doc(db, 'designs', DESIGN_ID), {
        status: 'approved',
        decision: decision({ byId: THEIRS, byName: 'Someone Else' }),
        updatedBy: THEIRS,
      }),
    );
  });

  it('refuses an answer filed under another name', async () => {
    const db = testEnv.authenticatedContext(MINE).firestore();
    await assertFails(
      updateDoc(doc(db, 'designs', DESIGN_ID), {
        status: 'approved',
        decision: decision({ byId: UID.sales }),
        updatedBy: MINE,
      }),
    );
  });

  it('stops staff posting an answer as though the customer had typed it', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();

    await assertFails(
      updateDoc(doc(db, 'designs', DESIGN_ID), {
        status: 'approved',
        decision: decision({ source: 'customer', byId: UID.sales }),
        updatedBy: UID.sales,
      }),
    );
    await assertSucceeds(
      updateDoc(doc(db, 'designs', DESIGN_ID), {
        status: 'approved',
        decision: decision({ source: 'staff', byId: UID.sales, byName: 'sales user' }),
        updatedBy: UID.sales,
      }),
    );
  });

  it('refuses a decision that disagrees with the status it sets', async () => {
    const db = testEnv.authenticatedContext(MINE).firestore();
    await assertFails(
      updateDoc(doc(db, 'designs', DESIGN_ID), {
        status: 'approved',
        decision: decision({ outcome: 'rejected' }),
        updatedBy: MINE,
      }),
    );
  });
});

describe('who may record a decision at all', () => {
  const staffDecision = (role: UserRole, outcome = 'approved') => ({
    outcome,
    comment: 'They said yes on the phone.',
    decidedAt: NOW,
    source: 'staff',
    byId: UID[role],
    byName: `${role} user`,
  });

  it.each(APPROVERS)('lets %s record what the customer said', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'designs', DESIGN_ID), {
        status: 'approved',
        decision: staffDecision(role),
        updatedBy: UID[role],
      }),
    );
  });

  it.each(NON_APPROVERS)('denies %s, who has no designs:approve', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertFails(
      updateDoc(doc(db, 'designs', DESIGN_ID), {
        status: 'approved',
        decision: staffDecision(role),
        updatedBy: UID[role],
      }),
    );
  });

  it('refuses to answer a version that is not with the customer', async () => {
    await seedDesign(DESIGN_ID, { status: 'draft', submittedAt: null });
    const db = testEnv.authenticatedContext(UID.sales).firestore();

    await assertFails(
      updateDoc(doc(db, 'designs', DESIGN_ID), {
        status: 'approved',
        decision: staffDecision('sales'),
        updatedBy: UID.sales,
      }),
    );
  });

  it('freezes a version once it has been answered', async () => {
    await seedDesign(DESIGN_ID, {
      status: 'changes-requested',
      decision: {
        outcome: 'changes-requested',
        comment: 'Bigger logo',
        decidedAt: NOW,
        source: 'customer',
        byId: MINE,
        byName: 'Shreeji Traders',
      },
    });
    const db = testEnv.authenticatedContext(UID.owner).firestore();

    await assertFails(
      updateDoc(doc(db, 'designs', DESIGN_ID), {
        status: 'approved',
        decision: staffDecision('owner'),
        updatedBy: UID.owner,
      }),
    );
  });

  it('lets a newer version take over without touching what was said', async () => {
    await seedDesign(DESIGN_ID, {
      status: 'changes-requested',
      decision: {
        outcome: 'changes-requested',
        comment: 'Bigger logo',
        decidedAt: NOW,
        source: 'customer',
        byId: MINE,
        byName: 'Shreeji Traders',
      },
    });
    const db = testEnv.authenticatedContext(UID.designer).firestore();

    await assertSucceeds(
      updateDoc(doc(db, 'designs', DESIGN_ID), {
        status: 'superseded',
        supersededAt: NOW,
        updatedBy: UID.designer,
      }),
    );

    // ... but not while quietly rewriting the comment it carries.
    await seedDesign(OTHER_DESIGN_ID, {
      jobId: 'job-2',
      customerId: 'customer-theirs',
      status: 'changes-requested',
      decision: {
        outcome: 'changes-requested',
        comment: 'Bigger logo',
        decidedAt: NOW,
        source: 'customer',
        byId: THEIRS,
        byName: 'Someone Else',
      },
    });
    await assertFails(
      updateDoc(doc(db, 'designs', OTHER_DESIGN_ID), {
        status: 'superseded',
        supersededAt: NOW,
        decision: {
          outcome: 'changes-requested',
          comment: 'They never said this',
          decidedAt: NOW,
          source: 'customer',
          byId: THEIRS,
          byName: 'Someone Else',
        },
        updatedBy: UID.designer,
      }),
    );
  });

  it('lets staff send a draft out, and nobody else', async () => {
    await seedDesign(DESIGN_ID, { status: 'draft', submittedAt: null });

    await assertFails(
      updateDoc(doc(testEnv.authenticatedContext(MINE).firestore(), 'designs', DESIGN_ID), {
        status: 'submitted-for-review',
        submittedAt: NOW,
        updatedBy: MINE,
      }),
    );
    await assertSucceeds(
      updateDoc(doc(testEnv.authenticatedContext(UID.designer).firestore(), 'designs', DESIGN_ID), {
        status: 'submitted-for-review',
        submittedAt: NOW,
        updatedBy: UID.designer,
      }),
    );
  });
});

describe('portal accounts', () => {
  it('lets a customer read only their own account', async () => {
    const db = testEnv.authenticatedContext(MINE).firestore();

    await assertSucceeds(getDoc(doc(db, 'customerAccounts', MINE)));
    await assertFails(getDoc(doc(db, 'customerAccounts', THEIRS)));
    await assertFails(getDocs(collection(db, 'customerAccounts')));
  });

  it('lets staff who may edit customers create one, and nobody else', async () => {
    for (const role of ['owner', 'admin', 'sales'] as UserRole[]) {
      const db = testEnv.authenticatedContext(UID[role]).firestore();
      await assertSucceeds(
        setDoc(
          doc(db, 'customerAccounts', `new-${role}`),
          portalAccount(`customer-${role}`, { createdBy: UID[role], updatedBy: UID[role] }),
        ),
      );
    }

    for (const role of ['designer', 'production', 'accounts', 'viewer'] as UserRole[]) {
      const db = testEnv.authenticatedContext(UID[role]).firestore();
      await assertFails(
        setDoc(
          doc(db, 'customerAccounts', `blocked-${role}`),
          portalAccount(`customer-${role}`, { createdBy: UID[role], updatedBy: UID[role] }),
        ),
      );
    }
  });

  it('refuses to turn an employee uid into a customer login, or the reverse', async () => {
    const db = testEnv.authenticatedContext(UID.owner).firestore();

    await assertFails(
      setDoc(
        doc(db, 'customerAccounts', UID.designer),
        portalAccount('customer-mine', { createdBy: UID.owner, updatedBy: UID.owner }),
      ),
    );

    await assertFails(
      setDoc(doc(db, 'users', MINE), {
        ...staffProfile('sales'),
        createdBy: UID.owner,
        updatedBy: UID.owner,
      }),
    );
  });

  it('never lets a live login be repointed at a different customer', async () => {
    const db = testEnv.authenticatedContext(UID.owner).firestore();

    await assertFails(
      updateDoc(doc(db, 'customerAccounts', MINE), {
        customerId: 'customer-theirs',
        updatedBy: UID.owner,
      }),
    );
    await assertSucceeds(
      updateDoc(doc(db, 'customerAccounts', MINE), { isActive: false, updatedBy: UID.owner }),
    );
  });

  it('never lets a customer edit or delete their own account', async () => {
    const db = testEnv.authenticatedContext(MINE).firestore();

    await assertFails(
      updateDoc(doc(db, 'customerAccounts', MINE), { isActive: true, updatedBy: MINE }),
    );
    await assertFails(deleteDoc(doc(db, 'customerAccounts', MINE)));
    await assertFails(
      deleteDoc(doc(testEnv.authenticatedContext(UID.owner).firestore(), 'customerAccounts', MINE)),
    );
  });
});
