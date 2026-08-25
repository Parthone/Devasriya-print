import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

import { USER_ROLES, type UserRole } from '@/types/auth';

/**
 * Storage rules for design files.
 *
 * A design object is written once and never again: that is what makes "this
 * artwork was approved" a claim about a specific file. The customer it was sent
 * to may open it; no other customer can.
 */
let testEnv: RulesTestEnvironment;

const NOW = new Date('2026-08-24T10:00:00.000Z');
const PNG = new Uint8Array([137, 80, 78, 71]);
const PNG_META = { contentType: 'image/png' };
const PDF_META = { contentType: 'application/pdf' };

const UID: Record<UserRole, string> = {
  owner: 'uid-owner',
  admin: 'uid-admin',
  sales: 'uid-sales',
  designer: 'uid-designer',
  production: 'uid-production',
  accounts: 'uid-accounts',
  viewer: 'uid-viewer',
};

const MINE = 'uid-portal-mine';
const THEIRS = 'uid-portal-theirs';

const EXISTING = 'designs/job-1/job-1-v1/file-1.png';

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

function portalAccount(customerId: string, isActive = true) {
  return {
    customerId,
    customerName: `Customer ${customerId}`,
    email: `${customerId}@example.com`,
    preferredLanguage: 'hi',
    isActive,
    createdAt: NOW,
    createdBy: UID.owner,
    updatedAt: NOW,
    updatedBy: UID.owner,
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    // Must match the emulator project: the Storage rules read Firestore, and
    // that cross-service lookup resolves against the project the emulator was
    // started with (singleProjectMode).
    projectId: 'demo-devasriya',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
    storage: {
      rules: readFileSync('storage.rules', 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const role of USER_ROLES) {
      await setDoc(doc(db, 'users', UID[role]), staffProfile(role));
    }
    await setDoc(doc(db, 'customerAccounts', MINE), portalAccount('customer-mine'));
    await setDoc(doc(db, 'customerAccounts', THEIRS), portalAccount('customer-theirs'));

    // The design record the object belongs to, plus the order it is for.
    await setDoc(doc(db, 'designs', 'job-1-v1'), { customerId: 'customer-mine' });
    await setDoc(doc(db, 'jobs', 'job-1'), { customerId: 'customer-mine' });

    await uploadBytes(ref(context.storage(), EXISTING), PNG, PNG_META);
    await uploadBytes(ref(context.storage(), 'jobs/job-1/requirement/att-1.webm'), PNG, {
      contentType: 'audio/webm',
    });
  });
});

describe('uploading a design file', () => {
  const canUpload: UserRole[] = ['owner', 'admin', 'designer'];
  const cannotUpload: UserRole[] = ['sales', 'production', 'accounts', 'viewer'];

  it.each(canUpload)('lets %s write a new version object', async (role) => {
    const storage = testEnv.authenticatedContext(UID[role]).storage();
    await assertSucceeds(
      uploadBytes(ref(storage, `designs/job-1/job-1-v2/${role}.png`), PNG, PNG_META),
    );
  });

  it.each(cannotUpload)('stops %s uploading artwork', async (role) => {
    const storage = testEnv.authenticatedContext(UID[role]).storage();
    await assertFails(
      uploadBytes(ref(storage, `designs/job-1/job-1-v2/${role}.png`), PNG, PNG_META),
    );
  });

  it('accepts the review formats and refuses anything else', async () => {
    const storage = testEnv.authenticatedContext(UID.designer).storage();

    await assertSucceeds(uploadBytes(ref(storage, 'designs/job-1/job-1-v3/a.pdf'), PNG, PDF_META));
    await assertSucceeds(
      uploadBytes(ref(storage, 'designs/job-1/job-1-v3/b.jpg'), PNG, { contentType: 'image/jpeg' }),
    );
    await assertFails(
      uploadBytes(ref(storage, 'designs/job-1/job-1-v3/c.ai'), PNG, {
        contentType: 'application/postscript',
      }),
    );
    await assertFails(
      uploadBytes(ref(storage, 'designs/job-1/job-1-v3/d.exe'), PNG, {
        contentType: 'application/octet-stream',
      }),
    );
  });

  it('refuses a file over the size limit', async () => {
    const storage = testEnv.authenticatedContext(UID.designer).storage();
    const tooBig = new Uint8Array(26 * 1024 * 1024);
    await assertFails(
      uploadBytes(ref(storage, 'designs/job-1/job-1-v4/big.png'), tooBig, PNG_META),
    );
  });

  it('never lets a customer upload artwork', async () => {
    const storage = testEnv.authenticatedContext(MINE).storage();
    await assertFails(uploadBytes(ref(storage, 'designs/job-1/job-1-v2/mine.png'), PNG, PNG_META));
  });
});

describe('an uploaded design file cannot be swapped', () => {
  it('refuses a second write to the same path, even by the designer who made it', async () => {
    const storage = testEnv.authenticatedContext(UID.designer).storage();
    await assertFails(uploadBytes(ref(storage, EXISTING), PNG, PNG_META));
  });

  it('refuses an overwrite by the owner', async () => {
    const storage = testEnv.authenticatedContext(UID.owner).storage();
    await assertFails(uploadBytes(ref(storage, EXISTING), PNG, PNG_META));
  });

  it('is never deleted, so approved artwork stays openable', async () => {
    for (const role of USER_ROLES) {
      const storage = testEnv.authenticatedContext(UID[role]).storage();
      await assertFails(deleteObject(ref(storage, EXISTING)));
    }
    await assertFails(deleteObject(ref(testEnv.authenticatedContext(MINE).storage(), EXISTING)));
  });
});

describe('reading a design file', () => {
  const canRead: UserRole[] = ['owner', 'admin', 'sales', 'designer', 'production', 'viewer'];

  it.each(canRead)('lets %s open it', async (role) => {
    const storage = testEnv.authenticatedContext(UID[role]).storage();
    await assertSucceeds(getBytes(ref(storage, EXISTING)));
  });

  it('denies accounts, who has no designs:view', async () => {
    const storage = testEnv.authenticatedContext(UID.accounts).storage();
    await assertFails(getBytes(ref(storage, EXISTING)));
  });

  it('lets the customer it was sent to open it, and no other customer', async () => {
    await assertSucceeds(getBytes(ref(testEnv.authenticatedContext(MINE).storage(), EXISTING)));
    await assertFails(getBytes(ref(testEnv.authenticatedContext(THEIRS).storage(), EXISTING)));
    await assertFails(getBytes(ref(testEnv.unauthenticatedContext().storage(), EXISTING)));
  });

  it('denies a customer whose portal access has been revoked', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'customerAccounts', MINE),
        portalAccount('customer-mine', false),
      );
    });

    await assertFails(getBytes(ref(testEnv.authenticatedContext(MINE).storage(), EXISTING)));
  });

  it('lets the customer play back the voice message on their own order', async () => {
    const path = 'jobs/job-1/requirement/att-1.webm';

    await assertSucceeds(getBytes(ref(testEnv.authenticatedContext(MINE).storage(), path)));
    await assertFails(getBytes(ref(testEnv.authenticatedContext(THEIRS).storage(), path)));
  });
});
