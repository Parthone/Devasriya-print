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
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/**
 * Security-rules tests for the `users` collection.
 *
 * They run against the Firestore emulator, so they exercise the rules exactly
 * as deployed: npm run test:rules
 */
let testEnv: RulesTestEnvironment;

const OWNER = 'uid-owner';
const ADMIN = 'uid-admin';
const PRODUCTION = 'uid-production';
const STAFF = 'uid-staff';
const INACTIVE = 'uid-inactive';
const NEW_USER = 'uid-new';

const NOW = new Date('2026-08-24T10:00:00.000Z');

function profile(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Design Studio Staff',
    email: 'designer@devasriya.test',
    mobile: '9876500002',
    designation: 'graphic-designer',
    department: 'design',
    role: 'designer',
    isActive: true,
    createdAt: NOW,
    createdBy: OWNER,
    updatedAt: NOW,
    updatedBy: OWNER,
    ...overrides,
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-devasriya-rules',
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
    await setDoc(
      doc(db, 'users', OWNER),
      profile({ name: 'Owner Account', email: 'owner@devasriya.test', role: 'owner' }),
    );
    await setDoc(
      doc(db, 'users', ADMIN),
      profile({ name: 'Admin Account', email: 'admin@devasriya.test', role: 'admin' }),
    );
    await setDoc(
      doc(db, 'users', PRODUCTION),
      profile({
        name: 'Production Lead',
        email: 'production@devasriya.test',
        role: 'production',
        department: 'printing',
      }),
    );
    await setDoc(doc(db, 'users', STAFF), profile());
    await setDoc(
      doc(db, 'users', INACTIVE),
      profile({ name: 'Deactivated', email: 'inactive@devasriya.test', isActive: false }),
    );
  });
});

describe('users collection - reading', () => {
  it('denies everything to an unauthenticated client', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'users', STAFF)));
    await assertFails(getDocs(collection(db, 'users')));
  });

  it('lets a signed-in user read their own profile', async () => {
    const db = testEnv.authenticatedContext(STAFF).firestore();
    await assertSucceeds(getDoc(doc(db, 'users', STAFF)));
  });

  it('lets a deactivated user read their own profile so the app can explain why', async () => {
    const db = testEnv.authenticatedContext(INACTIVE).firestore();
    await assertSucceeds(getDoc(doc(db, 'users', INACTIVE)));
  });

  it('stops staff reading or listing other employees', async () => {
    const db = testEnv.authenticatedContext(STAFF).firestore();
    await assertFails(getDoc(doc(db, 'users', OWNER)));
    await assertFails(getDocs(collection(db, 'users')));
  });

  it('lets an administrator list the directory', async () => {
    const db = testEnv.authenticatedContext(OWNER).firestore();
    await assertSucceeds(getDocs(collection(db, 'users')));
    await assertSucceeds(getDoc(doc(db, 'users', STAFF)));
  });

  it('denies an account that has no profile document', async () => {
    const db = testEnv.authenticatedContext('uid-ghost').firestore();
    await assertFails(getDocs(collection(db, 'users')));
  });
});

describe('users collection - writing', () => {
  it('lets an administrator create a valid employee profile', async () => {
    const db = testEnv.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      setDoc(
        doc(db, 'users', NEW_USER),
        profile({ email: 'ravi@devasriya.test', createdBy: OWNER, updatedBy: OWNER }),
      ),
    );
  });

  it('rejects a profile with a bad mobile number, unknown role or extra fields', async () => {
    const db = testEnv.authenticatedContext(OWNER).firestore();

    await assertFails(
      setDoc(doc(db, 'users', NEW_USER), profile({ mobile: '12345', updatedBy: OWNER })),
    );
    await assertFails(
      setDoc(doc(db, 'users', NEW_USER), profile({ role: 'superuser', updatedBy: OWNER })),
    );
    await assertFails(
      setDoc(
        doc(db, 'users', NEW_USER),
        profile({ updatedBy: OWNER, permissions: ['job:delete'] }),
      ),
    );
  });

  it('rejects a profile whose audit fields name somebody else', async () => {
    const db = testEnv.authenticatedContext(OWNER).firestore();
    await assertFails(
      setDoc(doc(db, 'users', NEW_USER), profile({ createdBy: STAFF, updatedBy: STAFF })),
    );
  });

  it('stops staff creating or editing any profile, including their own', async () => {
    const db = testEnv.authenticatedContext(STAFF).firestore();
    await assertFails(setDoc(doc(db, 'users', NEW_USER), profile({ updatedBy: STAFF })));
    await assertFails(updateDoc(doc(db, 'users', STAFF), { role: 'owner', updatedBy: STAFF }));
    await assertFails(updateDoc(doc(db, 'users', STAFF), { name: 'New Name', updatedBy: STAFF }));
  });

  it('stops a deactivated administrator from doing anything', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'users', INACTIVE),
        profile({ email: 'inactive@devasriya.test', role: 'admin', isActive: false }),
      );
    });

    const db = testEnv.authenticatedContext(INACTIVE).firestore();
    await assertFails(getDocs(collection(db, 'users')));
    await assertFails(updateDoc(doc(db, 'users', STAFF), { isActive: false, updatedBy: INACTIVE }));
  });

  it('lets an administrator update an employee and change their status', async () => {
    const db = testEnv.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'users', STAFF), {
        name: 'Design Studio Lead',
        updatedAt: new Date(),
        updatedBy: OWNER,
      }),
    );
    await assertSucceeds(
      updateDoc(doc(db, 'users', STAFF), {
        isActive: false,
        updatedAt: new Date(),
        updatedBy: OWNER,
      }),
    );
  });

  it('refuses to change the sign-in email or the creation audit fields', async () => {
    const db = testEnv.authenticatedContext(OWNER).firestore();
    await assertFails(
      updateDoc(doc(db, 'users', STAFF), {
        email: 'someone.else@devasriya.test',
        updatedBy: OWNER,
      }),
    );
    await assertFails(updateDoc(doc(db, 'users', STAFF), { createdBy: STAFF, updatedBy: OWNER }));
  });

  it('stops an administrator demoting or deactivating themselves', async () => {
    const db = testEnv.authenticatedContext(OWNER).firestore();
    await assertFails(updateDoc(doc(db, 'users', OWNER), { role: 'viewer', updatedBy: OWNER }));
    await assertFails(updateDoc(doc(db, 'users', OWNER), { isActive: false, updatedBy: OWNER }));
    await assertSucceeds(
      updateDoc(doc(db, 'users', OWNER), { name: 'Owner Renamed', updatedBy: OWNER }),
    );
  });

  it('never allows a profile to be deleted', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER).firestore();
    const staffDb = testEnv.authenticatedContext(STAFF).firestore();
    await assertFails(deleteDoc(doc(ownerDb, 'users', STAFF)));
    await assertFails(deleteDoc(doc(staffDb, 'users', STAFF)));
  });
});

describe('collections no module has opened yet', () => {
  it('stay denied for administrators too', async () => {
    // customers, enquiries, jobs, locations, products, jobPricing and
    // estimates are open from Modules 3 to 6 and have their own rules tests.
    const db = testEnv.authenticatedContext(OWNER).firestore();
    await assertFails(getDocs(collection(db, 'designs')));
    await assertFails(setDoc(doc(db, 'invoices', 'invoice-1'), { anything: true }));
  });
});

describe('users collection - privileged roles', () => {
  it('lets production view the directory but change nothing', async () => {
    const db = testEnv.authenticatedContext(PRODUCTION).firestore();

    await assertSucceeds(getDocs(collection(db, 'users')));
    await assertSucceeds(getDoc(doc(db, 'users', STAFF)));
    await assertFails(
      updateDoc(doc(db, 'users', STAFF), { name: 'Renamed', updatedBy: PRODUCTION }),
    );
    await assertFails(
      setDoc(doc(db, 'users', NEW_USER), profile({ createdBy: PRODUCTION, updatedBy: PRODUCTION })),
    );
  });

  it('stops an administrator creating another administrator or an owner', async () => {
    const db = testEnv.authenticatedContext(ADMIN).firestore();

    await assertSucceeds(
      setDoc(
        doc(db, 'users', NEW_USER),
        profile({ email: 'new@devasriya.test', role: 'sales', createdBy: ADMIN, updatedBy: ADMIN }),
      ),
    );
    await assertFails(
      setDoc(
        doc(db, 'users', 'uid-new-admin'),
        profile({
          email: 'new2@devasriya.test',
          role: 'admin',
          createdBy: ADMIN,
          updatedBy: ADMIN,
        }),
      ),
    );
    await assertFails(
      setDoc(
        doc(db, 'users', 'uid-new-owner'),
        profile({
          email: 'new3@devasriya.test',
          role: 'owner',
          createdBy: ADMIN,
          updatedBy: ADMIN,
        }),
      ),
    );
  });

  it('lets the owner create an administrator', async () => {
    const db = testEnv.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      setDoc(
        doc(db, 'users', 'uid-new-admin'),
        profile({
          email: 'new2@devasriya.test',
          role: 'admin',
          createdBy: OWNER,
          updatedBy: OWNER,
        }),
      ),
    );
  });

  it('stops an administrator editing an owner or another administrator', async () => {
    const db = testEnv.authenticatedContext(ADMIN).firestore();

    await assertFails(updateDoc(doc(db, 'users', OWNER), { name: 'Hijacked', updatedBy: ADMIN }));
    await assertFails(updateDoc(doc(db, 'users', OWNER), { isActive: false, updatedBy: ADMIN }));
    await assertSucceeds(updateDoc(doc(db, 'users', STAFF), { name: 'Renamed', updatedBy: ADMIN }));
  });

  it('stops an administrator promoting anybody to admin or owner', async () => {
    const db = testEnv.authenticatedContext(ADMIN).firestore();
    await assertFails(updateDoc(doc(db, 'users', STAFF), { role: 'admin', updatedBy: ADMIN }));
    await assertFails(updateDoc(doc(db, 'users', STAFF), { role: 'owner', updatedBy: ADMIN }));
    await assertSucceeds(updateDoc(doc(db, 'users', STAFF), { role: 'sales', updatedBy: ADMIN }));
  });

  it('lets the owner promote and demote administrators', async () => {
    const db = testEnv.authenticatedContext(OWNER).firestore();
    await assertSucceeds(updateDoc(doc(db, 'users', STAFF), { role: 'admin', updatedBy: OWNER }));
    await assertSucceeds(updateDoc(doc(db, 'users', ADMIN), { role: 'viewer', updatedBy: OWNER }));
  });
});

describe('auditLogs collection', () => {
  function auditEntry(overrides: Record<string, unknown> = {}) {
    return {
      action: 'role-changed',
      targetUserId: STAFF,
      targetName: 'Design Studio Staff',
      actorId: OWNER,
      actorName: 'Owner Account',
      before: 'Viewer',
      after: 'Designer',
      createdAt: serverTimestamp(),
      createdBy: OWNER,
      updatedAt: serverTimestamp(),
      updatedBy: OWNER,
      ...overrides,
    };
  }

  async function seedEntry() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'auditLogs', 'entry-1'), {
        ...auditEntry(),
        createdAt: NOW,
        updatedAt: NOW,
      });
    });
  }

  it('lets an administrator record a change', async () => {
    const db = testEnv.authenticatedContext(ADMIN).firestore();
    await assertSucceeds(
      setDoc(
        doc(db, 'auditLogs', 'entry-admin'),
        auditEntry({ actorId: ADMIN, createdBy: ADMIN, updatedBy: ADMIN, actorName: 'Admin' }),
      ),
    );
  });

  it('refuses an entry that blames somebody else', async () => {
    const db = testEnv.authenticatedContext(ADMIN).firestore();
    await assertFails(
      setDoc(
        doc(db, 'auditLogs', 'entry-spoof'),
        auditEntry({ actorId: OWNER, createdBy: ADMIN, updatedBy: ADMIN }),
      ),
    );
  });

  it('refuses a back-dated entry', async () => {
    const db = testEnv.authenticatedContext(OWNER).firestore();
    await assertFails(
      setDoc(
        doc(db, 'auditLogs', 'entry-backdated'),
        auditEntry({ createdAt: NOW, updatedAt: NOW }),
      ),
    );
  });

  it('refuses an entry with an unknown action or extra fields', async () => {
    const db = testEnv.authenticatedContext(OWNER).firestore();
    await assertFails(
      setDoc(
        doc(db, 'auditLogs', 'entry-bad-action'),
        auditEntry({ action: 'deleted-everything' }),
      ),
    );
    await assertFails(setDoc(doc(db, 'auditLogs', 'entry-extra'), auditEntry({ note: 'sneaky' })));
  });

  it('never allows an entry to be edited or deleted, not even by the owner', async () => {
    await seedEntry();
    const db = testEnv.authenticatedContext(OWNER).firestore();

    await assertFails(updateDoc(doc(db, 'auditLogs', 'entry-1'), { after: 'Owner' }));
    await assertFails(deleteDoc(doc(db, 'auditLogs', 'entry-1')));
  });

  it('lets owners and administrators read the trail', async () => {
    await seedEntry();

    for (const uid of [OWNER, ADMIN]) {
      const db = testEnv.authenticatedContext(uid).firestore();
      await assertSucceeds(getDocs(collection(db, 'auditLogs')));
      await assertSucceeds(getDoc(doc(db, 'auditLogs', 'entry-1')));
    }
  });

  it('hides the trail from staff, from production and from signed-out clients', async () => {
    await seedEntry();

    for (const uid of [STAFF, PRODUCTION, INACTIVE]) {
      const db = testEnv.authenticatedContext(uid).firestore();
      await assertFails(getDocs(collection(db, 'auditLogs')));
      await assertFails(
        setDoc(
          doc(db, 'auditLogs', `entry-${uid}`),
          auditEntry({ actorId: uid, createdBy: uid, updatedBy: uid }),
        ),
      );
    }

    const anonymous = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(anonymous, 'auditLogs')));
  });
});
