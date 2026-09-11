import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    testTimeout: 10000,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/lib/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      // Measure every hand-written module. Files that are pure type
      // declarations or generated output are excluded, but nothing is excluded
      // merely because it is hard to test: an exclusion is a claim that the
      // file needs no coverage, and that claim should be visible in review.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/**/__tests__/**', 'src/**/*.test.{ts,tsx}', 'src/types/**'],
      // A ratchet, not a target. These floors sit just under the measured
      // baseline so a pull request that lowers coverage fails CI instead of
      // passing silently. Raise them as coverage improves; never lower one to
      // get a green build.
      thresholds: {
        lines: 30,
        statements: 29,
        functions: 28,
        branches: 25,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@bezamint/shared/types': path.resolve(__dirname, '../../packages/shared/src/types'),
      '@bezamint/shared/constants': path.resolve(__dirname, '../../packages/shared/src/constants'),
      '@bezamint/shared/utils': path.resolve(__dirname, '../../packages/shared/src/utils'),
      '@bezamint/shared': path.resolve(__dirname, '../../packages/shared/src/index'),
    },
  },
});
