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

vi.stubEnv('VITE_FIREBASE_API_KEY', 'demo-api-key');
vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', `${PROJECT_ID}.firebaseapp.com`);
vi.stubEnv('VITE_FIREBASE_PROJECT_ID', PROJECT_ID);
vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', `${PROJECT_ID}.appspot.com`);
vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', '1234567890');
vi.stubEnv('VITE_FIREBASE_APP_ID', '1:1234567890:web:demoappid');
vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');

const { signInWithEmail, signOutCurrentUser } =
  await import('@/features/auth/services/auth.service');
const { createCustomer, listCustomers, findCustomer, updateCustomer, setCustomerArchived } =
  await import('@/features/customers/services/customer.service');
const { normaliseCustomerValues } = await import('@/features/customers/types');
const { AppError } = await import('@/types/common');

const adminApp = initializeAdminApp({ projectId: PROJECT_ID }, 'customers-e2e');
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminFirestore(adminApp);

const SALES = { email: 'sales.e2e@devasriya.test', password: 'Sales@12345', uid: '' };
const VIEWER = { email: 'viewer.e2e@devasriya.test', password: 'Viewer@1234', uid: '' };

const BASE_VALUES = {
  name: 'Ravi Kumar',
  businessName: 'Kumar Prints',
  type: 'individual' as const,
  mobile: '+91 98765 00001',
  alternateMobile: '',
  email: 'Ravi@Example.com',
  address: '12 Station Road',
  city: 'Jaipur',
  state: 'Rajasthan' as const,
  pincode: '302001',
  gstin: '08aabcu9603r1zm',
  preferredLanguage: 'hi' as const,
  notes: 'Walk-in customer',
  isArchived: false,
};

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

  const now = new Date();
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
      createdAt: now,
      createdBy: user.uid,
      updatedAt: now,
      updatedBy: user.uid,
    });
}

beforeAll(async () => {
  await seedStaff(SALES, 'sales');
  await seedStaff(VIEWER, 'viewer');
});

afterAll(async () => {
  await signOutCurrentUser().catch(() => undefined);
  await deleteAdminApp(adminApp);
});

beforeEach(async () => {
  await signOutCurrentUser().catch(() => undefined);
  const existing = await adminDb.collection('customers').get();
  await Promise.all(existing.docs.map((document) => document.ref.delete()));
});

describe('customer records against the emulators', () => {
  it('creates, reads back and lists a customer', async () => {
    await signInWithEmail(SALES.email, SALES.password);

    const created = await createCustomer(normaliseCustomerValues(BASE_VALUES), SALES.uid);

    expect(created.mobile).toBe('9876500001');
    expect(created.gstin).toBe('08AABCU9603R1ZM');
    expect(created.email).toBe('ravi@example.com');

    const stored = await adminDb.collection('customers').doc(created.id).get();
    expect(stored.data()).toMatchObject({
      name: 'Ravi Kumar',
      nameLower: 'ravi kumar',
      portalUserId: null,
      createdBy: SALES.uid,
      isArchived: false,
    });

    const fetched = await findCustomer(created.id);
    expect(fetched?.name).toBe('Ravi Kumar');

    const directory = await listCustomers();
    expect(directory.customers.map((customer) => customer.id)).toContain(created.id);
    expect(directory.capReached).toBe(false);
  });

  it('updates a customer and clears optional fields instead of storing blanks', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const created = await createCustomer(normaliseCustomerValues(BASE_VALUES), SALES.uid);

    await updateCustomer(
      created.id,
      normaliseCustomerValues({
        ...BASE_VALUES,
        name: 'Ravi Kumar Sharma',
        businessName: '',
        gstin: '',
        notes: '',
      }),
      SALES.uid,
    );

    const updated = await findCustomer(created.id);
    expect(updated?.name).toBe('Ravi Kumar Sharma');
    expect(updated?.nameLower).toBe('ravi kumar sharma');
    expect(updated?.businessName).toBeUndefined();
    expect(updated?.gstin).toBeUndefined();

    const raw = await adminDb.collection('customers').doc(created.id).get();
    expect(Object.keys(raw.data() ?? {})).not.toContain('gstin');
  });

  it('archives and restores instead of deleting', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const created = await createCustomer(normaliseCustomerValues(BASE_VALUES), SALES.uid);

    await setCustomerArchived(created.id, true, SALES.uid);
    expect((await findCustomer(created.id))?.isArchived).toBe(true);

    await setCustomerArchived(created.id, false, SALES.uid);
    expect((await findCustomer(created.id))?.isArchived).toBe(false);

    // The record is still there either way.
    expect((await adminDb.collection('customers').doc(created.id).get()).exists).toBe(true);
  });

  it('never overwrites the reserved customer portal link on an ordinary edit', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const created = await createCustomer(normaliseCustomerValues(BASE_VALUES), SALES.uid);

    // Simulate the future portal module attaching an account.
    await adminDb
      .collection('customers')
      .doc(created.id)
      .update({ portalUserId: 'portal-auth-uid' });

    await updateCustomer(
      created.id,
      normaliseCustomerValues({ ...BASE_VALUES, city: 'Udaipur' }),
      SALES.uid,
    );

    const raw = await adminDb.collection('customers').doc(created.id).get();
    expect(raw.data()?.city).toBe('Udaipur');
    expect(raw.data()?.portalUserId).toBe('portal-auth-uid');
  });
});

describe('customer permissions against the emulators', () => {
  it('lets a viewer read the directory but not create a customer', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const created = await createCustomer(normaliseCustomerValues(BASE_VALUES), SALES.uid);

    await signInWithEmail(VIEWER.email, VIEWER.password);

    const directory = await listCustomers();
    expect(directory.customers.map((customer) => customer.id)).toContain(created.id);

    await expect(
      createCustomer(normaliseCustomerValues(BASE_VALUES), VIEWER.uid),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('stops a viewer editing or archiving a customer', async () => {
    await signInWithEmail(SALES.email, SALES.password);
    const created = await createCustomer(normaliseCustomerValues(BASE_VALUES), SALES.uid);

    await signInWithEmail(VIEWER.email, VIEWER.password);

    await expect(
      updateCustomer(
        created.id,
        normaliseCustomerValues({ ...BASE_VALUES, name: 'Hijacked' }),
        VIEWER.uid,
      ),
    ).rejects.toBeInstanceOf(AppError);
    await expect(setCustomerArchived(created.id, true, VIEWER.uid)).rejects.toMatchObject({
      code: 'permission-denied',
    });

    const raw = await adminDb.collection('customers').doc(created.id).get();
    expect(raw.data()?.name).toBe('Ravi Kumar');
  });

  it('denies a signed-out client entirely', async () => {
    await signOutCurrentUser();
    await expect(listCustomers()).rejects.toBeInstanceOf(AppError);
  });
});
