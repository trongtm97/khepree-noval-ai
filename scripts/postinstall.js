/**
 * Post-install hook: rebuild native modules for Electron.
 * Runs `@electron/rebuild` if available; logs warning otherwise.
 */
import { execSync } from 'node:child_process';

try {
  execSync('npx @electron/rebuild -f -w better-sqlite3', {
    stdio: 'inherit',
    env: process.env,
  });
  console.log('[postinstall] better-sqlite3 rebuilt for Electron');
} catch {
  console.warn(
    '[postinstall] @electron/rebuild skipped or failed — run manually before packaging',
  );
}
