import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
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

describe('every other collection', () => {
  it('stays denied for administrators too', async () => {
    const db = testEnv.authenticatedContext(OWNER).firestore();
    await assertFails(getDocs(collection(db, 'customers')));
    await assertFails(setDoc(doc(db, 'jobs', 'job-1'), { anything: true }));
  });
});
