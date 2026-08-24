import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Firestore security-rules tests.
 *
 * These run against the Firestore emulator (which needs Java) and are kept in a
 * separate project from the jsdom unit tests:
 *   npm run test:rules
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
    include: ['src/**/*.rules.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
