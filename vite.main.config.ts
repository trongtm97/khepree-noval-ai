import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@main': path.resolve(__dirname, 'src/main'),
      '@khepree/sdk': path.resolve(__dirname, '../KHEPREE/packages/sdk/src/index.ts'),
    },
  },
  build: {
    rollupOptions: {
      external: ['electron', 'better-sqlite3', 'playwright'],
    },
  },
});
