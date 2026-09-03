import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync, createPrivateKey, sign } from 'node:crypto';
import { computeSigningKeyId } from '@main/khepree/platform-lease';
import type { KhepreeSignedLeasePayload } from '@shared/schemas/khepree';

function exportEd25519SpkiBase64(): { keyId: string; publicKeySpki: string; privateKeyPkcs8: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeySpki = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  const privateKeyPkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  return {
    keyId: computeSigningKeyId(publicKeySpki),
    publicKeySpki,
    privateKeyPkcs8,
  };
}

function signLeasePayload(
  payload: KhepreeSignedLeasePayload,
  keys: { keyId: string; privateKeyPkcs8: string },
) {
  const privateKey = createPrivateKey({
    key: Buffer.from(keys.privateKeyPkcs8, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const ordered = {
    deviceId: payload.deviceId,
    entitlementId: payload.entitlementId,
    expiresAt: payload.expiresAt,
    features: Object.keys(payload.features)
      .sort()
      .reduce<Record<string, boolean>>((acc, key) => {
        acc[key] = payload.features[key] ?? false;
        return acc;
      }, {}),
    graceUntil: payload.graceUntil,
    heartbeatIntervalMs: payload.heartbeatIntervalMs,
    installationId: payload.installationId,
    iat: payload.iat,
    productId: payload.productId,
  };
  const message = Buffer.from(JSON.stringify(ordered), 'utf8');
  const signature = sign(null, message, privateKey).toString('base64url');
  return { payload, keyId: keys.keyId, signature };
}

describe('trusted signing keys (embedded map)', () => {
  const prodKeys = exportEd25519SpkiBase64();
  const legacyKeys = exportEd25519SpkiBase64();

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@main/khepree/generated/trusted-signing-keys');
    vi.resetModules();
    delete process.env.KHEPREE_DEV_MOCK;
  });

  it('resolveTrustedSigningKey returns embedded key for matching keyId', async () => {
    vi.doMock('@main/khepree/generated/trusted-signing-keys', () => ({
      KHEPREE_TRUSTED_SIGNING_KEYS_GENERATED: {
        [prodKeys.keyId]: prodKeys.publicKeySpki,
        [legacyKeys.keyId]: legacyKeys.publicKeySpki,
      },
      KHEPREE_TRUSTED_SIGNING_KEY_IDS: [prodKeys.keyId, legacyKeys.keyId],
    }));
    vi.doMock('electron', () => ({
      app: { isPackaged: true, getLocale: () => 'en-US' },
    }));

    const { resolveTrustedSigningKey } = await import('@main/khepree/config');
    expect(resolveTrustedSigningKey(prodKeys.keyId)).toBe(prodKeys.publicKeySpki);
    expect(resolveTrustedSigningKey(legacyKeys.keyId)).toBe(legacyKeys.publicKeySpki);
  });

  it('resolveTrustedSigningKey rejects unknown keyId when not in dev mock', async () => {
    vi.doMock('@main/khepree/generated/trusted-signing-keys', () => ({
      KHEPREE_TRUSTED_SIGNING_KEYS_GENERATED: { [prodKeys.keyId]: prodKeys.publicKeySpki },
      KHEPREE_TRUSTED_SIGNING_KEY_IDS: [prodKeys.keyId],
    }));
    vi.doMock('electron', () => ({
      app: { isPackaged: true, getLocale: () => 'en-US' },
    }));

    const { resolveTrustedSigningKey } = await import('@main/khepree/config');
    expect(resolveTrustedSigningKey('deadbeefdeadbeef')).toBeNull();
  });

  it('verifySignedLease accepts lease signed with embedded production key', async () => {
    vi.doMock('@main/khepree/generated/trusted-signing-keys', () => ({
      KHEPREE_TRUSTED_SIGNING_KEYS_GENERATED: { [prodKeys.keyId]: prodKeys.publicKeySpki },
      KHEPREE_TRUSTED_SIGNING_KEY_IDS: [prodKeys.keyId],
    }));
    vi.doMock('electron', () => ({
      app: { isPackaged: true, getLocale: () => 'en-US' },
    }));

    const { verifySignedLease } = await import('@main/khepree/lease-verifier');
    const payload: KhepreeSignedLeasePayload = {
      installationId: '11111111-1111-4111-8111-111111111111',
      deviceId: 'dev-device',
      productId: 'khepree-novel-ai',
      entitlementId: 'ent-test',
      features: { translation: true },
      iat: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      graceUntil: null,
    };
    const lease = signLeasePayload(payload, prodKeys);
    expect(() => verifySignedLease(lease)).not.toThrow();
  });

  it('assertPackagedSigningKeyConfigured throws when packaged build has no embedded keys', async () => {
    vi.doMock('@main/khepree/generated/trusted-signing-keys', () => ({
      KHEPREE_TRUSTED_SIGNING_KEYS_GENERATED: {},
      KHEPREE_TRUSTED_SIGNING_KEY_IDS: [],
    }));
    vi.doMock('electron', () => ({
      app: { isPackaged: true, getLocale: () => 'en-US' },
    }));

    const { assertPackagedSigningKeyConfigured } = await import('@main/khepree/config');
    expect(() => { assertPackagedSigningKeyConfigured(); }).toThrow(/missing embedded/i);
  });

  it('assertPackagedSigningKeyConfigured rejects dev-local key in packaged map', async () => {
    vi.doMock('@main/khepree/generated/trusted-signing-keys', () => ({
      KHEPREE_TRUSTED_SIGNING_KEYS_GENERATED: {
        'dev-local': prodKeys.publicKeySpki,
      },
      KHEPREE_TRUSTED_SIGNING_KEY_IDS: ['dev-local'],
    }));
    vi.doMock('electron', () => ({
      app: { isPackaged: true, getLocale: () => 'en-US' },
    }));

    const { assertPackagedSigningKeyConfigured } = await import('@main/khepree/config');
    expect(() => { assertPackagedSigningKeyConfigured(); }).toThrow(/dev-local/i);
  });

  it('dev mock signing key is not used when packaged even if KHEPREE_DEV_MOCK is set', async () => {
    vi.doMock('@main/khepree/generated/trusted-signing-keys', () => ({
      KHEPREE_TRUSTED_SIGNING_KEYS_GENERATED: { [prodKeys.keyId]: prodKeys.publicKeySpki },
      KHEPREE_TRUSTED_SIGNING_KEY_IDS: [prodKeys.keyId],
    }));
    vi.doMock('electron', () => ({
      app: { isPackaged: true, getLocale: () => 'en-US' },
    }));
    process.env.KHEPREE_DEV_MOCK = '1';

    const { resolveTrustedSigningKey, isKhepreeDevMockEnabled } = await import('@main/khepree/config');
    expect(isKhepreeDevMockEnabled()).toBe(false);
    expect(resolveTrustedSigningKey('dev-local')).toBeNull();
  });
});

describe('signing key build scripts', () => {
  const root = path.resolve(__dirname, '../../..');
  const generateScript = path.join(root, 'scripts/generate-khepree-signing-keys.mjs');
  const checkScript = path.join(root, 'scripts/check-khepree-signing.mjs');

  it('generate --require-production fails when no CI keys are set', () => {
    expect(() =>
      execFileSync(process.execPath, [generateScript, '--require-production'], {
        cwd: root,
        env: { ...process.env, KHEPREE_LICENSE_SIGNING_PUBLIC_KEY: '', KHEPREE_TRUSTED_SIGNING_KEYS_JSON: '' },
        stdio: 'pipe',
      }),
    ).toThrow();
  });

  it('generate embeds keyId derived from SPKI and check validates bundle', () => {
    const keys = exportEd25519SpkiBase64();
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'khepree-signing-test-'));
    const bundlePath = path.join(tmp, 'main.js');
    const generatedPath = path.join(root, 'src/main/khepree/generated/trusted-signing-keys.ts');
    const previousGenerated = existsSync(generatedPath)
      ? readFileSync(generatedPath, 'utf8')
      : null;

    execFileSync(process.execPath, [generateScript], {
      cwd: root,
      env: {
        ...process.env,
        KHEPREE_LICENSE_SIGNING_PUBLIC_KEY: keys.publicKeySpki,
        KHEPREE_TRUSTED_SIGNING_KEYS_JSON: '',
        KHEPREE_LICENSE_SIGNING_PUBLIC_KEY_LEGACY: '',
      },
      stdio: 'pipe',
    });

    const generated = readFileSync(generatedPath, 'utf8');
    expect(generated).toContain(`'${keys.keyId}'`);

    writeFileSync(bundlePath, `/* bundle */ const KEY = '${keys.keyId}';`, 'utf8');

    try {
      execFileSync(process.execPath, [checkScript, '--require-keys', '--verify-bundle', bundlePath], {
        cwd: root,
        env: {
          ...process.env,
          KHEPREE_LICENSE_SIGNING_PUBLIC_KEY: keys.publicKeySpki,
          KHEPREE_TRUSTED_SIGNING_KEYS_JSON: '',
          KHEPREE_LICENSE_SIGNING_PUBLIC_KEY_LEGACY: '',
        },
        stdio: 'pipe',
      });
    } finally {
      if (previousGenerated !== null) {
        writeFileSync(generatedPath, previousGenerated, 'utf8');
      } else {
        execFileSync(process.execPath, [generateScript], {
          cwd: root,
          env: {
            ...process.env,
            KHEPREE_LICENSE_SIGNING_PUBLIC_KEY: '',
            KHEPREE_TRUSTED_SIGNING_KEYS_JSON: '',
            KHEPREE_LICENSE_SIGNING_PUBLIC_KEY_LEGACY: '',
          },
          stdio: 'pipe',
        });
      }
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
