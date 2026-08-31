import { randomUUID, generateKeyPairSync, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { KHEPREE_META_KEYS, KHEPREE_SECRET_KEYS } from '@shared/constants/khepree';
import type { DatabaseManager } from '../db/database-manager';
import type { SecretStorageService } from '../security/secret-storage-service';
import { logger } from '../logging/logger';

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

  getDeviceName(): string {
    const stored = this.getDb().appMeta.get(KHEPREE_META_KEYS.deviceName);
    if (stored) return stored;
    const hostname = process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? 'Windows PC';
    const name = `${hostname} — Khepree Novel AI`;
    this.getDb().appMeta.set(KHEPREE_META_KEYS.deviceName, name);
    return name;
  }

  async getOrCreateKeypair(): Promise<{ publicKeySpki: string; sign: (data: Buffer) => Buffer }> {
    const existing = await this.secretStorage.getPlainText(KHEPREE_SECRET_KEYS.devicePrivateKey);
    if (existing) {
      const privateKeyDer = Buffer.from(existing, 'base64');
      const keyObject = createPrivateKey({ key: privateKeyDer, format: 'der', type: 'pkcs8' });
      const publicKeySpki = createPublicKey(keyObject)
        .export({ format: 'der', type: 'spki' })
        .toString('base64');
      return {
        publicKeySpki,
        sign: (data: Buffer) => sign(null, data, keyObject),
      };
    }

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

  async getIdentity(): Promise<DeviceIdentity> {
    const keypair = await this.getOrCreateKeypair();
    return {
      installationId: this.getInstallationId(),
      deviceId: this.getDeviceId(),
      publicKeySpki: keypair.publicKeySpki,
    };
  }
}
