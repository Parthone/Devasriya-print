import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

import { parseFirebaseEnv } from '@/config/env';
import { connectEmulatorsOnce } from '@/lib/firebase/emulators';

/**
 * Lazily-initialised Firebase singletons.
 *
 * Initialisation is deferred (rather than run at module import) so that a
 * missing `.env.local` fails with a readable error at the point of use, and so
 * that unit tests can import modules from this tree without booting Firebase.
 */
let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let firestoreInstance: Firestore | undefined;
let storageInstance: FirebaseStorage | undefined;

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;

  const existing = getApps()[0];
  if (existing) {
    app = existing;
    return app;
  }

  const result = parseFirebaseEnv();
  if (!result.ok) {
    throw new Error(result.message);
  }

  app = initializeApp(result.env);
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getFirebaseApp());
    connectEmulatorsOnce({ auth: authInstance });
  }
  return authInstance;
}

export function getDb(): Firestore {
  if (!firestoreInstance) {
    // Offline persistence keeps the shop floor usable through flaky
    // connections. It needs IndexedDB, which does not exist in Node - there the
    // SDK falls back to its in-memory cache.
    const canPersist = typeof indexedDB !== 'undefined';
    firestoreInstance = initializeFirestore(
      getFirebaseApp(),
      canPersist
        ? { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }
        : {},
    );
    connectEmulatorsOnce({ firestore: firestoreInstance });
  }
  return firestoreInstance;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!storageInstance) {
    storageInstance = getStorage(getFirebaseApp());
    connectEmulatorsOnce({ storage: storageInstance });
  }
  return storageInstance;
}

/** Test helper - drops the cached singletons. Not used by application code. */
export function resetFirebaseForTests(): void {
  app = undefined;
  authInstance = undefined;
  firestoreInstance = undefined;
  storageInstance = undefined;
}
