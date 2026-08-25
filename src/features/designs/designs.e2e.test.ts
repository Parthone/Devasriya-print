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
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';

vi.stubEnv('VITE_FIREBASE_API_KEY', 'demo-api-key');
vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', `${PROJECT_ID}.firebaseapp.com`);
vi.stubEnv('VITE_FIREBASE_PROJECT_ID', PROJECT_ID);
vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', `${PROJECT_ID}.appspot.com`);
vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', '1234567890');
vi.stubEnv('VITE_FIREBASE_APP_ID', '1:1234567890:web:demoappid');
vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');

const { signInWithEmail, signOutCurrentUser } =
  await import('@/features/auth/services/auth.service');
const { findCustomerAccount } =
  await import('@/features/customer-portal/services/customer-account.service');
const { createJob, findJob, newJobId } = await import('@/features/jobs/services/job.service');
const { EMPTY_PICKUP } = await import('@/features/locations/types');
const {
  listDesignsForCustomer,
  listDesignsForJob,
  recordDesignDecision,
  submitDesignForReview,
  uploadDesign,
} = await import('@/features/designs/services/design.service');
const { approvedDesign, currentDesign, designIdFor } = await import('@/features/designs/types');
const { resolveDesignUrl } = await import('@/services/storage/design-storage.service');
const { AppError } = await import('@/types/common');

const adminApp = initializeAdminApp({ projectId: PROJECT_ID }, 'designs-e2e');
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminFirestore(adminApp);

const OWNER = { email: 'owner.m7@devasriya.test', password: 'Owner@12345', uid: '' };
const DESIGNER = { email: 'design.m7@devasriya.test', password: 'Design@1234', uid: '' };
const SALES = { email: 'sales.m7@devasriya.test', password: 'Sales@12345', uid: '' };
const ACCOUNTS = { email: 'acct.m7@devasriya.test', password: 'Acct@123456', uid: '' };

/** Two portal customers, so isolation can actually be tested. */
const MINE = { email: 'mine.m7@customer.test', password: 'Mine@123456', uid: '' };
const THEIRS = { email: 'theirs.m7@customer.test', password: 'Theirs@1234', uid: '' };

const NOW = new Date('2026-08-24T10:00:00.000Z');
const CUSTOMER = { id: 'customer-m7-mine', name: 'Shreeji Traders', mobile: '9812300011' };
const OTHER_CUSTOMER = { id: 'customer-m7-theirs', name: 'Gupta Sweets', mobile: '9414300044' };

async function ensureAccount(account: { email: string; password: string; uid: string }) {
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
  return user.uid;
}

async function seedStaff(
  account: { email: string; password: string; uid: string },
  role: string,
): Promise<void> {
  const uid = await ensureAccount(account);
  await adminDb
    .collection('users')
    .doc(uid)
    .set({
      name: `${role} user`,
      email: account.email,
      mobile: '9876500011',
      designation: 'manager',
      department: 'management',
      role,
      isActive: true,
      createdAt: NOW,
      createdBy: uid,
      updatedAt: NOW,
      updatedBy: uid,
    });
}

async function seedCustomer(
  account: { email: string; password: string; uid: string },
  customer: { id: string; name: string },
): Promise<void> {
  const uid = await ensureAccount(account);
  await adminDb.collection('customerAccounts').doc(uid).set({
    customerId: customer.id,
    customerName: customer.name,
    email: account.email,
    preferredLanguage: 'hi',
    isActive: true,
    createdAt: NOW,
    createdBy: 'seed',
    updatedAt: NOW,
    updatedBy: 'seed',
  });
}

async function clearCollection(name: string): Promise<void> {
  const snapshot = await adminDb.collection(name).get();
  await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
}

function pngFile(bytes = 2048): Blob & { name?: string } {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
  return Object.assign(blob, { name: 'artwork.png' });
}

async function makeJob(customer: { id: string; name: string; mobile: string }) {
  return createJob({
    id: newJobId(),
    input: {
      customerId: customer.id,
      jobDate: NOW,
      title: 'Shop board',
      requirementText: 'Backlit board',
      priority: 'normal',
      expectedDeliveryDate: null,
      status: 'open',
      ...EMPTY_PICKUP,
    },
    customer,
    audio: null,
    actor: { uid: SALES.uid, name: 'Sales User' },
  });
}

beforeAll(async () => {
  await seedStaff(OWNER, 'owner');
  await seedStaff(DESIGNER, 'designer');
  await seedStaff(SALES, 'sales');
  await seedStaff(ACCOUNTS, 'accounts');
  await seedCustomer(MINE, CUSTOMER);
  await seedCustomer(THEIRS, OTHER_CUSTOMER);
});

afterAll(async () => {
  await signOutCurrentUser().catch(() => undefined);
  await deleteAdminApp(adminApp);
});

beforeEach(async () => {
  await signOutCurrentUser().catch(() => undefined);
  await clearCollection('jobs');
  await clearCollection('designs');
  await clearCollection('counters');
});

describe('uploading against the emulators', () => {
  it('writes the first version, its file and nothing else', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const job = await makeJob(CUSTOMER);

    await signInWithEmail(DESIGNER.email, DESIGNER.password);
    const design = await uploadDesign({
      job,
      existing: [],
      file: pngFile(),
      mimeType: 'image/png',
      originalFileName: 'board.png',
      designerNote: 'First pass',
      submitNow: true,
      actor: { uid: DESIGNER.uid, name: 'Designer User' },
    });

    expect(design.version).toBe(1);
    expect(design.id).toBe(designIdFor(job.id, 1));
    expect(design.status).toBe('submitted-for-review');

    // The file is really in the bucket, and readable through the service.
    await expect(resolveDesignUrl(design.file)).resolves.toContain('http');

    const stored = await listDesignsForJob(job.id);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.designerNote).toBe('First pass');
  });

  it('numbers revisions in order and gives each its own file', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const job = await makeJob(CUSTOMER);
    await signInWithEmail(DESIGNER.email, DESIGNER.password);
    const actor = { uid: DESIGNER.uid, name: 'Designer User' };

    const first = await uploadDesign({
      job,
      existing: [],
      file: pngFile(),
      mimeType: 'image/png',
      originalFileName: 'v1.png',
      submitNow: true,
      actor,
    });
    const second = await uploadDesign({
      job,
      existing: await listDesignsForJob(job.id),
      file: pngFile(4096),
      mimeType: 'image/png',
      originalFileName: 'v2.png',
      submitNow: true,
      actor,
    });

    expect([first.version, second.version]).toEqual([1, 2]);
    expect(first.file.storagePath).not.toBe(second.file.storagePath);

    const versions = await listDesignsForJob(job.id);
    expect(versions.map((design) => design.version)).toEqual([2, 1]);
    // The version that was still with the customer stepped aside, unanswered.
    expect(versions.find((design) => design.version === 1)?.status).toBe('superseded');
    expect(versions.find((design) => design.version === 1)?.decision).toBeNull();
    expect(currentDesign(versions)?.version).toBe(2);
  });

  it('refuses a file the review screen could not open', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const job = await makeJob(CUSTOMER);
    await signInWithEmail(DESIGNER.email, DESIGNER.password);

    const source = Object.assign(
      new Blob([new Uint8Array(64)], { type: 'application/postscript' }),
      { name: 'artwork.ai' },
    );

    await expect(
      uploadDesign({
        job,
        existing: [],
        file: source,
        // Deliberately mislabelled: the bucket checks the bytes it is handed,
        // not what the caller claims about them.
        mimeType: 'application/postscript' as never,
        originalFileName: 'artwork.ai',
        submitNow: true,
        actor: { uid: DESIGNER.uid, name: 'Designer User' },
      }),
    ).rejects.toBeInstanceOf(AppError);

    expect(await listDesignsForJob(job.id)).toHaveLength(0);
  });

  it('stops a role without designs:upload writing artwork at all', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const job = await makeJob(CUSTOMER);

    await expect(
      uploadDesign({
        job,
        existing: [],
        file: pngFile(),
        mimeType: 'image/png',
        originalFileName: 'sales.png',
        submitNow: true,
        actor: { uid: SALES.uid, name: 'Sales User' },
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe('the review conversation against the emulators', () => {
  async function jobWithVersion() {
    await signInWithEmail(SALES.email, SALES.password);
    const job = await makeJob(CUSTOMER);
    await signInWithEmail(DESIGNER.email, DESIGNER.password);
    const design = await uploadDesign({
      job,
      existing: [],
      file: pngFile(),
      mimeType: 'image/png',
      originalFileName: 'v1.png',
      designerNote: 'First pass',
      submitNow: false,
      actor: { uid: DESIGNER.uid, name: 'Designer User' },
    });
    await submitDesignForReview(design, { uid: DESIGNER.uid, name: 'Designer User' });
    // Read it back: the caller needs the version as it now stands, with the
    // customer, not the draft it was a moment ago.
    const sent = (await listDesignsForJob(job.id))[0];
    if (!sent) throw new Error('the version was not stored');
    return { job, design: sent };
  }

  it('lets the customer approve their own design, with the comment kept', async () => {
    const { job, design } = await jobWithVersion();

    await signInWithEmail(MINE.email, MINE.password);
    const sent = (await listDesignsForCustomer(CUSTOMER.id)).find((item) => item.id === design.id);
    expect(sent?.status).toBe('submitted-for-review');

    await recordDesignDecision({
      design: sent as NonNullable<typeof sent>,
      outcome: 'approved',
      comment: 'Approved, but please make the font size bigger.',
      source: 'customer',
      actor: { uid: MINE.uid, name: CUSTOMER.name },
      language: 'hi',
    });

    const answered = (await listDesignsForCustomer(CUSTOMER.id)).find(
      (item) => item.id === design.id,
    );
    expect(answered?.status).toBe('approved');
    expect(answered?.decision?.comment).toBe('Approved, but please make the font size bigger.');
    expect(answered?.decision?.source).toBe('customer');
    expect(answered?.decision?.byId).toBe(MINE.uid);
    expect(answered?.decision?.language).toBe('hi');

    // And that is the artwork Module 8 will send to production.
    await signInWithEmail(OWNER.email, OWNER.password);
    expect(approvedDesign(await listDesignsForJob(job.id))?.id).toBe(design.id);
  });

  it('keeps a change request and its comment when the revision arrives', async () => {
    const { job, design } = await jobWithVersion();

    await signInWithEmail(MINE.email, MINE.password);
    const sent = (await listDesignsForCustomer(CUSTOMER.id)).find((item) => item.id === design.id);
    await recordDesignDecision({
      design: sent as NonNullable<typeof sent>,
      outcome: 'changes-requested',
      comment: 'Please make the discount bigger.',
      source: 'customer',
      actor: { uid: MINE.uid, name: CUSTOMER.name },
    });

    await signInWithEmail(DESIGNER.email, DESIGNER.password);
    const second = await uploadDesign({
      job,
      existing: await listDesignsForJob(job.id),
      file: pngFile(3000),
      mimeType: 'image/png',
      originalFileName: 'v2.png',
      submitNow: true,
      actor: { uid: DESIGNER.uid, name: 'Designer User' },
    });

    const versions = await listDesignsForJob(job.id);
    const v1 = versions.find((item) => item.version === 1);
    expect(v1?.status).toBe('changes-requested');
    expect(v1?.decision?.comment).toBe('Please make the discount bigger.');
    expect(v1?.file.storagePath).not.toBe(second.file.storagePath);
    expect(currentDesign(versions)?.id).toBe(second.id);
  });

  it('records a staff-entered answer as staff, never as the customer', async () => {
    const { design } = await jobWithVersion();

    await signInWithEmail(SALES.email, SALES.password);
    await recordDesignDecision({
      design,
      outcome: 'rejected',
      comment: 'They rang to say no.',
      source: 'staff',
      actor: { uid: SALES.uid, name: 'Sales User' },
    });

    const stored = (await listDesignsForJob(design.jobId))[0];
    expect(stored?.status).toBe('rejected');
    expect(stored?.decision?.source).toBe('staff');
    expect(stored?.decision?.byId).toBe(SALES.uid);
  });

  it('refuses a staff answer dressed up as the customer', async () => {
    const { design } = await jobWithVersion();

    await signInWithEmail(SALES.email, SALES.password);
    await expect(
      recordDesignDecision({
        design,
        outcome: 'approved',
        comment: 'Pretending to be them.',
        source: 'customer',
        actor: { uid: SALES.uid, name: 'Sales User' },
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('never answers a version twice', async () => {
    const { design } = await jobWithVersion();

    await signInWithEmail(MINE.email, MINE.password);
    const sent = (await listDesignsForCustomer(CUSTOMER.id)).find((item) => item.id === design.id);
    await recordDesignDecision({
      design: sent as NonNullable<typeof sent>,
      outcome: 'approved',
      comment: 'Yes',
      source: 'customer',
      actor: { uid: MINE.uid, name: CUSTOMER.name },
    });
    const answered = (await listDesignsForCustomer(CUSTOMER.id)).find(
      (item) => item.id === design.id,
    );

    await expect(
      recordDesignDecision({
        design: answered as NonNullable<typeof answered>,
        outcome: 'rejected',
        comment: 'Changed our mind',
        source: 'customer',
        actor: { uid: MINE.uid, name: CUSTOMER.name },
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe('customers cannot reach each other', () => {
  it('serves one customer only their own designs', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const mineJob = await makeJob(CUSTOMER);
    const theirsJob = await makeJob(OTHER_CUSTOMER);

    await signInWithEmail(DESIGNER.email, DESIGNER.password);
    const actor = { uid: DESIGNER.uid, name: 'Designer User' };
    await uploadDesign({
      job: mineJob,
      existing: [],
      file: pngFile(),
      mimeType: 'image/png',
      originalFileName: 'mine.png',
      submitNow: true,
      actor,
    });
    await uploadDesign({
      job: theirsJob,
      existing: [],
      file: pngFile(),
      mimeType: 'image/png',
      originalFileName: 'theirs.png',
      submitNow: true,
      actor,
    });

    await signInWithEmail(MINE.email, MINE.password);
    const visible = await listDesignsForCustomer(CUSTOMER.id);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.jobId).toBe(mineJob.id);

    // Asking for the other customer's designs is refused by the database.
    await expect(listDesignsForCustomer(OTHER_CUSTOMER.id)).rejects.toBeInstanceOf(AppError);
    await expect(listDesignsForJob(theirsJob.id)).rejects.toBeInstanceOf(AppError);
  });

  it('lets a customer read their own order and refuses another one', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const mineJob = await makeJob(CUSTOMER);
    const theirsJob = await makeJob(OTHER_CUSTOMER);

    await signInWithEmail(MINE.email, MINE.password);
    expect((await findJob(mineJob.id))?.jobNumber).toBe(mineJob.jobNumber);
    await expect(findJob(theirsJob.id)).rejects.toBeInstanceOf(AppError);
  });

  it('shuts a revoked portal login out completely', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const job = await makeJob(CUSTOMER);
    await signInWithEmail(DESIGNER.email, DESIGNER.password);
    await uploadDesign({
      job,
      existing: [],
      file: pngFile(),
      mimeType: 'image/png',
      originalFileName: 'v1.png',
      submitNow: true,
      actor: { uid: DESIGNER.uid, name: 'Designer User' },
    });

    await adminDb.collection('customerAccounts').doc(MINE.uid).update({ isActive: false });

    await signInWithEmail(MINE.email, MINE.password);
    await expect(listDesignsForCustomer(CUSTOMER.id)).rejects.toBeInstanceOf(AppError);

    await adminDb.collection('customerAccounts').doc(MINE.uid).update({ isActive: true });
  });

  it('keeps the two kinds of principal apart', async () => {
    await signInWithEmail(MINE.email, MINE.password);
    const account = await findCustomerAccount(MINE.uid);
    expect(account?.customerId).toBe(CUSTOMER.id);

    // A customer uid has no employee profile, so no staff collection opens up.
    await expect(findCustomerAccount(THEIRS.uid)).rejects.toBeInstanceOf(AppError);

    // ... and a staff uid has no portal account.
    await signInWithEmail(DESIGNER.email, DESIGNER.password);
    expect(await findCustomerAccount(DESIGNER.uid)).toBeNull();
  });

  it('hides designs from a staff role without designs:view', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const job = await makeJob(CUSTOMER);
    await signInWithEmail(DESIGNER.email, DESIGNER.password);
    await uploadDesign({
      job,
      existing: [],
      file: pngFile(),
      mimeType: 'image/png',
      originalFileName: 'v1.png',
      submitNow: true,
      actor: { uid: DESIGNER.uid, name: 'Designer User' },
    });

    await signInWithEmail(ACCOUNTS.email, ACCOUNTS.password);
    await expect(listDesignsForJob(job.id)).rejects.toBeInstanceOf(AppError);
  });
});
