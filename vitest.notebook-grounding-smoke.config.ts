import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Real Notebook grounding smoke — NEVER part of default `npm test` / CI.
 * Requires KHEPREE_NOVEL_AI_NOTEBOOK_GROUNDING_SMOKE=1 (or KHEPREE_NOVEL_AI_GOOGLE_SMOKE=1)
 * + google-smoke.config.json
 */
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
    include: ['tests/notebook-grounding-smoke/**/*.test.ts'],
    testTimeout: 45 * 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
