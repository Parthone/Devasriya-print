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
    // Vendor baseline (React, Router, Query, Radix, Zod) sits around 550 kB
    // raw / 170 kB gzipped. Raise this only with a deliberate decision.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // The Firebase SDK is large and changes rarely - keeping it in its own
        // chunk means application deploys do not invalidate it in the browser
        // cache. Feature code is split per route via lazy imports instead.
        manualChunks(id) {
          if (id.includes('@firebase') || id.includes('node_modules/firebase/')) {
            return 'firebase';
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
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Security-rules tests need the Firestore emulator: npm run test:rules
    exclude: ['src/**/*.rules.test.ts', 'src/**/*.e2e.test.ts', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/**/*.d.ts'],
    },
  },
});
