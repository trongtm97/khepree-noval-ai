import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDatabaseManager, closeDatabase, type DatabaseManager } from '@main/db/connection';
import { resolveAppPaths } from '@main/services/paths-service';
import { SecretStorageService } from '@main/security/secret-storage-service';
import type { SafeStorageBackend } from '@main/security/safe-storage-backend';
import { KhepreeAccessService } from '@main/khepree/khepree-access-service';
import { KhepreeHeartbeatService } from '@main/khepree/heartbeat-service';
import {
  mockKhepreeHeartbeatState,
  resetMockKhepreeApiStateForTests,
} from '@main/khepree/khepree-api-client';
import { setKhepreeProductAccessEnforcer } from '@main/khepree/product-access-boundary';
import { khepreeAccessInternals } from '../../helpers/khepree-service-internals';
import { lockProtectedJobsOnKhepreeRevocation } from '@main/khepree/licensing-job-guard';
import { JobService } from '@main/services/job-service';
import { resetJobServiceForTests, setJobServiceForTests } from '@main/services/job-service-singleton';

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
  powerMonitor: {
    on: vi.fn(),
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

function createService(tempRoot: string): {
  service: KhepreeAccessService;
  heartbeat: KhepreeHeartbeatService;
  db: DatabaseManager;
} {
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
  setKhepreeProductAccessEnforcer((feature) => { service.assertProductAccess(feature); });
  const heartbeat = new KhepreeHeartbeatService(service);
  return { service, heartbeat, db };
}

async function loginActive(service: KhepreeAccessService): Promise<void> {
  const loginPromise = service.startLogin();
  await vi.runAllTimersAsync();
  await loginPromise;
}

describe('Khepree heartbeat runtime (N05)', () => {
  let tempRoot: string;
  const pausedReasons: string[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    resetMockKhepreeApiStateForTests();
    resetJobServiceForTests();
    pausedReasons.length = 0;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-khepree-hb-'));
  });

  afterEach(() => {
    setKhepreeProductAccessEnforcer(null);
    resetJobServiceForTests();
    vi.useRealTimers();
    closeDatabase();
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // Windows lock
    }
  });

  it('heartbeat keeps ACTIVE when server returns ACTIVE', async () => {
    const { service } = createService(tempRoot);
    await loginActive(service);
    mockKhepreeHeartbeatState.nextStatus = 'ACTIVE';
    await service.handleHeartbeat();
    expect(service.getPublicState().status).toBe('ACTIVE');
    await service.shutdown();
  });

  it('device removed revokes runtime access and clears device id', async () => {
    const { service } = createService(tempRoot);
    service.setRuntimeRevocationHandler((reason) => pausedReasons.push(reason));
    await loginActive(service);
    expect(khepreeAccessInternals(service).deviceIdentity.getDeviceId()).not.toBeNull();
    mockKhepreeHeartbeatState.nextStatus = 'DEVICE_REMOVED';
    await service.handleHeartbeat();
    expect(service.getPublicState().status).toBe('DEVICE_REMOVED');
    expect(khepreeAccessInternals(service).deviceIdentity.getDeviceId()).toBeNull();
    expect(pausedReasons).toContain('DEVICE_REMOVED');
    await service.shutdown();
  });

  it('device blocked shows blocked state', async () => {
    const { service } = createService(tempRoot);
    service.setRuntimeRevocationHandler((reason) => pausedReasons.push(reason));
    await loginActive(service);
    mockKhepreeHeartbeatState.nextStatus = 'DEVICE_BLOCKED';
    await service.handleHeartbeat();
    expect(service.getPublicState().status).toBe('DEVICE_BLOCKED');
    expect(pausedReasons).toContain('DEVICE_BLOCKED');
    await service.shutdown();
  });

  it('entitlement suspended blocks paid workspace', async () => {
    const { service } = createService(tempRoot);
    service.setRuntimeRevocationHandler((reason) => pausedReasons.push(reason));
    await loginActive(service);
    mockKhepreeHeartbeatState.nextStatus = 'ENTITLEMENT_SUSPENDED';
    await service.handleHeartbeat();
    expect(service.getPublicState().status).toBe('ENTITLEMENT_SUSPENDED');
    expect(service.getPublicState().canUseWorkspace).toBe(false);
    expect(pausedReasons).toContain('ENTITLEMENT_SUSPENDED');
    await service.shutdown();
  });

  it('entitlement expired blocks workspace', async () => {
    const { service } = createService(tempRoot);
    await loginActive(service);
    mockKhepreeHeartbeatState.nextStatus = 'ENTITLEMENT_EXPIRED';
    await service.handleHeartbeat();
    expect(service.getPublicState().status).toBe('ENTITLEMENT_EXPIRED');
    expect(service.getPublicState().leaseValid).toBe(false);
    await service.shutdown();
  });

  it('session revoked clears session to AUTH_REQUIRED', async () => {
    const { service } = createService(tempRoot);
    service.setRuntimeRevocationHandler((reason) => pausedReasons.push(reason));
    await loginActive(service);
    mockKhepreeHeartbeatState.nextStatus = 'SESSION_REVOKED';
    await service.handleHeartbeat();
    expect(service.getPublicState().status).toBe('AUTH_REQUIRED');
    expect(service.getPublicState().signedIn).toBe(false);
    expect(pausedReasons).toContain('SESSION_REVOKED');
    await service.shutdown();
  });

  it('network transient keeps ACTIVE while lease valid', async () => {
    const { service } = createService(tempRoot);
    await loginActive(service);
    mockKhepreeHeartbeatState.networkFail = true;
    await service.handleHeartbeat();
    expect(service.getPublicState().status).toBe('ACTIVE');
    expect(service.getPublicState().heartbeatStatus).toBe('NETWORK_TEMPORARY');
    expect(service.getPublicState().leaseValid).toBe(true);
    await service.shutdown();
  });

  it('network error with expired lease enters OFFLINE_COLD_START', async () => {
    const { service } = createService(tempRoot);
    await loginActive(service);
    const internals = khepreeAccessInternals(service);
    if (internals.currentLease) {
      internals.currentLease.payload.expiresAt = new Date(Date.now() - 60_000).toISOString();
      internals.currentLease.payload.graceUntil = null;
    }
    mockKhepreeHeartbeatState.networkFail = true;
    await service.handleHeartbeat();
    expect(service.getPublicState().status).toBe('OFFLINE_COLD_START');
    expect(service.getPublicState().leaseValid).toBe(false);
    await service.shutdown();
  });

  it('triggerNow runs immediate validation when ACTIVE', async () => {
    const { service, heartbeat } = createService(tempRoot);
    await loginActive(service);
    mockKhepreeHeartbeatState.nextStatus = 'ACTIVE';
    heartbeat.triggerNow();
    await Promise.resolve();
    expect(service.getPublicState().status).toBe('ACTIVE');
    heartbeat.stop();
    await service.shutdown();
  });

  it('start() is idempotent — repeated start does not stack heartbeat ticks', async () => {
    const { service, heartbeat } = createService(tempRoot);
    const handleSpy = vi.spyOn(service, 'handleHeartbeat').mockResolvedValue(undefined);

    heartbeat.start();
    heartbeat.start();
    heartbeat.start();
    await Promise.resolve();

    expect(handleSpy).toHaveBeenCalledTimes(1);
    heartbeat.stop();
    await service.shutdown();
  });
});

describe('licensing job guard', () => {
  let tempRoot: string;
  let db: DatabaseManager;

  beforeEach(() => {
    resetJobServiceForTests();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-khepree-jobs-'));
    const paths = resolveAppPaths(tempRoot);
    fs.mkdirSync(paths.data, { recursive: true });
    fs.mkdirSync(paths.backups, { recursive: true });
    closeDatabase();
    db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
    setJobServiceForTests(new JobService(db));
  });

  afterEach(() => {
    setJobServiceForTests(null);
    resetJobServiceForTests();
    closeDatabase();
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // Windows lock
    }
  });

  it('pauses queued jobs at safe boundary without deleting rows', () => {
    const project = db.projects.create({
      title: 'Test',
      source_language: 'zh',
      target_language: 'vi',
    });
    const job = db.jobs.create({
      project_id: project.id,
      type: 'TRANSLATE',
      state: 'QUEUED',
      chapter_from: 1,
      chapter_to: 1,
      priority: 0,
    });
    const result = lockProtectedJobsOnKhepreeRevocation('DEVICE_REMOVED');
    expect(result.paused).toBe(1);
    const row = db.jobs.getById(job.id);
    expect(row?.state).toBe('PAUSED');
    expect(row?.paused_reason).toBe('khepree:DEVICE_REMOVED');
  });
});
