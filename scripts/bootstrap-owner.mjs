#!/usr/bin/env node
/**
 * One-time bootstrap of the first owner account.
 *
 * The application itself can only create staff accounts when an administrator
 * is already signed in, so the very first account has to be created out of band
 * with the Admin SDK. Run this once per Firebase project.
 *
 * Against a real project:
 *   set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json
 *   npm run bootstrap:owner -- --email owner@example.com --name "Owner Name" \
 *     --mobile 9876543210 --project your-project-id
 *
 * Against the emulators (no credentials needed, emulators must be running):
 *   npm run bootstrap:owner:emulator -- --email owner@example.com \
 *     --name "Owner Name" --mobile 9876543210
 *
 * The service-account key is a secret. Keep it outside the repository; it is
 * covered by .gitignore, and it must never be committed.
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import process from 'node:process';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    args[key] = next && !next.startsWith('--') ? next : 'true';
  }
  return args;
}

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));

// `--emulator` targets the local Emulator Suite, so the same script can be used
// to bootstrap a development environment without any service-account key.
if (args.emulator === 'true') {
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  process.env.GCLOUD_PROJECT ??= args.project ?? 'demo-devasriya';
}

const email = (args.email ?? '').trim().toLowerCase();
const name = (args.name ?? '').trim();
const mobile = (args.mobile ?? '').replace(/\D/g, '').slice(-10);
const useEmulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
const projectId =
  args.project ??
  process.env.GCLOUD_PROJECT ??
  process.env.GOOGLE_CLOUD_PROJECT ??
  process.env.FIREBASE_PROJECT ??
  '';

if (!email || !name) fail('Usage: --email <email> --name "<full name>" [--mobile <10 digits>]');
if (mobile && !/^[6-9]\d{9}$/.test(mobile)) fail(`"${args.mobile}" is not a valid mobile number.`);

const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!useEmulator && !credentialsPath) {
  fail(
    'GOOGLE_APPLICATION_CREDENTIALS is not set. Point it at your service-account key file,\n' +
      '  or set FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST to bootstrap the emulators.',
  );
}

const appOptions = { projectId: projectId || undefined };
if (!useEmulator) {
  appOptions.credential = cert(JSON.parse(readFileSync(credentialsPath, 'utf8')));
}
if (!appOptions.projectId && !useEmulator) {
  appOptions.projectId = JSON.parse(readFileSync(credentialsPath, 'utf8')).project_id;
}
if (!appOptions.projectId) fail('No project id. Pass --project <project-id>.');

const app = initializeApp(appOptions);
const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  console.log(`\n  Project: ${appOptions.projectId}${useEmulator ? ' (emulator)' : ''}`);

  let user;
  try {
    user = await auth.getUserByEmail(email);
    console.log(`  Auth account already exists: ${user.uid}`);
  } catch {
    user = await auth.createUser({
      email,
      emailVerified: false,
      displayName: name,
      password: `Bootstrap!${Math.random().toString(36).slice(2)}A1`,
    });
    console.log(`  Created auth account: ${user.uid}`);
  }

  const now = new Date();
  const profileRef = db.collection('users').doc(user.uid);
  const existing = await profileRef.get();

  const profile = {
    name,
    email,
    mobile: mobile || '9999999999',
    designation: 'owner',
    department: 'management',
    role: 'owner',
    isActive: true,
    updatedAt: now,
    updatedBy: user.uid,
    ...(existing.exists ? {} : { createdAt: now, createdBy: user.uid }),
  };

  await profileRef.set(profile, { merge: true });
  console.log(`  ${existing.exists ? 'Updated' : 'Created'} owner profile users/${user.uid}`);

  const link = await auth.generatePasswordResetLink(email);
  console.log('\n  Password setup link (send this to the owner, it expires):\n');
  console.log(`  ${link}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
