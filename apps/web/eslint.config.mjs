import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default [
  ...compat.extends('next/core-web-vitals'),
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', '.turbo/**'],
    rules: {
      // Logging through `console.log` is an escape hatch the UI layer should not
      // need; warnings and errors are still allowed so error boundaries and
      // instrumentation can report failures.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': 'off',
      '@next/next/no-img-element': 'off',
      'react/self-closing-comp': 'error',
    },
  },
  {
    // The structured logger and the request-logging middleware are the single
    // designated sinks for console output. Everything else must go through them
    // so redaction and log shaping stay in one place.
    files: ['src/lib/server/logger.ts', 'src/middleware.ts'],
    rules: {
      'no-console': 'off',
    },
  },
];
