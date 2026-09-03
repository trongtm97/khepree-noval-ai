/**
 * Ensure better-sqlite3 is ready for Electron before package/make.
 * v13+ ships N-API prebuilds under prebuilds/; legacy builds use build/Release/.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqliteRoot = path.join(root, 'node_modules', 'better-sqlite3');

function prebuildPath() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const platform =
    process.platform === 'win32'
      ? 'win32'
      : process.platform === 'darwin'
        ? 'darwin'
        : process.platform === 'linux'
          ? 'linux'
          : null;
  if (!platform) return null;
  return path.join(sqliteRoot, 'prebuilds', `${platform}-${arch}.node`);
}

function candidateBinaries() {
  return [
    path.join(sqliteRoot, 'build', 'Release', 'better_sqlite3.node'),
    prebuildPath(),
  ].filter((p) => p != null);
}

function hasBinary() {
  return candidateBinaries().some((file) => {
    try {
      return fs.statSync(file).size > 0;
    } catch {
      return false;
    }
  });
}

function tryRebuild() {
  execSync('npx @electron/rebuild -f -w better-sqlite3', {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  });
}

if (hasBinary() && process.env.KHEPREE_FORCE_NATIVE_REBUILD !== '1') {
  console.log('[ensure-electron-native] better-sqlite3 native binary present (prebuild or Release)');
  process.exit(0);
}

try {
  tryRebuild();
  if (!hasBinary()) {
    throw new Error('rebuild finished but no better-sqlite3 native binary found');
  }
  console.log('[ensure-electron-native] rebuilt better-sqlite3 for Electron');
} catch (error) {
  if (hasBinary()) {
    console.warn(
      '[ensure-electron-native] rebuild failed — continuing with existing binary.',
    );
    console.warn(
      'Install Visual Studio Build Tools (Desktop development with C++) to rebuild from source.',
    );
    process.exit(0);
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error('[ensure-electron-native] better-sqlite3 is not ready for packaging.');
  console.error(message);
  console.error('');
  console.error('Fix: install VS Build Tools, then run: npm run rebuild:electron-native');
  process.exit(1);
}
