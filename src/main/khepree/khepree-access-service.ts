import { shell } from 'electron';
import {
  KHEPREE_DEFAULT_HEARTBEAT_MS,
  KHEPREE_FEATURES,
  type KhepreeGatePhase,
  type KhepreeHeartbeatStatus,
} from '@shared/constants/khepree';
import type {
  KhepreeAccessState,
  KhepreeSignedLease,
  KhepreeUserDisplay,
  KhepreePlanDisplay,
  KhepreeEntitlementState,
  KhepreeBillingState,
} from '@shared/schemas/khepree';
import type { DatabaseManager } from '../db/database-manager';
import type { SecretStorageService } from '../security/secret-storage-service';
import { logger } from '../logging/logger';
import { DeviceIdentityService } from './device-identity-service';
import { KhepreeSessionStore } from './session-store';
import {
  createKhepreeApiClient,
  type KhepreeApiClient,
} from './khepree-api-client';
import { OAuthLoopbackServer } from './oauth-loopback-server';
import {
  getKhepreeApiBaseUrl,
  getKhepreeProductId,
  isKhepreeDevMockEnabled,
} from './config';
import { verifySignedLease, isLeaseCurrentlyValid } from './lease-verifier';
import {
  KhepreeAccessError,
  KhepreeDeviceLimitError,
  KhepreeNetworkError,
  KhepreeProductAccessDeniedError,
} from './errors';
import { openValidatedKhepreeUrl } from './external-links';

type AccessListener = (state: KhepreeAccessState) => void;

export class KhepreeAccessService {
  private readonly api: KhepreeApiClient;
  private readonly deviceIdentity: DeviceIdentityService;
  private readonly sessionStore: KhepreeSessionStore;
  private readonly oauthServer = new OAuthLoopbackServer();
  private readonly listeners = new Set<AccessListener>();

  private currentLease: KhepreeSignedLease | null = null;
  private user: KhepreeUserDisplay | null = null;
  private plan: KhepreePlanDisplay | null = null;
  private entitlement: KhepreeEntitlementState = 'none';
  private billing: KhepreeBillingState = 'none';
  private features: Record<string, boolean> = {};
  private devicesUsed: number | null = null;
  private devicesMax: number | null = null;
  private gate: KhepreeGatePhase = 'login';
  private heartbeatStatus: KhepreeHeartbeatStatus | null = null;
  private lastError: { code: string; message: string } | null = null;
  private loginInProgress = false;
  private coldStartComplete = false;
  private protectedActionsBlocked = false;
  private hasRefreshCredential = false;

  constructor(
    getDb: () => DatabaseManager,
    secretStorage: SecretStorageService,
  ) {
    this.api = createKhepreeApiClient(getKhepreeApiBaseUrl(), isKhepreeDevMockEnabled());
    this.deviceIdentity = new DeviceIdentityService(getDb, secretStorage);
    this.sessionStore = new KhepreeSessionStore(secretStorage);
  }

  subscribe(listener: AccessListener): () => void {
    this.listeners.add(listener);
    listener(this.getPublicState());
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const state = this.getPublicState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  getPublicState(): KhepreeAccessState {
    const leaseValid = isLeaseCurrentlyValid(this.currentLease);
    let leaseExpiresAt: string | null = null;
    let graceUntil: string | null = null;
    if (this.currentLease) {
      leaseExpiresAt = this.currentLease.payload.expiresAt;
      graceUntil = this.currentLease.payload.graceUntil;
    }

    return {
      gate: this.gate,
      signedIn: this.user != null && this.hasRefreshCredential,
      user: this.user,
      plan: this.plan,
      entitlement: this.entitlement,
      billing: this.billing,
      devicesUsed: this.devicesUsed,
      devicesMax: this.devicesMax,
      features: { ...this.features },
      leaseValid,
      leaseExpiresAt,
      graceUntil,
      heartbeatStatus: this.heartbeatStatus,
      error: this.lastError,
      canStartTranslation: this.canStartTranslation(),
      canUseWorkspace: this.canUseWorkspace(),
    };
  }

  private canUseWorkspace(): boolean {
    return (
      this.gate === 'workspace' &&
      this.coldStartComplete &&
      !this.protectedActionsBlocked &&
      isLeaseCurrentlyValid(this.currentLease)
    );
  }

  private canStartTranslation(): boolean {
    return (
      this.canUseWorkspace() &&
      this.features[KHEPREE_FEATURES.translation] &&
      this.entitlement === 'active'
    );
  }

  async initializeOnColdStart(): Promise<KhepreeAccessState> {
    this.gate = 'login';

    const hasRefresh = this.sessionStore.hasRefreshToken();
    this.hasRefreshCredential = hasRefresh;
    if (!hasRefresh) {
      this.gate = 'login';
      this.emit();
      return this.getPublicState();
    }

    try {
      await this.performColdStartValidation();
    } catch (error) {
      this.handleColdStartFailure(error);
    }
    this.emit();
    return this.getPublicState();
  }

  private async performColdStartValidation(): Promise<void> {
    const refreshToken = await this.sessionStore.loadRefreshToken();
    if (!refreshToken) {
      this.gate = 'login';
      return;
    }

    const identity = await this.deviceIdentity.getIdentity();
    let accessToken = this.sessionStore.getAccessToken();

    if (!accessToken) {
      const refreshed = await this.api.refreshSession({
        refreshToken,
        installationId: identity.installationId,
      });
      await this.sessionStore.saveRefreshToken(refreshed.refreshToken, refreshed.user.id);
      this.sessionStore.setAccessToken(
        refreshed.accessToken,
        refreshed.expiresIn,
        refreshed.user.id,
      );
      this.user = refreshed.user;
      accessToken = refreshed.accessToken;
    }

    const deviceId = identity.deviceId;
    if (!deviceId || !accessToken) {
      this.gate = 'login';
      return;
    }

    const result = await this.api.coldStartValidate({
      accessToken,
      installationId: identity.installationId,
      deviceId,
    });

    this.applyColdStartResult(result);
    this.gate = 'workspace';
    this.coldStartComplete = true;
    this.lastError = null;
  }

  private applyColdStartResult(result: {
    user: KhepreeUserDisplay;
    plan: KhepreePlanDisplay;
    entitlement: KhepreeEntitlementState;
    billing: KhepreeBillingState;
    features: Record<string, boolean>;
    lease: KhepreeSignedLease;
    devicesUsed: number;
    devicesMax: number;
  }): void {
    verifySignedLease(result.lease);
    this.user = result.user;
    this.plan = result.plan;
    this.entitlement = result.entitlement;
    this.billing = result.billing;
    this.features = result.features;
    this.currentLease = result.lease;
    this.devicesUsed = result.devicesUsed;
    this.devicesMax = result.devicesMax;
    this.protectedActionsBlocked = false;
  }

  private handleColdStartFailure(error: unknown): void {
    if (error instanceof KhepreeNetworkError) {
      this.gate = 'offline';
      this.lastError = { code: error.code, message: error.message };
      this.coldStartComplete = false;
      return;
    }
    if (error instanceof KhepreeDeviceLimitError) {
      this.gate = 'device_limit';
      this.devicesUsed = error.devicesUsed;
      this.devicesMax = error.devicesMax;
      this.lastError = { code: error.code, message: error.message };
      return;
    }
    logger.warn('Khepree cold start failed', {
      code: error instanceof KhepreeAccessError ? error.code : 'UNKNOWN',
      message: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof KhepreeAccessError && error.code === 'ENTITLEMENT_NONE') {
      this.gate = 'entitlement';
      this.entitlement = 'none';
      this.lastError = { code: error.code, message: error.message };
      return;
    }
    this.gate = 'login';
    this.lastError = {
      code: error instanceof KhepreeAccessError ? error.code : 'COLD_START_FAILED',
      message: error instanceof Error ? error.message : 'Cold start validation failed',
    };
  }

  async startLogin(): Promise<KhepreeAccessState> {
    if (this.loginInProgress) {
      return this.getPublicState();
    }
    this.loginInProgress = true;
    this.lastError = null;
    try {
      const identity = await this.deviceIdentity.getIdentity();
      const { redirectUri } = await this.oauthServer.start();
      const { authUrl, state } = await this.api.startDeviceAuth({
        installationId: identity.installationId,
        devicePublicKey: identity.publicKeySpki,
        productId: getKhepreeProductId(),
        redirectUri,
      });

      await shell.openExternal(authUrl);
      const callbackPromise = this.oauthServer.waitForCallback(state);
      const { code } = await callbackPromise;
      await this.oauthServer.stop();

      const tokens = await this.api.completeDeviceAuth({
        state,
        code,
        installationId: identity.installationId,
      });
      await this.sessionStore.saveRefreshToken(tokens.refreshToken, tokens.user.id);
      this.hasRefreshCredential = true;
      this.sessionStore.setAccessToken(tokens.accessToken, tokens.expiresIn, tokens.user.id);
      this.user = tokens.user;

      try {
        const activation = await this.api.activateDevice({
          accessToken: tokens.accessToken,
          installationId: identity.installationId,
          devicePublicKey: identity.publicKeySpki,
          deviceName: this.deviceIdentity.getDeviceName(),
        });
        this.deviceIdentity.setDeviceId(activation.deviceId);
        this.devicesUsed = activation.devicesUsed;
        this.devicesMax = activation.devicesMax;
      } catch (error) {
        if (error instanceof KhepreeDeviceLimitError) {
          this.gate = 'device_limit';
          this.devicesUsed = error.devicesUsed;
          this.devicesMax = error.devicesMax;
          this.lastError = { code: error.code, message: error.message };
          this.emit();
          return this.getPublicState();
        }
        throw error;
      }

      await this.performColdStartValidation();
      if (this.entitlement === 'none' || this.entitlement === 'expired') {
        this.gate = 'entitlement';
      } else {
        this.gate = 'workspace';
        this.coldStartComplete = true;
      }
    } catch (error) {
      await this.oauthServer.stop();
      this.lastError = {
        code: error instanceof KhepreeAccessError ? error.code : 'LOGIN_FAILED',
        message: error instanceof Error ? error.message : 'Login failed',
      };
      this.gate = 'login';
    } finally {
      this.loginInProgress = false;
      this.emit();
    }
    return this.getPublicState();
  }

  async retryColdStart(): Promise<KhepreeAccessState> {
    this.lastError = null;
    try {
      await this.performColdStartValidation();
      this.gate = 'workspace';
      this.coldStartComplete = true;
    } catch (error) {
      this.handleColdStartFailure(error);
    }
    this.emit();
    return this.getPublicState();
  }

  async retryActivation(): Promise<KhepreeAccessState> {
    const accessToken = await this.ensureAccessToken();
    if (!accessToken) {
      this.gate = 'login';
      this.emit();
      return this.getPublicState();
    }
    const identity = await this.deviceIdentity.getIdentity();
    try {
      const activation = await this.api.activateDevice({
        accessToken,
        installationId: identity.installationId,
        devicePublicKey: identity.publicKeySpki,
        deviceName: this.deviceIdentity.getDeviceName(),
      });
      this.deviceIdentity.setDeviceId(activation.deviceId);
      this.devicesUsed = activation.devicesUsed;
      this.devicesMax = activation.devicesMax;
      await this.performColdStartValidation();
      this.gate = 'workspace';
      this.coldStartComplete = true;
      this.lastError = null;
    } catch (error) {
      if (error instanceof KhepreeDeviceLimitError) {
        this.gate = 'device_limit';
        this.devicesUsed = error.devicesUsed;
        this.devicesMax = error.devicesMax;
      }
      this.lastError = {
        code: error instanceof KhepreeAccessError ? error.code : 'ACTIVATION_FAILED',
        message: error instanceof Error ? error.message : 'Activation failed',
      };
    }
    this.emit();
    return this.getPublicState();
  }

  async refreshEntitlement(): Promise<KhepreeAccessState> {
    try {
      await this.performColdStartValidation();
      if (this.entitlement === 'active') {
        this.gate = 'workspace';
        this.coldStartComplete = true;
        this.lastError = null;
      } else {
        this.gate = 'entitlement';
      }
    } catch (error) {
      this.handleColdStartFailure(error);
    }
    this.emit();
    return this.getPublicState();
  }

  async startCheckout(): Promise<KhepreeAccessState> {
    const accessToken = await this.ensureAccessToken();
    if (!accessToken) {
      this.gate = 'login';
      this.emit();
      return this.getPublicState();
    }
    const { checkoutUrl } = await this.api.getCheckoutUrl({
      accessToken,
      productId: getKhepreeProductId(),
    });
    await openValidatedKhepreeUrl(checkoutUrl);
    this.billing = 'checkout_pending';
    this.emit();
    return this.getPublicState();
  }

  async signOut(): Promise<KhepreeAccessState> {
    await this.sessionStore.clearRefreshToken();
    this.hasRefreshCredential = false;
    this.user = null;
    this.plan = null;
    this.entitlement = 'none';
    this.billing = 'none';
    this.features = {};
    this.currentLease = null;
    this.devicesUsed = null;
    this.devicesMax = null;
    this.coldStartComplete = false;
    this.protectedActionsBlocked = false;
    this.gate = 'login';
    this.lastError = null;
    this.emit();
    return this.getPublicState();
  }

  async handleHeartbeat(): Promise<void> {
    const accessToken = await this.ensureAccessToken();
    const identity = await this.deviceIdentity.getIdentity();
    const deviceId = identity.deviceId;
    if (!accessToken || !deviceId) return;

    try {
      const { status } = await this.api.heartbeat({
        accessToken,
        installationId: identity.installationId,
        deviceId,
      });
      this.heartbeatStatus = status;
      await this.applyHeartbeatStatus(status);
    } catch (error) {
      if (error instanceof KhepreeNetworkError) {
        this.heartbeatStatus = 'NETWORK_TEMPORARY';
        return;
      }
      logger.warn('Khepree heartbeat failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.emit();
    }
  }

  private async applyHeartbeatStatus(status: KhepreeHeartbeatStatus): Promise<void> {
    switch (status) {
      case 'ACTIVE':
        this.protectedActionsBlocked = false;
        break;
      case 'ENTITLEMENT_SUSPENDED':
        this.protectedActionsBlocked = true;
        this.entitlement = 'suspended';
        break;
      case 'DEVICE_REMOVED':
      case 'DEVICE_BLOCKED':
        this.protectedActionsBlocked = true;
        this.gate = 'revoked';
        break;
      case 'SESSION_REVOKED':
        await this.signOut();
        break;
      case 'NETWORK_TEMPORARY':
        break;
      default:
        break;
    }
  }

  assertProductAccess(feature: string = KHEPREE_FEATURES.translation): void {
    if (!this.canStartTranslation()) {
      throw new KhepreeProductAccessDeniedError(feature);
    }
    if (this.protectedActionsBlocked) {
      throw new KhepreeProductAccessDeniedError(feature);
    }
    if (!isLeaseCurrentlyValid(this.currentLease)) {
      throw new KhepreeProductAccessDeniedError(feature);
    }
    if (!this.features[feature]) {
      throw new KhepreeProductAccessDeniedError(feature);
    }
  }

  getHeartbeatIntervalMs(): number {
    const fromLease = this.currentLease?.payload.heartbeatIntervalMs;
    return fromLease ?? KHEPREE_DEFAULT_HEARTBEAT_MS;
  }

  private async ensureAccessToken(): Promise<string | null> {
    const token = this.sessionStore.getAccessToken();
    if (token) return token;
    const refreshToken = await this.sessionStore.loadRefreshToken();
    if (!refreshToken) return null;
    const identity = await this.deviceIdentity.getIdentity();
    try {
      const refreshed = await this.api.refreshSession({
        refreshToken,
        installationId: identity.installationId,
      });
      await this.sessionStore.saveRefreshToken(refreshed.refreshToken, refreshed.user.id);
      this.sessionStore.setAccessToken(
        refreshed.accessToken,
        refreshed.expiresIn,
        refreshed.user.id,
      );
      this.user = refreshed.user;
      return refreshed.accessToken;
    } catch {
      return null;
    }
  }

  async shutdown(): Promise<void> {
    await this.oauthServer.stop();
  }
}
