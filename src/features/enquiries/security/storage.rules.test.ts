import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

import { USER_ROLES, type UserRole } from '@/types/auth';

/**
 * Storage rules for requirement audio.
 *
 * Recordings are the only thing Storage holds, and access mirrors the
 * application permission matrix, resolved from the caller employee profile.
 */
let testEnv: RulesTestEnvironment;

const NOW = new Date('2026-08-24T10:00:00.000Z');
const AUDIO = new Uint8Array([1, 2, 3, 4]);
const AUDIO_META = { contentType: 'audio/webm' };

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

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    // Must match the emulator project: the Storage rules read the employee
    // profile out of Firestore, and that cross-service lookup resolves against
    // the project the emulator was started with (singleProjectMode).
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
    await uploadBytes(
      ref(context.storage(), 'enquiries/e1/requirement/att-existing.webm'),
      AUDIO,
      AUDIO_META,
    );
    await uploadBytes(
      ref(context.storage(), 'jobs/j1/requirement/att-existing.webm'),
      AUDIO,
      AUDIO_META,
    );
  });
});

describe('enquiry requirement audio', () => {
  const canUpload: UserRole[] = ['owner', 'admin', 'sales'];
  const cannotUpload: UserRole[] = ['designer', 'production', 'accounts', 'viewer'];

  it.each(canUpload)('lets %s upload a recording', async (role) => {
    const storage = testEnv.authenticatedContext(UID[role]).storage();
    await assertSucceeds(
      uploadBytes(ref(storage, `enquiries/e2/requirement/att-${role}.webm`), AUDIO, AUDIO_META),
    );
  });

  it.each(cannotUpload)('stops %s uploading a recording', async (role) => {
    const storage = testEnv.authenticatedContext(UID[role]).storage();
    await assertFails(
      uploadBytes(ref(storage, `enquiries/e2/requirement/att-${role}.webm`), AUDIO, AUDIO_META),
    );
  });

  it.each(['owner', 'admin', 'sales', 'designer', 'production', 'viewer'] as UserRole[])(
    'lets %s play an enquiry recording',
    async (role) => {
      const storage = testEnv.authenticatedContext(UID[role]).storage();
      await assertSucceeds(getBytes(ref(storage, 'enquiries/e1/requirement/att-existing.webm')));
    },
  );

  it('stops accounts reading enquiry audio, because it has no enquiries:view', async () => {
    const storage = testEnv.authenticatedContext(UID.accounts).storage();
    await assertFails(getBytes(ref(storage, 'enquiries/e1/requirement/att-existing.webm')));
  });

  it('denies a signed-out client', async () => {
    const storage = testEnv.unauthenticatedContext().storage();
    await assertFails(getBytes(ref(storage, 'enquiries/e1/requirement/att-existing.webm')));
    await assertFails(
      uploadBytes(ref(storage, 'enquiries/e2/requirement/att-x.webm'), AUDIO, AUDIO_META),
    );
  });

  it('refuses to overwrite an existing recording', async () => {
    const storage = testEnv.authenticatedContext(UID.sales).storage();
    await assertFails(
      uploadBytes(ref(storage, 'enquiries/e1/requirement/att-existing.webm'), AUDIO, AUDIO_META),
    );
  });

  it('refuses a file that is not audio', async () => {
    const storage = testEnv.authenticatedContext(UID.sales).storage();
    await assertFails(
      uploadBytes(ref(storage, 'enquiries/e2/requirement/att-doc.webm'), AUDIO, {
        contentType: 'application/pdf',
      }),
    );
  });

  it('refuses a recording over the size limit', async () => {
    const storage = testEnv.authenticatedContext(UID.sales).storage();
    const tooBig = new Uint8Array(5 * 1024 * 1024 + 1024);
    await assertFails(
      uploadBytes(ref(storage, 'enquiries/e2/requirement/att-big.webm'), tooBig, AUDIO_META),
    );
  });
});

describe('job requirement audio', () => {
  it.each(['owner', 'admin', 'sales', 'production'] as UserRole[])(
    'lets %s upload a job recording',
    async (role) => {
      const storage = testEnv.authenticatedContext(UID[role]).storage();
      await assertSucceeds(
        uploadBytes(ref(storage, `jobs/j2/requirement/att-${role}.webm`), AUDIO, AUDIO_META),
      );
    },
  );

  it.each(['designer', 'accounts', 'viewer'] as UserRole[])(
    'stops %s uploading a job recording',
    async (role) => {
      const storage = testEnv.authenticatedContext(UID[role]).storage();
      await assertFails(
        uploadBytes(ref(storage, `jobs/j2/requirement/att-${role}.webm`), AUDIO, AUDIO_META),
      );
    },
  );

  it.each(USER_ROLES)('lets %s play a job recording, including accounts', async (role) => {
    const storage = testEnv.authenticatedContext(UID[role]).storage();
    await assertSucceeds(getBytes(ref(storage, 'jobs/j1/requirement/att-existing.webm')));
  });

  it('gives accounts the converted job copy but not the enquiry original', async () => {
    const storage = testEnv.authenticatedContext(UID.accounts).storage();
    await assertSucceeds(getBytes(ref(storage, 'jobs/j1/requirement/att-existing.webm')));
    await assertFails(getBytes(ref(storage, 'enquiries/e1/requirement/att-existing.webm')));
  });
});

describe('everything else in storage', () => {
  it('stays denied, even for the owner', async () => {
    const storage = testEnv.authenticatedContext(UID.owner).storage();
    await assertFails(uploadBytes(ref(storage, 'designs/d1/proof.png'), AUDIO, AUDIO_META));
    await assertFails(uploadBytes(ref(storage, 'enquiries/e1/other/file.webm'), AUDIO, AUDIO_META));
    await assertFails(getBytes(ref(storage, 'invoices/inv-1.pdf')));
  });

  it('denies a deactivated employee', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', UID.sales), {
        ...staffProfile('sales'),
        isActive: false,
      });
    });

    const storage = testEnv.authenticatedContext(UID.sales).storage();
    await assertFails(getBytes(ref(storage, 'enquiries/e1/requirement/att-existing.webm')));
    await assertFails(
      uploadBytes(ref(storage, 'enquiries/e2/requirement/att-new.webm'), AUDIO, AUDIO_META),
    );
  });
});
