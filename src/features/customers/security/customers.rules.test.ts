import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

import { USER_ROLES, type UserRole } from '@/types/auth';

/**
 * Security rules for the `customers` collection.
 *
 * The permission matrix says: every role may view customers; only owner, admin
 * and sales may create or edit; nobody may delete.
 */
let testEnv: RulesTestEnvironment;

const NOW = new Date('2026-08-24T10:00:00.000Z');
const EXISTING = 'customer-1';

/** One signed-in user per role, so each row of the matrix can be exercised. */
const UID: Record<UserRole, string> = {
  owner: 'uid-owner',
  admin: 'uid-admin',
  sales: 'uid-sales',
  designer: 'uid-designer',
  production: 'uid-production',
  accounts: 'uid-accounts',
  viewer: 'uid-viewer',
};

const CAN_WRITE: UserRole[] = ['owner', 'admin', 'sales'];
const CANNOT_WRITE: UserRole[] = ['designer', 'production', 'accounts', 'viewer'];

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

function customerDoc(actor: string, overrides: Record<string, unknown> = {}) {
  return {
    name: 'Ravi Kumar',
    nameLower: 'ravi kumar',
    type: 'individual',
    mobile: '9876500001',
    address: '12 Station Road',
    city: 'Jaipur',
    state: 'Rajasthan',
    pincode: '302001',
    preferredLanguage: 'hi',
    isArchived: false,
    portalUserId: null,
    createdAt: NOW,
    createdBy: actor,
    updatedAt: NOW,
    updatedBy: actor,
    ...overrides,
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-devasriya-customer-rules',
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
    await setDoc(doc(db, 'customers', EXISTING), customerDoc(UID.owner));
  });
});

describe('reading customers', () => {
  it.each(USER_ROLES)('lets %s read and list customers', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertSucceeds(getDoc(doc(db, 'customers', EXISTING)));
    await assertSucceeds(getDocs(collection(db, 'customers')));
  });

  it('denies an unauthenticated client', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'customers', EXISTING)));
    await assertFails(getDocs(collection(db, 'customers')));
  });

  it('denies a deactivated employee', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', UID.sales), {
        ...staffProfile('sales'),
        isActive: false,
      });
    });

    const db = testEnv.authenticatedContext(UID.sales).firestore();
    await assertFails(getDocs(collection(db, 'customers')));
  });

  it('denies an account with no employee profile', async () => {
    const db = testEnv.authenticatedContext('uid-ghost').firestore();
    await assertFails(getDocs(collection(db, 'customers')));
  });
});

describe('creating customers', () => {
  it.each(CAN_WRITE)('lets %s create a customer', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertSucceeds(setDoc(doc(db, 'customers', `new-${role}`), customerDoc(UID[role])));
  });

  it.each(CANNOT_WRITE)('stops %s creating a customer', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertFails(setDoc(doc(db, 'customers', `new-${role}`), customerDoc(UID[role])));
  });

  it('rejects an invalid mobile number, PIN code, type or language', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();

    await assertFails(
      setDoc(doc(db, 'customers', 'bad-1'), customerDoc(UID.sales, { mobile: '1234567890' })),
    );
    await assertFails(
      setDoc(doc(db, 'customers', 'bad-2'), customerDoc(UID.sales, { pincode: '02001' })),
    );
    await assertFails(
      setDoc(doc(db, 'customers', 'bad-3'), customerDoc(UID.sales, { type: 'reseller' })),
    );
    await assertFails(
      setDoc(doc(db, 'customers', 'bad-4'), customerDoc(UID.sales, { preferredLanguage: 'fr' })),
    );
  });

  it('rejects a mismatched search field or an unexpected field', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();

    await assertFails(
      setDoc(doc(db, 'customers', 'bad-5'), customerDoc(UID.sales, { nameLower: 'wrong' })),
    );
    await assertFails(
      setDoc(doc(db, 'customers', 'bad-6'), customerDoc(UID.sales, { creditLimit: 100000 })),
    );
  });

  it('rejects a record that credits somebody else with the creation', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();
    await assertFails(setDoc(doc(db, 'customers', 'bad-7'), customerDoc(UID.owner)));
  });

  it('refuses to let this module set the reserved customer portal link', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();
    await assertFails(
      setDoc(
        doc(db, 'customers', 'bad-8'),
        customerDoc(UID.sales, { portalUserId: 'some-auth-uid' }),
      ),
    );
  });
});

describe('editing and archiving customers', () => {
  it.each(CAN_WRITE)('lets %s edit and archive a customer', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();

    await assertSucceeds(
      updateDoc(doc(db, 'customers', EXISTING), {
        name: 'Ravi Kumar Sharma',
        nameLower: 'ravi kumar sharma',
        updatedBy: UID[role],
        updatedAt: new Date(),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(db, 'customers', EXISTING), { isArchived: true, updatedBy: UID[role] }),
    );
  });

  it.each(CANNOT_WRITE)('stops %s editing or archiving a customer', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();

    await assertFails(
      updateDoc(doc(db, 'customers', EXISTING), { name: 'Hijacked', updatedBy: UID[role] }),
    );
    await assertFails(
      updateDoc(doc(db, 'customers', EXISTING), { isArchived: true, updatedBy: UID[role] }),
    );
  });

  it('keeps the creation audit fields immutable', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();

    await assertFails(
      updateDoc(doc(db, 'customers', EXISTING), { createdBy: UID.sales, updatedBy: UID.sales }),
    );
    await assertFails(
      updateDoc(doc(db, 'customers', EXISTING), { createdAt: new Date(), updatedBy: UID.sales }),
    );
  });

  it('stops an ordinary edit from writing the reserved portal link', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();
    await assertFails(
      updateDoc(doc(db, 'customers', EXISTING), {
        portalUserId: 'some-auth-uid',
        updatedBy: UID.sales,
      }),
    );
  });

  it('requires the edit to be attributed to the person making it', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();
    await assertFails(
      updateDoc(doc(db, 'customers', EXISTING), { name: 'Renamed', updatedBy: UID.owner }),
    );
  });

  it('still validates the whole record on update', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();
    await assertFails(
      updateDoc(doc(db, 'customers', EXISTING), { mobile: '1234567890', updatedBy: UID.sales }),
    );
  });
});

describe('deleting customers', () => {
  it.each(USER_ROLES)('never lets %s delete a customer', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertFails(deleteDoc(doc(db, 'customers', EXISTING)));
  });
});
