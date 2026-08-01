import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    globals: true,
    environment: 'node',
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
