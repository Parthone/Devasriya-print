import { z } from 'zod';

/**
 * Runtime environment parsing.
 *
 * Nothing here throws at import time - a missing `.env.local` must produce a
 * clear, actionable error at the point Firebase is first used, not a blank
 * screen during module evaluation (and not a failing test suite).
 */
const booleanish = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((value) => value === 'true' || value === '1');

const firebaseEnvSchema = z.object({
  VITE_FIREBASE_API_KEY: z.string().min(1, 'VITE_FIREBASE_API_KEY is required'),
  VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1, 'VITE_FIREBASE_AUTH_DOMAIN is required'),
  VITE_FIREBASE_PROJECT_ID: z.string().min(1, 'VITE_FIREBASE_PROJECT_ID is required'),
  VITE_FIREBASE_STORAGE_BUCKET: z.string().min(1, 'VITE_FIREBASE_STORAGE_BUCKET is required'),
  VITE_FIREBASE_MESSAGING_SENDER_ID: z
    .string()
    .min(1, 'VITE_FIREBASE_MESSAGING_SENDER_ID is required'),
  VITE_FIREBASE_APP_ID: z.string().min(1, 'VITE_FIREBASE_APP_ID is required'),
  VITE_FIREBASE_MEASUREMENT_ID: z.string().optional(),
});

export type RawEnv = Record<string, string | boolean | undefined>;

export interface FirebaseEnv {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

export type EnvParseResult =
  { ok: true; env: FirebaseEnv } | { ok: false; issues: string[]; message: string };

/** Parses and validates the Firebase environment variables. Never throws. */
export function parseFirebaseEnv(source: RawEnv = import.meta.env): EnvParseResult {
  const parsed = firebaseEnvSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message);
    return {
      ok: false,
      issues,
      message: [
        'Firebase configuration is missing or incomplete.',
        'Copy `.env.example` to `.env.local` and fill in the values from the Firebase console.',
        ...issues.map((issue) => `  - ${issue}`),
      ].join('\n'),
    };
  }

  const data = parsed.data;
  const env: FirebaseEnv = {
    apiKey: data.VITE_FIREBASE_API_KEY,
    authDomain: data.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: data.VITE_FIREBASE_PROJECT_ID,
    storageBucket: data.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: data.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: data.VITE_FIREBASE_APP_ID,
  };

  return {
    ok: true,
    env: data.VITE_FIREBASE_MEASUREMENT_ID
      ? { ...env, measurementId: data.VITE_FIREBASE_MEASUREMENT_ID }
      : env,
  };
}

/** True when the app should talk to the Firebase Emulator Suite. */
export function shouldUseEmulators(source: RawEnv = import.meta.env): boolean {
  return booleanish.parse(
    typeof source.VITE_USE_FIREBASE_EMULATORS === 'string'
      ? source.VITE_USE_FIREBASE_EMULATORS
      : undefined,
  );
}

export const IS_DEV = import.meta.env.DEV;
export const IS_PROD = import.meta.env.PROD;
