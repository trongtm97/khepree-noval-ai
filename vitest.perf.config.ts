import { defineConfig } from 'vitest/config';
import path from 'node:path';

/** Perf suite only — not part of default `npm test`. */
export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@main': path.resolve(__dirname, 'src/main'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/perf/**/*.test.ts'],
    testTimeout: 240_000,
  },
});
