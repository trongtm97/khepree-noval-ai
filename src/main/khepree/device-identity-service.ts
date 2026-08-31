import { randomUUID, generateKeyPairSync, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { KHEPREE_META_KEYS, KHEPREE_SECRET_KEYS } from '@shared/constants/khepree';
import type { DatabaseManager } from '../db/database-manager';
import type { SecretStorageService } from '../security/secret-storage-service';
import {
  SafeStorageUnavailableError,
  SecretStorageError,
} from '../security/errors';
import { logger } from '../logging/logger';
import {
  KhepreeCredentialCorruptError,
  KhepreeSafeStorageRequiredError,
} from './errors';
import {
  canonicalHeartbeatProof,
  type HeartbeatProofPayload,
} from './heartbeat-proof';

export interface DeviceIdentity {
  installationId: string;
  deviceId: string | null;
  publicKeySpki: string;
}

export class DeviceIdentityService {
  constructor(
    private readonly getDb: () => DatabaseManager,
    private readonly secretStorage: SecretStorageService,
  ) {}

  getInstallationId(): string {
    const db = this.getDb();
    const existing = db.appMeta.get(KHEPREE_META_KEYS.installationId);
    if (existing) {
      return existing;
    }
    const installationId = randomUUID();
    db.appMeta.set(KHEPREE_META_KEYS.installationId, installationId);
    logger.info('Generated Khepree installationId', { installationId });
    return installationId;
  }

  getDeviceId(): string | null {
    return this.getDb().appMeta.get(KHEPREE_META_KEYS.deviceId);
  }

  setDeviceId(deviceId: string): void {
    this.getDb().appMeta.set(KHEPREE_META_KEYS.deviceId, deviceId);
  }

  clearDeviceId(): void {
    this.getDb().appMeta.delete(KHEPREE_META_KEYS.deviceId);
  }

  getDeviceName(): string {
    const stored = this.getDb().appMeta.get(KHEPREE_META_KEYS.deviceName);
    if (stored) return stored;
    const hostname = process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? 'Windows PC';
    const name = `${hostname} — Khepree Novel AI`;
    this.getDb().appMeta.set(KHEPREE_META_KEYS.deviceName, name);
    return name;
  }

  hasStoredPrivateKey(): boolean {
    return this.secretStorage.getMeta(KHEPREE_SECRET_KEYS.devicePrivateKey) != null;
  }

  async getOrCreateKeypair(): Promise<{ publicKeySpki: string; sign: (data: Buffer) => Buffer }> {
    if (this.hasStoredPrivateKey()) {
      return this.loadKeypairFromStorage();
    }

    await this.assertSafeStorageForNewKey();
    return this.generateAndPersistKeypair();
  }

  async getIdentity(): Promise<DeviceIdentity> {
    const keypair = await this.getOrCreateKeypair();
    return {
      installationId: this.getInstallationId(),
      deviceId: this.getDeviceId(),
      publicKeySpki: keypair.publicKeySpki,
    };
  }

  async signHeartbeatProof(payload: HeartbeatProofPayload): Promise<string> {
    const keypair = await this.getOrCreateKeypair();
    const signature = keypair.sign(canonicalHeartbeatProof(payload));
    return signature.toString('base64url');
  }

  private async loadKeypairFromStorage(): Promise<{
    publicKeySpki: string;
    sign: (data: Buffer) => Buffer;
  }> {
    try {
      const existing = await this.secretStorage.getPlainText(KHEPREE_SECRET_KEYS.devicePrivateKey);
      if (!existing) {
        throw new KhepreeCredentialCorruptError('device_private_key');
      }
      return this.keypairFromPkcs8Base64(existing);
    } catch (error) {
      if (error instanceof KhepreeCredentialCorruptError) {
        throw error;
      }
      if (error instanceof SafeStorageUnavailableError) {
        throw new KhepreeSafeStorageRequiredError();
      }
      if (error instanceof SecretStorageError) {
        throw new KhepreeCredentialCorruptError('device_private_key');
      }
      throw error;
    }
  }

  private keypairFromPkcs8Base64(pkcs8Base64: string): {
    publicKeySpki: string;
    sign: (data: Buffer) => Buffer;
  } {
    try {
      const privateKeyDer = Buffer.from(pkcs8Base64, 'base64');
      const keyObject = createPrivateKey({ key: privateKeyDer, format: 'der', type: 'pkcs8' });
      const publicKeySpki = createPublicKey(keyObject)
        .export({ format: 'der', type: 'spki' })
        .toString('base64');
      return {
        publicKeySpki,
        sign: (data: Buffer) => sign(null, data, keyObject),
      };
    } catch {
      throw new KhepreeCredentialCorruptError('device_private_key');
    }
  }

  private async generateAndPersistKeypair(): Promise<{
    publicKeySpki: string;
    sign: (data: Buffer) => Buffer;
  }> {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const publicKeySpki = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    const privateKeyPkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' });

    await this.secretStorage.replace({
      secretKey: KHEPREE_SECRET_KEYS.devicePrivateKey,
      plainText: privateKeyPkcs8.toString('base64'),
      kind: 'other',
      ownerType: 'khepree_device',
      ownerId: this.getInstallationId(),
    });

    return {
      publicKeySpki,
      sign: (data: Buffer) => sign(null, data, privateKey),
    };
  }

  private async assertSafeStorageForNewKey(): Promise<void> {
    const health = await this.secretStorage.healthCheck();
    if (!health.available) {
      throw new KhepreeSafeStorageRequiredError();
    }
  }
}
