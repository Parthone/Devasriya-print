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
const { createEnquiry, findEnquiry, listEnquiries, newEnquiryId, addFollowUp, updateEnquiry } =
  await import('@/features/enquiries/services/enquiry.service');
const { convertEnquiryToJob } = await import('@/features/jobs/services/conversion.service');
const { createJob, findJob, listJobs, newJobId } =
  await import('@/features/jobs/services/job.service');
const { EMPTY_PICKUP } = await import('@/features/locations/types');
const { uploadRequirementAudio, resolveAudioUrl } =
  await import('@/services/storage/audio-storage.service');
const { AppError } = await import('@/types/common');

const adminApp = initializeAdminApp({ projectId: PROJECT_ID }, 'module4-e2e');
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminFirestore(adminApp);

const SALES = { email: 'sales.m4@devasriya.test', password: 'Sales@12345', uid: '' };
const DESIGNER = { email: 'designer.m4@devasriya.test', password: 'Design@1234', uid: '' };

const CUSTOMER = { id: 'customer-m4', name: 'Ravi Kumar', mobile: '9812300011' };
const NOW = new Date('2026-08-24T10:00:00.000Z');

/** A recording as the browser would hand it to the service. */
function fakeRecording() {
  const blob = new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], { type: 'audio/webm' });
  return {
    blob,
    url: '',
    mimeType: 'audio/webm',
    durationSeconds: 30,
    sizeBytes: blob.size,
    recordedAt: NOW,
  };
}

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

beforeAll(async () => {
  await seedStaff(SALES, 'sales');
  await seedStaff(DESIGNER, 'designer');
});

afterAll(async () => {
  await signOutCurrentUser().catch(() => undefined);
  await deleteAdminApp(adminApp);
});

beforeEach(async () => {
  await signOutCurrentUser().catch(() => undefined);
  await clearCollection('enquiries');
  await clearCollection('jobs');
  await clearCollection('counters');
});

async function createTestEnquiry(withAudio = false) {
  const id = newEnquiryId();
  const audio = withAudio
    ? await uploadRequirementAudio({
        owner: 'enquiries',
        ownerId: id,
        recording: fakeRecording(),
        uploadedById: SALES.uid,
      })
    : null;

  return createEnquiry({
    id,
    input: {
      customerId: CUSTOMER.id,
      enquiryDate: NOW,
      source: 'walk-in',
      requirementText: 'Wedding cards, 250 pieces, gold foil',
      nextFollowUpAt: null,
      status: 'new',
    },
    customer: CUSTOMER,
    audio,
    actor: actorFor(SALES, 'Sales User'),
  });
}

describe('enquiries against the emulators', () => {
  it('numbers enquiries in sequence for the financial year', async () => {
    await signInWithEmail(SALES.email, SALES.password);

    const first = await createTestEnquiry();
    const second = await createTestEnquiry();

    expect(first.enquiryNumber).toMatch(/^ENQ-\d{4}-0001$/);
    expect(second.enquiryNumber).toMatch(/^ENQ-\d{4}-0002$/);

    const yearKey = first.enquiryNumber.split('-')[1] ?? '';
    const counter = await adminDb.collection('counters').doc(`enquiries-${yearKey}`).get();
    expect(counter.data()?.value).toBe(2);
  });

  it('stores the customer snapshots and reads back through the directory', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const created = await createTestEnquiry();

    const stored = await findEnquiry(created.id);
    expect(stored).toMatchObject({
      customerId: CUSTOMER.id,
      customerName: 'Ravi Kumar',
      customerMobile: '9812300011',
      status: 'new',
      convertedJobId: null,
    });

    const directory = await listEnquiries();
    expect(directory.enquiries.map((enquiry) => enquiry.id)).toContain(created.id);
  });

  it('records follow-ups and moves a new enquiry to contacted', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const created = await createTestEnquiry();

    await addFollowUp(
      created,
      'Called the customer, sending samples',
      new Date('2026-09-01'),
      actorFor(SALES, 'Sales User'),
    );

    const updated = await findEnquiry(created.id);
    expect(updated?.followUps).toHaveLength(1);
    expect(updated?.followUps[0]?.note).toBe('Called the customer, sending samples');
    expect(updated?.status).toBe('contacted');
    expect(updated?.nextFollowUpAt).toBeInstanceOf(Date);
  });

  it('stops a designer creating or editing an enquiry', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const created = await createTestEnquiry();

    await signInWithEmail(DESIGNER.email, DESIGNER.password);
    await expect(createTestEnquiry()).rejects.toBeInstanceOf(AppError);
    await expect(
      addFollowUp(created, 'Not allowed', null, actorFor(DESIGNER, 'Designer')),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('refuses to let the edit form mark an enquiry converted', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const created = await createTestEnquiry();

    await expect(
      updateEnquiry({
        previous: created,
        input: {
          customerId: CUSTOMER.id,
          enquiryDate: NOW,
          source: 'walk-in',
          requirementText: created.requirementText,
          nextFollowUpAt: null,
          status: 'converted',
        },
        customer: CUSTOMER,
        actor: actorFor(SALES, 'Sales User'),
      }),
    ).rejects.toMatchObject({ code: 'invalid-input' });
  });
});

describe('conversion against the emulators', () => {
  it('writes the job and stamps the enquiry in one transaction', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const enquiry = await createTestEnquiry(true);

    const job = await convertEnquiryToJob({
      enquiry,
      title: 'Wedding cards for Ravi',
      jobDate: NOW,
      priority: 'urgent',
      expectedDeliveryDate: new Date('2026-09-10'),
      pickup: {
        pickupLocationId: 'loc-1',
        pickupLocationName: 'Main Press',
        contactPersonId: null,
        contactPersonName: 'Anita Verma',
        contactPersonMobile: '9000000002',
      },
      actor: actorFor(SALES, 'Sales User'),
    });

    const storedJob = await adminDb.collection('jobs').doc(job.id).get();
    expect(storedJob.exists).toBe(true);
    expect(storedJob.data()).toMatchObject({
      enquiryId: enquiry.id,
      enquiryNumber: enquiry.enquiryNumber,
      customerId: CUSTOMER.id,
      pickupLocationName: 'Main Press',
      contactPersonName: 'Anita Verma',
      status: 'open',
      assignedToId: null,
    });

    const storedEnquiry = await adminDb.collection('enquiries').doc(enquiry.id).get();
    expect(storedEnquiry.data()).toMatchObject({ status: 'converted', convertedJobId: job.id });
  });

  it('copies the recording to a job owned path and keeps its details', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const enquiry = await createTestEnquiry(true);
    const original = enquiry.requirementAudio;
    expect(original).not.toBeNull();

    const job = await convertEnquiryToJob({
      enquiry,
      title: 'Wedding cards',
      jobDate: NOW,
      priority: 'normal',
      expectedDeliveryDate: null,
      actor: actorFor(SALES, 'Sales User'),
    });

    const stored = await findJob(job.id);
    const copy = stored?.requirementAudio;
    expect(copy).toBeTruthy();
    expect(copy?.storagePath.startsWith(`jobs/${job.id}/requirement/`)).toBe(true);
    expect(copy?.storagePath).not.toBe(original?.storagePath);
    expect(copy?.mimeType).toBe(original?.mimeType);
    expect(copy?.durationSeconds).toBe(original?.durationSeconds);
    expect(copy?.sizeBytes).toBe(original?.sizeBytes);
    expect(copy?.uploadedById).toBe(original?.uploadedById);

    // The copied object really exists and is playable.
    expect(await resolveAudioUrl(copy!)).toContain(job.id);

    // The enquiry keeps its own recording, untouched.
    const storedEnquiry = await adminDb.collection('enquiries').doc(enquiry.id).get();
    expect(storedEnquiry.data()?.requirementAudio?.storagePath).toBe(original?.storagePath);
  });

  it('keeps the job copy when the enquiry recording is replaced afterwards', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const enquiry = await createTestEnquiry(true);

    const job = await convertEnquiryToJob({
      enquiry,
      title: 'Wedding cards',
      jobDate: NOW,
      priority: 'normal',
      expectedDeliveryDate: null,
      actor: actorFor(SALES, 'Sales User'),
    });
    const copyPath = (await findJob(job.id))?.requirementAudio?.storagePath;

    // A new recording replaces the one on the enquiry.
    const replacement = await uploadRequirementAudio({
      owner: 'enquiries',
      ownerId: enquiry.id,
      recording: fakeRecording(),
      uploadedById: SALES.uid,
    });
    await adminDb.collection('enquiries').doc(enquiry.id).update({ requirementAudio: replacement });

    const jobAfter = await findJob(job.id);
    expect(jobAfter?.requirementAudio?.storagePath).toBe(copyPath);
    expect(jobAfter?.requirementAudio?.storagePath).not.toBe(replacement.storagePath);
    expect(await resolveAudioUrl(jobAfter!.requirementAudio!)).toBeTruthy();
  });

  it('refuses a second conversion, even from a stale copy of the enquiry', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const enquiry = await createTestEnquiry();

    await convertEnquiryToJob({
      enquiry,
      title: 'First job',
      jobDate: NOW,
      priority: 'normal',
      expectedDeliveryDate: null,
      actor: actorFor(SALES, 'Sales User'),
    });

    await expect(
      convertEnquiryToJob({
        enquiry,
        title: 'Duplicate job',
        jobDate: NOW,
        priority: 'normal',
        expectedDeliveryDate: null,
        actor: actorFor(SALES, 'Sales User'),
      }),
    ).rejects.toMatchObject({ code: 'conflict' });

    const jobs = await adminDb.collection('jobs').where('enquiryId', '==', enquiry.id).get();
    expect(jobs.size).toBe(1);
  });

  it('leaves nothing behind when the conversion is refused', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const enquiry = await createTestEnquiry();

    await signInWithEmail(DESIGNER.email, DESIGNER.password);
    await expect(
      convertEnquiryToJob({
        enquiry,
        title: 'Not allowed',
        jobDate: NOW,
        priority: 'normal',
        expectedDeliveryDate: null,
        actor: actorFor(DESIGNER, 'Designer'),
      }),
    ).rejects.toBeInstanceOf(AppError);

    const storedEnquiry = await adminDb.collection('enquiries').doc(enquiry.id).get();
    expect(storedEnquiry.data()?.status).toBe('new');
    expect(storedEnquiry.data()?.convertedJobId).toBeNull();
    expect((await adminDb.collection('jobs').get()).size).toBe(0);
  });
});

describe('jobs against the emulators', () => {
  it('creates a direct job with its own number and no enquiry', async () => {
    await signInWithEmail(SALES.email, SALES.password);

    const job = await createJob({
      id: newJobId(),
      input: {
        customerId: CUSTOMER.id,
        jobDate: NOW,
        title: 'Festival labels',
        requirementText: 'Repeat order, same artwork',
        priority: 'normal',
        expectedDeliveryDate: null,
        status: 'open',
        ...EMPTY_PICKUP,
      },
      customer: CUSTOMER,
      audio: null,
      actor: actorFor(SALES, 'Sales User'),
    });

    expect(job.jobNumber).toMatch(/^JOB-\d{4}-0001$/);
    expect(job.enquiryId).toBeNull();

    const directory = await listJobs();
    expect(directory.jobs.map((entry) => entry.id)).toContain(job.id);
  });

  it('stops a designer creating a job', async () => {
    await signInWithEmail(DESIGNER.email, DESIGNER.password);

    await expect(
      createJob({
        id: newJobId(),
        input: {
          customerId: CUSTOMER.id,
          jobDate: NOW,
          title: 'Not allowed',
          requirementText: 'Nope',
          priority: 'normal',
          expectedDeliveryDate: null,
          status: 'open',
          ...EMPTY_PICKUP,
        },
        customer: CUSTOMER,
        audio: null,
        actor: actorFor(DESIGNER, 'Designer'),
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('numbers enquiries and jobs from separate counters', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const enquiry = await createTestEnquiry();
    const job = await convertEnquiryToJob({
      enquiry,
      title: 'Job from enquiry',
      jobDate: NOW,
      priority: 'normal',
      expectedDeliveryDate: null,
      actor: actorFor(SALES, 'Sales User'),
    });

    expect(enquiry.enquiryNumber).toMatch(/^ENQ-\d{4}-0001$/);
    expect(job.jobNumber).toMatch(/^JOB-\d{4}-0001$/);
  });
});
