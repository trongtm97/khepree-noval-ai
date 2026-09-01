/**
 * Release gate: ensure production license signing public key is configured.
 * Usage: node scripts/check-khepree-signing.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'src/main/khepree/config.ts');
const configSource = readFileSync(configPath, 'utf8');

const envKey = process.env.KHEPREE_LICENSE_SIGNING_PUBLIC_KEY?.trim();
const hasEnvKey = Boolean(envKey && envKey.length > 0);
const hasPinnedKeys = /KHEPREE_TRUSTED_SIGNING_KEYS[\s\S]*?['"][a-f0-9]{8,}['"]\s*:/.test(
  configSource,
);

if (!hasEnvKey && !hasPinnedKeys) {
  console.error(
    'Khepree signing key missing: set KHEPREE_LICENSE_SIGNING_PUBLIC_KEY or pin KHEPREE_TRUSTED_SIGNING_KEYS in src/main/khepree/config.ts before production release.',
  );
  process.exit(1);
}

console.log('Khepree signing key check passed.');
