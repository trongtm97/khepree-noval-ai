import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
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
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'tests/perf/**',
      // Real Google smoke — opt-in via npm run test:google-smoke only
      'tests/google-smoke/**',
      // Real Notebook grounding smoke — opt-in via npm run test:notebook-grounding-smoke only
      'tests/notebook-grounding-smoke/**',
    ],
  },
});
