import { defineConfig } from 'vite';
import path from 'node:path';

/** Child-process browser runner build (Node, not Electron renderer). */
export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    rollupOptions: {
      external: ['playwright', 'electron'],
    },
  },
});
