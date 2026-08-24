import { describe, expect, it } from 'vitest';

import { parseFirebaseEnv, shouldUseEmulators, type RawEnv } from '@/config/env';

const completeEnv: RawEnv = {
  VITE_FIREBASE_API_KEY: 'test-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'test-project',
  VITE_FIREBASE_STORAGE_BUCKET: 'test.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
  VITE_FIREBASE_APP_ID: '1:1234567890:web:abcdef',
};

describe('parseFirebaseEnv', () => {
  it('maps environment variables onto the Firebase options', () => {
    const result = parseFirebaseEnv(completeEnv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.env.projectId).toBe('test-project');
    expect(result.env.measurementId).toBeUndefined();
  });

  it('reports every missing variable instead of throwing', () => {
    const result = parseFirebaseEnv({ VITE_FIREBASE_API_KEY: 'only-this-one' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.length).toBe(5);
    expect(result.message).toContain('.env.local');
  });

  it('includes the measurement id only when it is set', () => {
    const result = parseFirebaseEnv({ ...completeEnv, VITE_FIREBASE_MEASUREMENT_ID: 'G-ABC123' });
    expect(result.ok && result.env.measurementId).toBe('G-ABC123');
  });
});

describe('shouldUseEmulators', () => {
  it('is off unless explicitly enabled', () => {
    expect(shouldUseEmulators({})).toBe(false);
    expect(shouldUseEmulators({ VITE_USE_FIREBASE_EMULATORS: 'false' })).toBe(false);
    expect(shouldUseEmulators({ VITE_USE_FIREBASE_EMULATORS: 'true' })).toBe(true);
  });
});
