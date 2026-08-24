import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * End-to-end tests against the Firebase Emulator Suite.
 *
 * They drive the real application services (auth, profiles, provisioning)
 * against real Auth and Firestore emulators, with the deployed security rules
 * loaded: npm run test:emulator
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.e2e.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
