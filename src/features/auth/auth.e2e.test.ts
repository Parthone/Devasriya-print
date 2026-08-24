import {
  initializeApp as initializeAdminApp,
  deleteApp as deleteAdminApp,
} from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const PROJECT_ID = 'demo-devasriya';
const AUTH_EMULATOR = '127.0.0.1:9099';
const FIRESTORE_EMULATOR = '127.0.0.1:8080';

process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR;
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR;

vi.stubEnv('VITE_FIREBASE_API_KEY', 'demo-api-key');
vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', `${PROJECT_ID}.firebaseapp.com`);
vi.stubEnv('VITE_FIREBASE_PROJECT_ID', PROJECT_ID);
vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', `${PROJECT_ID}.appspot.com`);
vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', '1234567890');
vi.stubEnv('VITE_FIREBASE_APP_ID', '1:1234567890:web:demoappid');
vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');

const { signInWithEmail, signOutCurrentUser, sendPasswordSetupEmail, observeAuthState } =
  await import('@/features/auth/services/auth.service');
const { resolveSession } = await import('@/features/auth/session');
const { getUserProfile, listUserProfiles, setUserActive } =
  await import('@/features/users/services/user-profile.service');
const { createEmployee } = await import('@/features/users/services/employee.service');
const { getFirebaseAuth } = await import('@/lib/firebase/client');
const { AppError } = await import('@/types/common');

const adminApp = initializeAdminApp({ projectId: PROJECT_ID }, 'e2e-admin');
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminFirestore(adminApp);

const OWNER = { email: 'owner@devasriya.test', password: 'Owner@12345', uid: '' };
const STAFF = { email: 'designer@devasriya.test', password: 'Design@12345', uid: '' };
const INACTIVE = { email: 'inactive@devasriya.test', password: 'Inactive@123', uid: '' };
const GHOST = { email: 'ghost@devasriya.test', password: 'Ghost@12345', uid: '' };

interface SeedProfile {
  name: string;
  mobile: string;
  designation: string;
  department: string;
  role: string;
  isActive: boolean;
}

async function seedAccount(
  account: { email: string; password: string; uid: string },
  profile: SeedProfile | null,
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

  const ref = adminDb.collection('users').doc(user.uid);
  if (!profile) {
    await ref.delete();
    return;
  }

  const now = new Date();
  await ref.set({
    ...profile,
    email: account.email,
    createdAt: now,
    createdBy: user.uid,
    updatedAt: now,
    updatedBy: user.uid,
  });
}

/** Reads password reset links straight out of the Auth emulator. */
async function fetchOobCodes(): Promise<{ email: string; requestType: string }[]> {
  const response = await fetch(
    `http://${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/oobCodes`,
  );
  const body = (await response.json()) as { oobCodes?: { email: string; requestType: string }[] };
  return body.oobCodes ?? [];
}

async function signInAndResolve(email: string, password: string) {
  const account = await signInWithEmail(email, password);
  const profile = await getUserProfile(account.uid);
  return resolveSession({ account, profile });
}

beforeAll(async () => {
  await seedAccount(OWNER, {
    name: 'Owner Account',
    mobile: '9876500001',
    designation: 'owner',
    department: 'management',
    role: 'owner',
    isActive: true,
  });
  await seedAccount(STAFF, {
    name: 'Design Studio Staff',
    mobile: '9876500002',
    designation: 'graphic-designer',
    department: 'design',
    role: 'designer',
    isActive: true,
  });
  await seedAccount(INACTIVE, {
    name: 'Deactivated Employee',
    mobile: '9876500003',
    designation: 'helper',
    department: 'finishing',
    role: 'viewer',
    isActive: false,
  });
  await seedAccount(GHOST, null);
});

afterAll(async () => {
  await signOutCurrentUser().catch(() => undefined);
  await deleteAdminApp(adminApp);
});

beforeEach(async () => {
  await signOutCurrentUser().catch(() => undefined);
});

describe('sign-in against the emulators', () => {
  it('admits an active employee with a profile', async () => {
    const session = await signInAndResolve(STAFF.email, STAFF.password);

    expect(session.status).toBe('authenticated');
    if (session.status !== 'authenticated') return;
    expect(session.user.name).toBe('Design Studio Staff');
    expect(session.user.isAdmin).toBe(false);
    expect(getFirebaseAuth().currentUser?.uid).toBe(STAFF.uid);
  });

  it('marks the owner as an administrator', async () => {
    const session = await signInAndResolve(OWNER.email, OWNER.password);
    expect(session.status === 'authenticated' && session.user.isAdmin).toBe(true);
  });

  it('rejects a wrong password without signing anyone in', async () => {
    await expect(signInWithEmail(STAFF.email, 'not-the-password')).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    expect(getFirebaseAuth().currentUser).toBeNull();
  });

  it('rejects an unknown email address', async () => {
    await expect(signInWithEmail('nobody@devasriya.test', 'whatever')).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it('rejects a deactivated employee even though the credentials are valid', async () => {
    const session = await signInAndResolve(INACTIVE.email, INACTIVE.password);
    expect(session).toMatchObject({ status: 'unauthenticated', rejection: 'inactive' });
  });

  it('rejects an authenticated account that has no profile document', async () => {
    const session = await signInAndResolve(GHOST.email, GHOST.password);
    expect(session).toMatchObject({ status: 'unauthenticated', rejection: 'no-profile' });
  });

  it('reports the signed-in account to auth state observers', async () => {
    await signInWithEmail(STAFF.email, STAFF.password);

    const uid = await new Promise<string | null>((resolve) => {
      const unsubscribe = observeAuthState((account) => {
        unsubscribe();
        resolve(account?.uid ?? null);
      });
    });

    expect(uid).toBe(STAFF.uid);
  });

  it('signs out and drops the session', async () => {
    await signInWithEmail(STAFF.email, STAFF.password);
    expect(getFirebaseAuth().currentUser).not.toBeNull();

    await signOutCurrentUser();
    expect(getFirebaseAuth().currentUser).toBeNull();
  });
});

describe('security rules through the client SDK', () => {
  it('lets an administrator read the whole directory', async () => {
    await signInWithEmail(OWNER.email, OWNER.password);
    const profiles = await listUserProfiles();
    expect(profiles.map((profile) => profile.email)).toEqual(
      expect.arrayContaining([OWNER.email, STAFF.email, INACTIVE.email]),
    );
  });

  it('stops staff listing the directory', async () => {
    await signInWithEmail(STAFF.email, STAFF.password);
    await expect(listUserProfiles()).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('stops staff reading another employee profile', async () => {
    await signInWithEmail(STAFF.email, STAFF.password);
    expect(await getUserProfile(OWNER.uid)).toBeNull();
    expect(await getUserProfile(STAFF.uid)).not.toBeNull();
  });

  it('stops staff editing their own role', async () => {
    await signInWithEmail(STAFF.email, STAFF.password);
    await expect(setUserActive(STAFF.uid, false, STAFF.uid)).rejects.toBeInstanceOf(AppError);
  });
});

describe('creating an employee from the browser', () => {
  const newEmployee = {
    name: 'Ravi Kumar',
    email: 'ravi.kumar@devasriya.test',
    mobile: '9876543210',
    designation: 'machine-operator' as const,
    department: 'printing' as const,
    role: 'production' as const,
    isActive: true,
  };

  beforeEach(async () => {
    await adminAuth
      .getUserByEmail(newEmployee.email)
      .then((user) => adminAuth.deleteUser(user.uid))
      .catch(() => undefined);
  });

  it('creates the account and profile while keeping the admin signed in', async () => {
    await signInWithEmail(OWNER.email, OWNER.password);

    const profile = await createEmployee(newEmployee, OWNER.uid);

    // The administrator session survived the secondary-app provisioning.
    expect(getFirebaseAuth().currentUser?.uid).toBe(OWNER.uid);

    const created = await adminAuth.getUserByEmail(newEmployee.email);
    expect(profile.id).toBe(created.uid);

    const stored = await adminDb.collection('users').doc(created.uid).get();
    expect(stored.exists).toBe(true);
    expect(stored.data()).toMatchObject({
      name: 'Ravi Kumar',
      mobile: '9876543210',
      role: 'production',
      isActive: true,
      createdBy: OWNER.uid,
    });
    // The document never stores a password and never stores its own id.
    expect(Object.keys(stored.data() ?? {})).not.toContain('password');
    expect(Object.keys(stored.data() ?? {})).not.toContain('id');
  });

  it('emails the new employee a password setup link', async () => {
    await signInWithEmail(OWNER.email, OWNER.password);
    await createEmployee(newEmployee, OWNER.uid);

    const codes = await fetchOobCodes();
    const forNewEmployee = codes.filter((code) => code.email === newEmployee.email);
    expect(forNewEmployee.length).toBeGreaterThan(0);
    expect(forNewEmployee.at(-1)?.requestType).toBe('PASSWORD_RESET');
  });

  it('refuses to create staff when a non-admin is signed in', async () => {
    await signInWithEmail(STAFF.email, STAFF.password);

    await expect(createEmployee(newEmployee, STAFF.uid)).rejects.toMatchObject({
      code: 'conflict',
    });

    // The orphaned sign-in account is reported, not silently ignored.
    const orphan = await adminAuth.getUserByEmail(newEmployee.email);
    expect(orphan).toBeTruthy();
    const stored = await adminDb.collection('users').doc(orphan.uid).get();
    expect(stored.exists).toBe(false);
  });

  it('rejects a duplicate email address', async () => {
    await signInWithEmail(OWNER.email, OWNER.password);
    await createEmployee(newEmployee, OWNER.uid);

    await expect(createEmployee(newEmployee, OWNER.uid)).rejects.toBeInstanceOf(AppError);
  });
});

describe('deactivating an employee', () => {
  it('blocks the next sign-in and is reversible', async () => {
    await signInWithEmail(OWNER.email, OWNER.password);
    await setUserActive(STAFF.uid, false, OWNER.uid);

    const blocked = await signInAndResolve(STAFF.email, STAFF.password);
    expect(blocked).toMatchObject({ status: 'unauthenticated', rejection: 'inactive' });

    await signInWithEmail(OWNER.email, OWNER.password);
    await setUserActive(STAFF.uid, true, OWNER.uid);

    const restored = await signInAndResolve(STAFF.email, STAFF.password);
    expect(restored.status).toBe('authenticated');
  });

  it('stops an administrator deactivating their own account', async () => {
    await signInWithEmail(OWNER.email, OWNER.password);
    await expect(setUserActive(OWNER.uid, false, OWNER.uid)).rejects.toMatchObject({
      code: 'invalid-input',
    });
  });
});

describe('password reset', () => {
  it('queues a reset email for a registered address', async () => {
    await sendPasswordSetupEmail(STAFF.email);

    const codes = await fetchOobCodes();
    expect(codes.some((code) => code.email === STAFF.email)).toBe(true);
  });
});
