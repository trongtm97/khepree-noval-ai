import { defineConfig, type Plugin } from 'vite';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function generateTrustedSigningKeysPlugin(): Plugin {
  return {
    name: 'generate-khepree-signing-keys',
    buildStart() {
      execFileSync(process.execPath, ['scripts/generate-khepree-signing-keys.mjs'], {
        cwd: path.resolve(__dirname),
        stdio: 'inherit',
      });
    },
  };
}

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@main': path.resolve(__dirname, 'src/main'),
      '@khepree/sdk': path.resolve(__dirname, 'vendor/@khepree/sdk/src/index.ts'),
    },
  },
  plugins: [generateTrustedSigningKeysPlugin()],
  build: {
    rollupOptions: {
      external: ['electron', 'better-sqlite3', 'playwright'],
    },
  },
});
