/**
 * Release gate for Khepree license signing PUBLIC keys.
 *
 * Usage:
 *   node scripts/check-khepree-signing.mjs
 *   node scripts/check-khepree-signing.mjs --require-keys
 *   node scripts/check-khepree-signing.mjs --verify-bundle [.vite/build/main.js]
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectSigningKeysFromEnv,
  computeSigningKeyId,
  formatKeyIdsForLog,
  validatePublicKeySpkiBase64,
} from './khepree-signing-key-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generatedPath = path.join(root, 'src/main/khepree/generated/trusted-signing-keys.ts');
const defaultBundlePath = path.join(root, '.vite/build/main.js');

const requireKeys = process.argv.includes('--require-keys');
const verifyBundle = process.argv.includes('--verify-bundle');
const bundleArgIndex = process.argv.indexOf('--verify-bundle');
const bundlePath =
  bundleArgIndex >= 0 && process.argv[bundleArgIndex + 1] && !process.argv[bundleArgIndex + 1].startsWith('-')
    ? path.resolve(process.argv[bundleArgIndex + 1])
    : defaultBundlePath;

function parseGeneratedModule(source) {
  /** @type {Record<string, string>} */
  const map = {};
  const blockMatch = source.match(
    /KHEPREE_TRUSTED_SIGNING_KEYS_GENERATED[\s\S]*?\{([\s\S]*?)\}\s*as const/,
  );
  if (!blockMatch) {
    throw new Error('Could not parse generated trusted-signing-keys.ts.');
  }
  const pairRe = /'([a-f0-9]{16})'\s*:\s*'([A-Za-z0-9+/=]+)'/g;
  let match;
  while ((match = pairRe.exec(blockMatch[1])) !== null) {
    map[match[1]] = match[2];
  }
  return map;
}

function validateKeyMap(map, context) {
  const keyIds = Object.keys(map);
  for (const [keyId, spki] of Object.entries(map)) {
    validatePublicKeySpkiBase64(spki, `${context} keyId ${keyId}`);
    const derived = computeSigningKeyId(spki);
    if (derived !== keyId) {
      throw new Error(
        `${context}: keyId ${keyId} mismatch (SPKI fingerprint is ${derived}).`,
      );
    }
    if (keyId === 'dev-local') {
      throw new Error(`${context}: dev-local key must not appear in production artifacts.`);
    }
  }
  return keyIds;
}

function checkGeneratedModule() {
  if (!existsSync(generatedPath)) {
    throw new Error(
      `Missing ${path.relative(root, generatedPath)} — run scripts/generate-khepree-signing-keys.mjs first.`,
    );
  }
  const source = readFileSync(generatedPath, 'utf8');
  const embedded = parseGeneratedModule(source);
  const keyIds = validateKeyMap(embedded, 'generated module');

  if (requireKeys && keyIds.length === 0) {
    throw new Error(
      'No trusted signing keys embedded. Set KHEPREE_LICENSE_SIGNING_PUBLIC_KEY before packaging.',
    );
  }

  // Cross-check env vs generated when both are present (CI packaging should match).
  let envKeys = {};
  try {
    envKeys = collectSigningKeysFromEnv();
  } catch (error) {
    if (Object.keys(envKeys).length > 0 || process.env.KHEPREE_LICENSE_SIGNING_PUBLIC_KEY) {
      throw error;
    }
  }

  if (
    requireKeys &&
    Object.keys(envKeys).length > 0 &&
    Object.keys(embedded).length === 0
  ) {
    throw new Error(
      'Env signing keys are set but generated module is empty — run scripts/generate-khepree-signing-keys.mjs first.',
    );
  }

  for (const [keyId, spki] of Object.entries(envKeys)) {
    if (Object.keys(embedded).length === 0) {
      console.warn(
        `[khepree-signing] Env keyId ${keyId} ignored — generated module is empty (run generate before packaging).`,
      );
      continue;
    }
    if (embedded[keyId] !== spki) {
      throw new Error(
        `Env keyId ${keyId} does not match generated module — re-run generate script.`,
      );
    }
  }

  return keyIds;
}

function verifyBundleKeyIds(keyIds) {
  if (!existsSync(bundlePath)) {
    throw new Error(
      `Bundle not found at ${path.relative(root, bundlePath)} — run electron-forge package first.`,
    );
  }
  const bundle = readFileSync(bundlePath, 'utf8');

  if (requireKeys && keyIds.length === 0) {
    throw new Error('Cannot verify bundle: no trusted keyIds configured.');
  }

  for (const keyId of keyIds) {
    if (!bundle.includes(keyId)) {
      throw new Error(
        `Packaged main bundle missing expected keyId ${keyId} (${path.relative(root, bundlePath)}).`,
      );
    }
  }

  if (bundle.includes('dev-local')) {
    throw new Error('Packaged main bundle contains dev-local signing keyId — forbidden in production.');
  }

  console.log(
    `[khepree-signing] Bundle verified (${path.relative(root, bundlePath)}): keyIds ${formatKeyIdsForLog(keyIds)}`,
  );
}

try {
  const keyIds = checkGeneratedModule();
  console.log(
    `[khepree-signing] Generated module OK: keyIds ${formatKeyIdsForLog(keyIds)}`,
  );

  if (verifyBundle) {
    verifyBundleKeyIds(keyIds);
  } else if (requireKeys && existsSync(bundlePath)) {
    verifyBundleKeyIds(keyIds);
  }

  console.log('Khepree signing key check passed.');
} catch (error) {
  console.error(`[khepree-signing] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
