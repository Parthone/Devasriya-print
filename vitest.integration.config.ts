import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Integration and row level security tests.
 *
 * These run against a real PostgreSQL, through a real Supabase API, with the
 * real policies loaded - which is the only way to test row level security
 * honestly. They replace the Firebase emulator suites.
 *
 *   supabase start && supabase db reset      # terminal 1 (needs Docker)
 *   npm run test:integration                 # terminal 2
 *
 * Or point SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY at a staging project.
 * Without those variables every file skips itself with a clear message rather
 * than failing, so `npm run verify` stays runnable on a machine with no Docker.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
