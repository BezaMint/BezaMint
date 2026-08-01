import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@bezamint/shared': path.resolve(__dirname, '../../packages/shared/src/index'),
      '@bezamint/shared/*': path.resolve(__dirname, '../../packages/shared/src/*'),
    },
  },
});
