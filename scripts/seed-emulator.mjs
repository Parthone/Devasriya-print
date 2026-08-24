#!/usr/bin/env node
/**
 * Seeds the Firebase Emulator Suite with accounts for manual testing.
 *
 * Development convenience only: it refuses to run against a real project, and
 * nothing it writes ever reaches production.
 *
 *   npm run emulators        # terminal 1
 *   npm run seed:emulator    # terminal 2
 *
 * Creates:
 *   owner@devasriya.test     password Owner@12345    active owner
 *   designer@devasriya.test  password Design@12345   active designer
 *   inactive@devasriya.test  password Inactive@123   deactivated employee
 *   ghost@devasriya.test     password Ghost@12345    auth account, no profile
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import process from 'node:process';

process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
const projectId = process.env.GCLOUD_PROJECT ?? 'demo-devasriya';

if (!projectId.startsWith('demo-')) {
  console.error(`\n  Refusing to seed project "${projectId}": use a demo- project id.\n`);
  process.exit(1);
}

const app = initializeApp({ projectId });
const auth = getAuth(app);
const db = getFirestore(app);

const ACCOUNTS = [
  {
    email: 'owner@devasriya.test',
    password: 'Owner@12345',
    profile: {
      name: 'Owner Account',
      mobile: '9876500001',
      designation: 'owner',
      department: 'management',
      role: 'owner',
      isActive: true,
    },
  },
  {
    email: 'designer@devasriya.test',
    password: 'Design@12345',
    profile: {
      name: 'Design Studio Staff',
      mobile: '9876500002',
      designation: 'graphic-designer',
      department: 'design',
      role: 'designer',
      isActive: true,
    },
  },
  {
    email: 'inactive@devasriya.test',
    password: 'Inactive@123',
    profile: {
      name: 'Deactivated Employee',
      mobile: '9876500003',
      designation: 'helper',
      department: 'finishing',
      role: 'viewer',
      isActive: false,
    },
  },
  // Deliberately has no profile document: used to verify that authentication
  // alone does not grant access to the application.
  { email: 'ghost@devasriya.test', password: 'Ghost@12345', profile: null },
];

async function upsertAccount({ email, password, profile }) {
  let user;
  try {
    user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { password });
  } catch {
    user = await auth.createUser({ email, password, emailVerified: true });
  }

  if (!profile) {
    await db.collection('users').doc(user.uid).delete();
    console.log(`  ${email.padEnd(26)} ${user.uid}  (no profile)`);
    return;
  }

  const now = new Date();
  await db
    .collection('users')
    .doc(user.uid)
    .set(
      {
        ...profile,
        email,
        createdAt: now,
        createdBy: user.uid,
        updatedAt: now,
        updatedBy: user.uid,
      },
      { merge: true },
    );
  console.log(`  ${email.padEnd(26)} ${user.uid}  ${profile.role}`);
}

async function main() {
  console.log(`\n  Seeding emulator project "${projectId}"\n`);
  for (const account of ACCOUNTS) {
    await upsertAccount(account);
  }
  console.log('\n  Done. Set VITE_USE_FIREBASE_EMULATORS=true in .env.local.\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
