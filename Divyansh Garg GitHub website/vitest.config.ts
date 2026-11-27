import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', '.next/**'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      'server-only': resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
});
