import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shell } from 'electron';
import { createDatabaseManager, closeDatabase, type DatabaseManager } from '@main/db/connection';
import { resolveAppPaths } from '@main/services/paths-service';
import { SecretStorageService } from '@main/security/secret-storage-service';
import type { SafeStorageBackend } from '@main/security/safe-storage-backend';
import { KhepreeAccessService } from '@main/khepree/khepree-access-service';
import {
  mockKhepreeCheckoutState,
  resetMockKhepreeApiStateForTests,
} from '@main/khepree/khepree-api-client';
import { setKhepreeProductAccessEnforcer } from '@main/khepree/product-access-boundary';
import { KHEPREE_FEATURES } from '@shared/constants/khepree';
import { isAllowedKhepreeUrl } from '@main/khepree/external-links';

process.env.KHEPREE_DEV_MOCK = '1';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getVersion: () => '0.1.0-test',
    getLocale: () => 'en-US',
  },
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined),
  },
}));

function createXorBackend(): SafeStorageBackend {
  return {
    isAvailable() {
      return Promise.resolve(true);
    },
    encrypt(plainText: string) {
      const buf = Buffer.from(plainText, 'utf8');
      for (let i = 0; i < buf.length; i += 1) buf[i] ^= 0x5a;
      return Promise.resolve({ ciphertext: buf });
    },
    decrypt(encrypted: Buffer) {
      const buf = Buffer.from(encrypted);
      for (let i = 0; i < buf.length; i += 1) buf[i] ^= 0x5a;
      return Promise.resolve({ plaintext: buf.toString('utf8'), shouldReEncrypt: false });
    },
    getBackendName() {
      return 'test-xor';
    },
  };
}

function createService(tempRoot: string): { service: KhepreeAccessService; db: DatabaseManager } {
  const paths = resolveAppPaths(tempRoot);
  fs.mkdirSync(paths.data, { recursive: true });
  fs.mkdirSync(paths.backups, { recursive: true });
  closeDatabase();
  const db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
  const secretStorage = new SecretStorageService({
    backend: createXorBackend(),
    repository: db.secrets,
  });
  const service = new KhepreeAccessService(() => db, secretStorage);
  setKhepreeProductAccessEnforcer((feature) => service.assertProductAccess(feature));
  return { service, db };
}

async function loginActive(service: KhepreeAccessService): Promise<void> {
  const loginPromise = service.startLogin();
  await vi.runAllTimersAsync();
  await loginPromise;
}

function checkoutOpenCalls(): string[] {
  return vi.mocked(shell.openExternal).mock.calls
    .map((call) => String(call[0]))
    .filter((url) => url.includes('/checkout') || url.includes('checkout?'));
}

describe('Khepree checkout flow (N07)', () => {
  let tempRoot: string;
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.useFakeTimers();
    resetMockKhepreeApiStateForTests();
    vi.mocked(shell.openExternal).mockClear();
    for (const key of [
      'KHEPREE_MOCK_NO_ENTITLEMENT',
      'KHEPREE_MOCK_CHECKOUT_STATUS',
    ]) {
      envBackup[key] = process.env[key];
      delete process.env[key];
    }
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-khepree-n07-'));
  });

  afterEach(async () => {
    setKhepreeProductAccessEnforcer(null);
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.useRealTimers();
    closeDatabase();
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // Windows lock
    }
  });

  it('creates checkout and opens validated URL in browser', async () => {
    process.env.KHEPREE_MOCK_NO_ENTITLEMENT = '1';
    const { service } = createService(tempRoot);
    await loginActive(service);

    const state = await service.startCheckout('pro-90d');
    expect(state.checkoutPhase).toBe('waiting');
    expect(state.billing).toBe('checkout_pending');
    expect(state.checkoutCanReopen).toBe(true);
    expect(checkoutOpenCalls()).toHaveLength(1);
    const opened = checkoutOpenCalls()[0]!;
    expect(isAllowedKhepreeUrl(opened)).toBe(true);
    expect(opened).not.toContain('evil.example');
    await service.shutdown();
  });

  it('rejects bad plan at checkout create', async () => {
    const { service } = createService(tempRoot);
    await loginActive(service);

    const state = await service.startCheckout('bad-plan');
    expect(state.checkoutPhase).toBe('failed');
    expect(state.checkoutError?.code).toBe('INVALID_PLAN');
    expect(checkoutOpenCalls()).toHaveLength(0);
    await service.shutdown();
  });

  it('rejects blocked checkout URL from API', async () => {
    mockKhepreeCheckoutState.returnBadUrl = true;
    const { service } = createService(tempRoot);
    await loginActive(service);

    const state = await service.startCheckout('pro-90d');
    expect(state.checkoutPhase).toBe('failed');
    expect(state.checkoutError?.code).toBe('CHECKOUT_URL_BLOCKED');
    expect(checkoutOpenCalls()).toHaveLength(0);
    await service.shutdown();
  });

  it('polls pending then activates entitlement without restart', async () => {
    process.env.KHEPREE_MOCK_NO_ENTITLEMENT = '1';
    mockKhepreeCheckoutState.statusSequence = ['PENDING', 'ACCESS_ACTIVE'];
    mockKhepreeCheckoutState.statusIndex = 0;

    const { service } = createService(tempRoot);
    await loginActive(service);
    expect(service.getPublicState().status).toBe('FREE');

    await service.startCheckout('pro-90d');
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.runAllTimersAsync();

    const final = service.getPublicState();
    expect(final.status).toBe('ACTIVE');
    expect(final.checkoutPhase).toBe('idle');
    expect(final.features[KHEPREE_FEATURES.translation]).toBe(true);
    expect(final.canUseWorkspace).toBe(true);
    await service.shutdown();
  });

  it('handles paid but entitlement pending', async () => {
    process.env.KHEPREE_MOCK_NO_ENTITLEMENT = '1';
    mockKhepreeCheckoutState.statusSequence = ['PAID_ENTITLEMENT_PENDING'];
    mockKhepreeCheckoutState.statusIndex = 0;

    const { service } = createService(tempRoot);
    await loginActive(service);
    await service.startCheckout('pro-90d');
    await service.checkCheckoutNow();

    expect(service.getPublicState().checkoutPhase).toBe('confirming');
    expect(service.getPublicState().status).toBe('FREE');

    mockKhepreeCheckoutState.entitlementPendingAfterPayment = false;
    mockKhepreeCheckoutState.statusSequence = ['ACCESS_ACTIVE'];
    mockKhepreeCheckoutState.statusIndex = 0;
    await service.checkCheckoutNow();

    const final = service.getPublicState();
    expect(final.status).toBe('ACTIVE');
    await service.shutdown();
  });

  it('marks failed payment from API', async () => {
    process.env.KHEPREE_MOCK_CHECKOUT_STATUS = 'FAILED';
    const { service } = createService(tempRoot);
    await loginActive(service);
    await service.startCheckout('pro-90d');
    await service.checkCheckoutNow();

    const state = service.getPublicState();
    expect(state.checkoutPhase).toBe('failed');
    expect(state.checkoutError?.code).toBe('CHECKOUT_FAILED');
    await service.shutdown();
  });

  it('user cancel stops checkout polling', async () => {
    const { service } = createService(tempRoot);
    await loginActive(service);
    await service.startCheckout('pro-90d');
    const cancelled = await service.cancelCheckout();
    expect(cancelled.checkoutPhase).toBe('cancelled');
    expect(cancelled.billing).not.toBe('checkout_pending');
    await service.shutdown();
  });

  it('loads plan catalog from API without hard-coded authorization', async () => {
    const { service } = createService(tempRoot);
    await loginActive(service);
    const catalog = await service.getPlanCatalog();
    expect(catalog.plans.length).toBeGreaterThan(0);
    expect(catalog.plans.every((p: { accessTerm: string }) => p.accessTerm.length > 0)).toBe(true);
    expect(catalog.plans.some((p: { isUpgradeAvailable: boolean }) => p.isUpgradeAvailable)).toBe(true);
    await service.shutdown();
  });

  it('public state never exposes checkout URL or session id', async () => {
    const { service } = createService(tempRoot);
    await loginActive(service);
    await service.startCheckout('pro-90d');
    const json = JSON.stringify(service.getPublicState());
    expect(json).not.toMatch(/mock-checkout/);
    expect(json).not.toMatch(/account\.khepree\.com\/checkout/);
    await service.shutdown();
  });
});
