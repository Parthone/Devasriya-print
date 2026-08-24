import { connectAuthEmulator, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';

import { shouldUseEmulators } from '@/config/env';

/** Ports must match the `emulators` block in firebase.json. */
export const EMULATOR_PORTS = {
  auth: 9099,
  firestore: 8080,
  storage: 9199,
} as const;

const EMULATOR_HOST = '127.0.0.1';

const connected = {
  auth: false,
  firestore: false,
  storage: false,
};

/**
 * Connects a freshly created Auth instance to the emulator.
 *
 * Separate from `connectEmulatorsOnce` because secondary Firebase apps (used
 * for account provisioning) create their own Auth instance, which needs its own
 * connection even though the primary one is already connected.
 */
export function connectAuthEmulatorFor(auth: Auth): void {
  if (!shouldUseEmulators()) return;
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${EMULATOR_PORTS.auth}`, {
    disableWarnings: true,
  });
}

interface ConnectTargets {
  auth?: Auth;
  firestore?: Firestore;
  storage?: FirebaseStorage;
}

/**
 * Points the given SDK instances at the local Emulator Suite when
 * `VITE_USE_FIREBASE_EMULATORS=true`. Safe to call repeatedly - each service is
 * only connected once, because the SDK throws if it is already in use.
 */
export function connectEmulatorsOnce(targets: ConnectTargets): void {
  if (!shouldUseEmulators()) return;

  if (targets.auth && !connected.auth) {
    connectAuthEmulator(targets.auth, `http://${EMULATOR_HOST}:${EMULATOR_PORTS.auth}`, {
      disableWarnings: true,
    });
    connected.auth = true;
  }

  if (targets.firestore && !connected.firestore) {
    connectFirestoreEmulator(targets.firestore, EMULATOR_HOST, EMULATOR_PORTS.firestore);
    connected.firestore = true;
  }

  if (targets.storage && !connected.storage) {
    connectStorageEmulator(targets.storage, EMULATOR_HOST, EMULATOR_PORTS.storage);
    connected.storage = true;
  }
}
