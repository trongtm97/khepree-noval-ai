import { KHEPREE_SECRET_KEYS } from '@shared/constants/khepree';
import type { SecretStorageService } from '../security/secret-storage-service';
import {
  SafeStorageUnavailableError,
  SecretStorageError,
} from '../security/errors';
import {
  KhepreeCredentialCorruptError,
  KhepreeSafeStorageRequiredError,
} from './errors';

/** In-memory access token only — never persisted plaintext. */
export interface KhepreeSessionSnapshot {
  hasAccessToken: boolean;
  accessExpiresAt: number | null;
  userId: string | null;
}

export class KhepreeSessionStore {
  private accessToken: string | null = null;
  private accessExpiresAt: number | null = null;
  private userId: string | null = null;

  constructor(private readonly secretStorage: SecretStorageService) {}

  getSnapshot(): KhepreeSessionSnapshot {
    return {
      hasAccessToken: this.accessToken != null,
      accessExpiresAt: this.accessExpiresAt,
      userId: this.userId,
    };
  }

  setAccessToken(token: string, expiresInSec: number, userId: string): void {
    this.accessToken = token;
    this.accessExpiresAt = Date.now() + expiresInSec * 1000;
    this.userId = userId;
  }

  getAccessToken(): string | null {
    if (!this.accessToken || !this.accessExpiresAt) return null;
    if (Date.now() >= this.accessExpiresAt - 30_000) {
      return null;
    }
    return this.accessToken;
  }

  clearAccessToken(): void {
    this.accessToken = null;
    this.accessExpiresAt = null;
  }

  hasRefreshToken(): boolean {
    const meta = this.secretStorage.getMeta(KHEPREE_SECRET_KEYS.refreshToken);
    return meta != null;
  }

  async saveRefreshToken(refreshToken: string, ownerId: string): Promise<void> {
    await this.assertSafeStorage();
    await this.secretStorage.replace({
      secretKey: KHEPREE_SECRET_KEYS.refreshToken,
      plainText: refreshToken,
      kind: 'app_token',
      ownerType: 'khepree_user',
      ownerId,
    });
  }

  async loadRefreshToken(): Promise<string | null> {
    if (!this.hasRefreshToken()) {
      return null;
    }

    try {
      const token = await this.secretStorage.getPlainText(KHEPREE_SECRET_KEYS.refreshToken);
      if (!token) {
        throw new KhepreeCredentialCorruptError('refresh_token');
      }
      return token;
    } catch (error) {
      if (error instanceof KhepreeCredentialCorruptError) {
        throw error;
      }
      if (error instanceof SafeStorageUnavailableError) {
        throw new KhepreeSafeStorageRequiredError();
      }
      if (error instanceof SecretStorageError) {
        throw new KhepreeCredentialCorruptError('refresh_token');
      }
      throw error;
    }
  }

  async clearRefreshToken(): Promise<void> {
    await this.secretStorage.delete(KHEPREE_SECRET_KEYS.refreshToken);
    this.clearAccessToken();
    this.userId = null;
  }

  private async assertSafeStorage(): Promise<void> {
    const health = await this.secretStorage.healthCheck();
    if (!health.available) {
      throw new KhepreeSafeStorageRequiredError();
    }
  }
}
