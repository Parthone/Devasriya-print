/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Vendor baseline (React, Router, Query, Radix, Zod) sits around 620 kB
    // raw / 190 kB gzipped. Raise this only with a deliberate decision.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // The Supabase SDK changes rarely - keeping it in its own chunk means
        // application deploys do not invalidate it in the browser cache.
        // Feature code is split per route via lazy imports instead.
        manualChunks(id) {
          if (id.includes('@supabase')) {
            return 'supabase';
          }
          if (id.includes('node_modules')) {
            return 'vendor';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Component tests drive real forms and menus through userEvent, which types
    // character by character; the 5s default is tight once several files run in
    // parallel on a developer laptop.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Row level security tests need a real database: npm run test:integration
    exclude: ['src/**/*.integration.test.ts', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/**/*.d.ts'],
    },
  },
});
