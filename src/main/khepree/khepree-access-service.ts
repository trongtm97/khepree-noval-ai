import { app } from 'electron';
import {
  KHEPREE_DEFAULT_HEARTBEAT_MS,
  KHEPREE_DESKTOP_PROOF_PATHS,
  KHEPREE_ACCESS_FEATURE,
  KHEPREE_OAUTH_REDIRECT_URI,
  type KhepreeAccessStatus,
  type KhepreeCheckoutPhase,
  type KhepreeCheckoutStatus,
  type KhepreeHeartbeatStatus,
  type KhepreeLoginPhase,
} from '@shared/constants/khepree';
import {
  canUseKhepreeWorkspace,
  isKhepreeActive,
  resolveStatusFromEntitlement,
} from './access-state-machine';
import type {
  KhepreeAccessState,
  KhepreeSignedLease,
  KhepreeUserDisplay,
  KhepreePlanDisplay,
  KhepreeEntitlementState,
  KhepreeBillingState,
} from '@shared/schemas/khepree';
import type { KhepreePlanCatalogResponse } from '@shared/schemas/khepree-api';
import type { DatabaseManager } from '../db/database-manager';
import type { SecretStorageService } from '../security/secret-storage-service';
import { logger } from '../logging/logger';
import { DeviceIdentityService } from './device-identity-service';
import { KhepreeSessionStore } from './session-store';
import {
  createKhepreeApiClient,
  type KhepreeApiClient,
} from './khepree-api-client';
import {
  OAuthAuthTransactionManager,
  buildPendingOAuthState,
} from './oauth-auth-transaction';
import { generatePkcePair } from './pkce';
import {
  buildKhepreeAuthorizeUrl,
  getKhepreeApiBaseUrl,
  getKhepreeOAuthClientId,
  getKhepreeProductId,
  isKhepreeDevMockEnabled,
} from './config';
import { verifySignedLease, isLeaseCurrentlyValid } from './lease-verifier';
import { buildKhepreeDeviceProof } from './khepree-device-proof';
import {
  KhepreeAccessError,
  KhepreeCredentialCorruptError,
  KhepreeDeviceLimitError,
  KhepreeLeaseInvalidError,
  KhepreeNetworkError,
  KhepreeProductAccessDeniedError,
  KhepreeSafeStorageRequiredError,
  isEntitlementAbsentError,
  isInvalidRefreshError,
} from './errors';
import { openValidatedKhepreeUrl, isAllowedKhepreeUrl } from './external-links';
import { KhepreeCheckoutPoller } from './checkout-poller';
import { redactCheckoutLogFields } from './checkout-log-safety';

type AccessListener = (state: KhepreeAccessState) => void;
type RuntimeRevocationHandler = (reason: string) => void;

export class KhepreeAccessService {
  private readonly api: KhepreeApiClient;
  private readonly deviceIdentity: DeviceIdentityService;
  private readonly sessionStore: KhepreeSessionStore;
  private readonly oauthTransaction = new OAuthAuthTransactionManager();
  private readonly listeners = new Set<AccessListener>();

  private currentLease: KhepreeSignedLease | null = null;
  private user: KhepreeUserDisplay | null = null;
  private plan: KhepreePlanDisplay | null = null;
  private entitlement: KhepreeEntitlementState = 'none';
  private billing: KhepreeBillingState = 'none';
  private features: Record<string, boolean> = {};
  private devicesUsed: number | null = null;
  private devicesMax: number | null = null;
  private status: KhepreeAccessStatus = 'BOOTING';
  private heartbeatStatus: KhepreeHeartbeatStatus | null = null;
  private lastError: { code: string; message: string } | null = null;
  private loginInProgress = false;
  private loginPhase: KhepreeLoginPhase | null = 'idle';
  private hasRefreshCredential = false;
  private runtimeRevocationHandler: RuntimeRevocationHandler | null = null;
  private checkoutSessionId: string | null = null;
  private lastValidatedCheckoutUrl: string | null = null;
  private checkoutPhase: KhepreeCheckoutPhase = 'idle';
  private checkoutPlanId: string | null = null;
  private checkoutCanReopen = false;
  private checkoutError: { code: string; message: string } | null = null;
  private checkoutPoller: KhepreeCheckoutPoller | null = null;

  constructor(
    getDb: () => DatabaseManager,
    secretStorage: SecretStorageService,
  ) {
    this.api = createKhepreeApiClient(getKhepreeApiBaseUrl(), isKhepreeDevMockEnabled());
    this.deviceIdentity = new DeviceIdentityService(getDb, secretStorage);
    this.sessionStore = new KhepreeSessionStore(secretStorage, getDb);
  }

  private async buildDesktopDeviceProof(
    sessionPublicId: string,
    method: string,
    path: string,
    body: string,
  ) {
    const keypair = await this.deviceIdentity.getOrCreateKeypair();
    return buildKhepreeDeviceProof({
      sessionPublicId,
      method,
      path,
      body,
      sign: keypair.sign,
    });
  }

  private requireSessionPublicId(): string {
    const sessionPublicId = this.sessionStore.getSessionPublicId();
    if (!sessionPublicId) {
      throw new KhepreeAccessError('AUTH_REQUIRED', 'Missing Khepree session.');
    }
    return sessionPublicId;
  }

  subscribe(listener: AccessListener): () => void {
    this.listeners.add(listener);
    listener(this.getPublicState());
    return () => this.listeners.delete(listener);
  }

  setRuntimeRevocationHandler(handler: RuntimeRevocationHandler | null): void {
    this.runtimeRevocationHandler = handler;
  }

  private notifyRuntimeRevocation(reason: string): void {
    this.runtimeRevocationHandler?.(reason);
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
      status: this.status,
      loginPhase: this.loginPhase,
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
      checkoutPhase: this.checkoutPhase,
      checkoutPlanId: this.checkoutPlanId,
      checkoutCanReopen: this.checkoutCanReopen,
      checkoutError: this.checkoutError,
    };
  }

  private canUseWorkspace(): boolean {
    return canUseKhepreeWorkspace(this.status, isLeaseCurrentlyValid(this.currentLease));
  }

  private canStartTranslation(): boolean {
    return (
      this.canUseWorkspace() &&
      this.features[KHEPREE_ACCESS_FEATURE] === true &&
      this.entitlement === 'active'
    );
  }

  handleAuthCallbackUrl(rawUrl: string): void {
    this.oauthTransaction.handleAuthCallbackUrl(rawUrl);
  }

  async initializeOnColdStart(): Promise<KhepreeAccessState> {
    this.status = 'BOOTING';
    this.emit();

    const hasRefresh = this.sessionStore.hasRefreshToken();
    this.hasRefreshCredential = hasRefresh;
    if (!hasRefresh) {
      this.status = 'AUTH_REQUIRED';
      this.loginPhase = 'idle';
      this.emit();
      return this.getPublicState();
    }

    this.status = 'VALIDATING_SESSION';
    this.loginPhase = null;
    this.emit();

    try {
      await this.performColdStartValidation();
    } catch (error) {
      await this.handleColdStartFailure(error);
    }
    this.emit();
    return this.getPublicState();
  }

  private async performColdStartValidation(): Promise<void> {
    const refreshToken = await this.sessionStore.loadRefreshToken();
    if (!refreshToken) {
      this.status = 'AUTH_REQUIRED';
      this.loginPhase = 'idle';
      return;
    }

    const identity = await this.deviceIdentity.getIdentity();
    let accessToken = this.sessionStore.getAccessToken();

    if (!accessToken) {
      try {
        const sessionPublicId = this.requireSessionPublicId();
        const refreshBody = JSON.stringify({
          sessionPublicId,
          refreshToken,
        });
        const deviceProof = await this.buildDesktopDeviceProof(
          sessionPublicId,
          'POST',
          KHEPREE_DESKTOP_PROOF_PATHS.authRefresh,
          refreshBody,
        );
        const refreshed = await this.api.refreshSession({
          refreshToken,
          installationId: identity.installationId,
          sessionPublicId,
          deviceProof,
        });
        await this.sessionStore.saveRefreshToken(refreshed.refreshToken, refreshed.user.id);
        this.sessionStore.setSessionPublicId(refreshed.sessionPublicId);
        this.sessionStore.setAccessToken(
          refreshed.accessToken,
          refreshed.expiresIn,
          refreshed.user.id,
        );
        this.user = refreshed.user;
        accessToken = refreshed.accessToken;
      } catch (error) {
        if (isInvalidRefreshError(error)) {
          await this.sessionStore.clearRefreshToken();
          this.hasRefreshCredential = false;
          this.currentLease = null;
          this.status = 'AUTH_REQUIRED';
          this.loginPhase = 'idle';
          return;
        }
        throw error;
      }
    }

    if (!accessToken) {
      this.status = 'AUTH_REQUIRED';
      this.loginPhase = 'idle';
      return;
    }

    let deviceId = identity.deviceId;
    if (!deviceId) {
      this.status = 'DEVICE_ACTIVATING';
      this.emit();
      try {
        const activation = await this.activateCurrentDevice(accessToken, identity);
        this.deviceIdentity.setDeviceId(activation.deviceId);
        deviceId = activation.deviceId;
      } catch (error) {
        if (isEntitlementAbsentError(error)) {
          await this.enterFreeTier(accessToken);
          return;
        }
        throw error;
      }
    }

    const sessionPublicId = this.requireSessionPublicId();
    const refreshBody = JSON.stringify({
      sessionPublicId,
      refreshToken,
    });
    const deviceProof = await this.buildDesktopDeviceProof(
      sessionPublicId,
      'POST',
      KHEPREE_DESKTOP_PROOF_PATHS.authRefresh,
      refreshBody,
    );
    try {
      const result = await this.api.coldStartValidate({
        accessToken,
        installationId: identity.installationId,
        deviceId,
        sessionPublicId,
        refreshToken,
        deviceProof,
        devicePublicKey: identity.publicKeySpki,
        deviceName: this.deviceIdentity.getDeviceName(),
        platform: process.platform,
        appVersion: app.getVersion(),
      });

      this.applyColdStartResult(result, { ...identity, deviceId });
      this.finalizeAfterColdStartValidation();
    } catch (error) {
      if (isEntitlementAbsentError(error)) {
        await this.enterFreeTier(accessToken);
        return;
      }
      throw error;
    }
  }

  private async enterFreeTier(accessToken: string): Promise<void> {
    const profile = await this.api.fetchDesktopProfile({ accessToken });
    this.user = profile.user;
    this.plan = profile.plan;
    this.entitlement = profile.entitlement;
    this.billing = profile.billing;
    this.features = {};
    this.currentLease = null;
    this.devicesUsed = profile.devicesUsed;
    this.devicesMax = profile.devicesMax;
    if (profile.deviceId) {
      this.deviceIdentity.setDeviceId(profile.deviceId);
    }
    this.lastError = null;
    this.status =
      profile.entitlement === 'none' ? 'FREE' : resolveStatusFromEntitlement(profile.entitlement);
  }

  private async activateCurrentDevice(
    accessToken: string,
    identity: { installationId: string },
  ): Promise<{ deviceId: string; devicesUsed: number; devicesMax: number }> {
    try {
      return await this.api.activateDevice({
        accessToken,
        installationId: identity.installationId,
        devicePublicKey: (await this.deviceIdentity.getIdentity()).publicKeySpki,
        deviceName: this.deviceIdentity.getDeviceName(),
        platform: process.platform,
        appVersion: app.getVersion(),
      });
    } catch (error) {
      if (error instanceof KhepreeDeviceLimitError) {
        this.devicesUsed = error.devicesUsed;
        this.devicesMax = error.devicesMax;
        this.status = 'DEVICE_LIMIT_REACHED';
        this.lastError = { code: error.code, message: error.message };
        throw error;
      }
      throw error;
    }
  }

  private applyColdStartResult(
    result: {
      user: KhepreeUserDisplay;
      plan: KhepreePlanDisplay;
      entitlement: KhepreeEntitlementState;
      billing: KhepreeBillingState;
      features: Record<string, boolean>;
      lease: KhepreeSignedLease;
      devicesUsed: number;
      devicesMax: number;
      deviceId: string;
    },
    identity: { installationId: string; deviceId: string | null },
  ): void {
    const deviceId = identity.deviceId ?? result.deviceId;
    verifySignedLease(result.lease, {
      binding: {
        installationId: identity.installationId,
        deviceId,
        productId: getKhepreeProductId(),
      },
    });
    this.user = result.user;
    this.plan = result.plan;
    this.entitlement = result.entitlement;
    this.billing = result.billing;
    this.features = result.features;
    this.currentLease = result.lease;
    this.devicesUsed = result.devicesUsed;
    this.devicesMax = result.devicesMax;
  }

  private finalizeAfterColdStartValidation(): void {
    if (this.entitlement !== 'active') {
      this.currentLease = null;
      this.status = resolveStatusFromEntitlement(this.entitlement);
      if (this.status === 'FREE') {
        this.lastError = null;
      }
      return;
    }
    if (!isLeaseCurrentlyValid(this.currentLease)) {
      this.currentLease = null;
      this.status = 'ERROR';
      this.lastError = {
        code: 'LEASE_INVALID',
        message: 'License lease is invalid or expired.',
      };
      return;
    }
    this.status = 'ACTIVE';
    this.lastError = null;
  }

  private async handleColdStartFailure(error: unknown): Promise<void> {
    if (
      error instanceof KhepreeCredentialCorruptError ||
      error instanceof KhepreeSafeStorageRequiredError
    ) {
      this.currentLease = null;
      this.status = 'AUTH_REQUIRED';
      this.loginPhase = 'idle';
      this.lastError = { code: error.code, message: error.message };
      return;
    }
    if (error instanceof KhepreeNetworkError) {
      this.currentLease = null;
      this.status = 'OFFLINE_COLD_START';
      this.lastError = { code: error.code, message: error.message };
      return;
    }
    if (error instanceof KhepreeDeviceLimitError) {
      this.currentLease = null;
      this.status = 'DEVICE_LIMIT_REACHED';
      this.devicesUsed = error.devicesUsed;
      this.devicesMax = error.devicesMax;
      this.lastError = { code: error.code, message: error.message };
      return;
    }
    if (error instanceof KhepreeLeaseInvalidError) {
      this.currentLease = null;
      this.status = 'ERROR';
      this.lastError = { code: error.code, message: error.message };
      return;
    }
    if (isEntitlementAbsentError(error)) {
      const accessToken = await this.ensureAccessToken();
      if (accessToken) {
        try {
          await this.enterFreeTier(accessToken);
          return;
        } catch {
          // fall through to generic failure
        }
      }
      this.currentLease = null;
      this.entitlement = 'none';
      this.status = 'FREE';
      this.lastError = null;
      return;
    }
    if (error instanceof KhepreeAccessError) {
      if (error.code === 'ENTITLEMENT_EXPIRED') {
        this.currentLease = null;
        this.entitlement = 'expired';
        this.status = 'ENTITLEMENT_EXPIRED';
        this.lastError = { code: error.code, message: error.message };
        return;
      }
      if (error.code === 'ENTITLEMENT_SUSPENDED') {
        this.currentLease = null;
        this.entitlement = 'suspended';
        this.status = 'ENTITLEMENT_SUSPENDED';
        this.lastError = { code: error.code, message: error.message };
        return;
      }
      if (error.code === 'DEVICE_BLOCKED') {
        this.currentLease = null;
        this.status = 'DEVICE_BLOCKED';
        this.lastError = { code: error.code, message: error.message };
        return;
      }
      if (error.code === 'DEVICE_REMOVED') {
        this.currentLease = null;
        this.status = 'DEVICE_REMOVED';
        this.lastError = { code: error.code, message: error.message };
        return;
      }
    }
    logger.warn('Khepree cold start failed', {
      code: error instanceof KhepreeAccessError ? error.code : 'UNKNOWN',
      message: error instanceof Error ? error.message : String(error),
    });
    this.currentLease = null;
    this.status = 'ERROR';
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
    this.loginPhase = 'opening_browser';
    this.status = 'AUTHENTICATING';
    this.emit();

    let oauthState: string | null = null;

    try {
      const identity = await this.deviceIdentity.getIdentity();
      const pkce = generatePkcePair();
      oauthState = buildPendingOAuthState();
      this.oauthTransaction.beginTransaction(oauthState, pkce.codeVerifier);

      await this.api.startDeviceAuth({
        state: oauthState,
        codeChallenge: pkce.codeChallenge,
        codeChallengeMethod: 'S256',
        redirectUri: KHEPREE_OAUTH_REDIRECT_URI,
        installationId: identity.installationId,
        devicePublicKey: identity.publicKeySpki,
        productId: getKhepreeProductId(),
      });

      const authUrl = buildKhepreeAuthorizeUrl({
        state: oauthState,
        codeChallenge: pkce.codeChallenge,
        redirectUri: KHEPREE_OAUTH_REDIRECT_URI,
        clientId: getKhepreeOAuthClientId(),
        installationId: identity.installationId,
        productId: getKhepreeProductId(),
      });

      const opened = await openValidatedKhepreeUrl(authUrl);
      if (!opened) {
        throw new KhepreeAccessError('OAUTH_OPEN_FAILED', 'Could not open Khepree sign-in page.');
      }
      this.loginPhase = 'waiting_sign_in';
      this.emit();

      if (isKhepreeDevMockEnabled()) {
        this.scheduleDevMockOAuthCallback(oauthState);
      }

      const { code } = await this.oauthTransaction.waitForCallback(oauthState);
      this.oauthTransaction.clearTransaction();

      this.loginPhase = 'exchanging';
      this.emit();

      const tokens = await this.api.exchangeDeviceAuth({
        code,
        state: oauthState,
        codeVerifier: pkce.codeVerifier,
        clientId: getKhepreeOAuthClientId(),
        redirectUri: KHEPREE_OAUTH_REDIRECT_URI,
        installationId: identity.installationId,
        devicePublicKey: identity.publicKeySpki,
        platform: process.platform,
        appVersion: app.getVersion(),
      });
      const sessionPublicId =
        'sessionPublicId' in tokens && typeof tokens.sessionPublicId === 'string'
          ? tokens.sessionPublicId
          : null;

      await this.sessionStore.saveRefreshToken(tokens.refreshToken, tokens.user.id);
      this.hasRefreshCredential = true;
      if (sessionPublicId) {
        this.sessionStore.setSessionPublicId(sessionPublicId);
      }
      this.sessionStore.setAccessToken(tokens.accessToken, tokens.expiresIn, tokens.user.id);
      this.user = tokens.user;

      this.status = 'DEVICE_ACTIVATING';
      this.emit();

      try {
        const activation = await this.api.activateDevice({
          accessToken: tokens.accessToken,
          installationId: identity.installationId,
          devicePublicKey: identity.publicKeySpki,
          deviceName: this.deviceIdentity.getDeviceName(),
          platform: process.platform,
          appVersion: app.getVersion(),
        });
        this.deviceIdentity.setDeviceId(activation.deviceId);
        this.devicesUsed = activation.devicesUsed;
        this.devicesMax = activation.devicesMax;
      } catch (error) {
        if (error instanceof KhepreeDeviceLimitError) {
          this.currentLease = null;
          this.status = 'DEVICE_LIMIT_REACHED';
          this.devicesUsed = error.devicesUsed;
          this.devicesMax = error.devicesMax;
          this.lastError = { code: error.code, message: error.message };
          this.loginPhase = 'idle';
          this.emit();
          return this.getPublicState();
        }
        if (isEntitlementAbsentError(error)) {
          await this.enterFreeTier(tokens.accessToken);
          this.loginPhase = 'success';
          return this.getPublicState();
        }
        throw error;
      }

      await this.performColdStartValidation();
      this.loginPhase = 'success';
    } catch (error) {
      this.oauthTransaction.clearTransaction();
      if (this.hasRefreshCredential && isEntitlementAbsentError(error)) {
        const accessToken = await this.ensureAccessToken();
        if (accessToken) {
          try {
            await this.enterFreeTier(accessToken);
            this.loginPhase = 'success';
            return this.getPublicState();
          } catch (freeError) {
            this.applyLoginFailure(freeError);
          }
        } else {
          this.applyLoginFailure(error);
        }
      } else {
        this.applyLoginFailure(error);
      }
    } finally {
      this.loginInProgress = false;
      if (this.loginPhase !== 'success' && this.status !== 'DEVICE_LIMIT_REACHED') {
        this.loginPhase = 'idle';
      }
      this.emit();
    }
    return this.getPublicState();
  }

  private scheduleDevMockOAuthCallback(state: string): void {
    setTimeout(() => {
      this.oauthTransaction.handleAuthCallbackUrl(
        `${KHEPREE_OAUTH_REDIRECT_URI}?code=mock-code-${state.slice(0, 8)}&state=${encodeURIComponent(state)}`,
      );
    }, 50);
  }

  private applyLoginFailure(error: unknown): void {
    if (error instanceof KhepreeNetworkError) {
      this.currentLease = null;
      this.lastError = { code: error.code, message: error.message };
      this.status = 'AUTH_REQUIRED';
      return;
    }
    if (error instanceof KhepreeAccessError && error.code === 'OAUTH_CANCELLED') {
      this.lastError = { code: error.code, message: error.message };
      this.status = 'AUTH_REQUIRED';
      return;
    }
    if (error instanceof KhepreeAccessError && error.code === 'OAUTH_EXPIRED') {
      this.lastError = { code: error.code, message: error.message };
      this.status = 'AUTH_REQUIRED';
      return;
    }
    this.lastError = {
      code: error instanceof KhepreeAccessError ? error.code : 'LOGIN_FAILED',
      message: error instanceof Error ? error.message : 'Login failed',
    };
    this.status = 'AUTH_REQUIRED';
  }

  async retryColdStart(): Promise<KhepreeAccessState> {
    this.lastError = null;
    this.status = 'VALIDATING_SESSION';
    this.emit();
    try {
      await this.performColdStartValidation();
    } catch (error) {
      await this.handleColdStartFailure(error);
    }
    this.emit();
    return this.getPublicState();
  }

  async retryActivation(): Promise<KhepreeAccessState> {
    const accessToken = await this.ensureAccessToken();
    if (!accessToken) {
      this.status = 'AUTH_REQUIRED';
      this.emit();
      return this.getPublicState();
    }
    const identity = await this.deviceIdentity.getIdentity();
    this.status = 'DEVICE_ACTIVATING';
    this.emit();
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
      this.lastError = null;
    } catch (error) {
      if (error instanceof KhepreeDeviceLimitError) {
        this.currentLease = null;
        this.status = 'DEVICE_LIMIT_REACHED';
        this.devicesUsed = error.devicesUsed;
        this.devicesMax = error.devicesMax;
      } else {
        await this.handleColdStartFailure(error);
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
    this.status = 'VALIDATING_SESSION';
    this.emit();
    try {
      await this.performColdStartValidation();
    } catch (error) {
      await this.handleColdStartFailure(error);
    }
    this.emit();
    return this.getPublicState();
  }

  async getPlanCatalog(): Promise<KhepreePlanCatalogResponse> {
    const accessToken = await this.ensureAccessToken();
    if (!accessToken) {
      throw new KhepreeAccessError('AUTH_REQUIRED', 'Sign in to view plans.');
    }
    return this.api.getPlanCatalog({ accessToken, productId: getKhepreeProductId() });
  }

  async startCheckout(planId: string): Promise<KhepreeAccessState> {
    this.stopCheckoutPolling();
    this.checkoutError = null;

    const accessToken = await this.ensureAccessToken();
    if (!accessToken) {
      this.status = 'AUTH_REQUIRED';
      this.emit();
      return this.getPublicState();
    }

    let checkoutUrl: string;
    let checkoutSessionId: string;
    try {
      const result = await this.api.getCheckoutUrl({
        accessToken,
        productId: getKhepreeProductId(),
        planId,
      });
      checkoutUrl = result.checkoutUrl;
      checkoutSessionId = result.checkoutSessionId;
    } catch (error) {
      this.checkoutPhase = 'failed';
      this.checkoutPlanId = planId;
      this.checkoutCanReopen = false;
      this.checkoutError = {
        code: error instanceof KhepreeAccessError ? error.code : 'CHECKOUT_CREATE_FAILED',
        message: error instanceof Error ? error.message : 'Could not start checkout.',
      };
      this.emit();
      return this.getPublicState();
    }

    if (!isAllowedKhepreeUrl(checkoutUrl)) {
      logger.warn('Blocked checkout URL from Khepree API', redactCheckoutLogFields({ planId }));
      this.checkoutPhase = 'failed';
      this.checkoutPlanId = planId;
      this.checkoutCanReopen = false;
      this.checkoutError = {
        code: 'CHECKOUT_URL_BLOCKED',
        message: 'Checkout URL was rejected for security.',
      };
      this.emit();
      return this.getPublicState();
    }

    const opened = await openValidatedKhepreeUrl(checkoutUrl);
    if (!opened) {
      this.checkoutPhase = 'failed';
      this.checkoutPlanId = planId;
      this.checkoutCanReopen = false;
      this.checkoutError = {
        code: 'CHECKOUT_OPEN_FAILED',
        message: 'Could not open checkout in browser.',
      };
      this.emit();
      return this.getPublicState();
    }

    this.checkoutSessionId = checkoutSessionId;
    this.lastValidatedCheckoutUrl = checkoutUrl;
    this.checkoutPlanId = planId;
    this.checkoutPhase = 'waiting';
    this.checkoutCanReopen = true;
    this.billing = 'checkout_pending';
    this.startCheckoutPolling();
    this.emit();
    return this.getPublicState();
  }

  async cancelCheckout(): Promise<KhepreeAccessState> {
    this.stopCheckoutPolling();
    this.checkoutSessionId = null;
    this.lastValidatedCheckoutUrl = null;
    this.checkoutPhase = 'cancelled';
    this.checkoutCanReopen = false;
    this.checkoutPlanId = null;
    if (this.billing === 'checkout_pending') {
      this.billing = this.entitlement === 'active' ? 'active' : 'none';
    }
    this.emit();
    return this.getPublicState();
  }

  async reopenCheckout(): Promise<KhepreeAccessState> {
    if (!this.checkoutCanReopen || !this.lastValidatedCheckoutUrl) {
      this.emit();
      return this.getPublicState();
    }
    if (!isAllowedKhepreeUrl(this.lastValidatedCheckoutUrl)) {
      this.checkoutCanReopen = false;
      this.checkoutError = {
        code: 'CHECKOUT_URL_BLOCKED',
        message: 'Checkout URL is no longer valid.',
      };
      this.emit();
      return this.getPublicState();
    }
    await openValidatedKhepreeUrl(this.lastValidatedCheckoutUrl);
    if (this.checkoutPhase === 'cancelled' || this.checkoutPhase === 'timeout') {
      this.checkoutPhase = 'waiting';
      this.billing = 'checkout_pending';
      this.startCheckoutPolling();
    }
    this.emit();
    return this.getPublicState();
  }

  async checkCheckoutNow(): Promise<KhepreeAccessState> {
    if (this.checkoutSessionId && this.checkoutPhase !== 'idle') {
      await this.pollCheckoutOnce();
    } else if (this.checkoutPhase === 'confirming') {
      await this.refreshEntitlement();
    } else {
      await this.refreshEntitlement();
    }
    return this.getPublicState();
  }

  private startCheckoutPolling(): void {
    this.stopCheckoutPolling();
    this.checkoutPoller = new KhepreeCheckoutPoller(
      async () => this.pollCheckoutOnce(),
      () => this.handleCheckoutTimeout(),
    );
    this.checkoutPoller.start();
  }

  private stopCheckoutPolling(): void {
    this.checkoutPoller?.stop();
    this.checkoutPoller = null;
  }

  private handleCheckoutTimeout(): void {
    this.stopCheckoutPolling();
    this.checkoutPhase = 'timeout';
    this.checkoutCanReopen = Boolean(this.lastValidatedCheckoutUrl);
    if (this.billing === 'checkout_pending') {
      this.billing = this.entitlement === 'active' ? 'active' : 'none';
    }
    this.emit();
  }

  /** @returns true when polling should stop */
  private async pollCheckoutOnce(): Promise<boolean> {
    if (!this.checkoutSessionId) return true;

    const accessToken = await this.ensureAccessToken();
    if (!accessToken) {
      this.stopCheckoutPolling();
      this.checkoutPhase = 'failed';
      this.checkoutError = { code: 'AUTH_REQUIRED', message: 'Session expired during checkout.' };
      this.emit();
      return true;
    }

    let status: KhepreeCheckoutStatus;
    try {
      const result = await this.api.getCheckoutStatus({
        accessToken,
        productId: getKhepreeProductId(),
        checkoutSessionId: this.checkoutSessionId,
      });
      status = result.status;
    } catch (error) {
      logger.warn(
        'Khepree checkout status poll failed',
        redactCheckoutLogFields({
          code: error instanceof KhepreeAccessError ? error.code : 'UNKNOWN',
        }),
      );
      return false;
    }

    switch (status) {
      case 'PENDING':
        this.checkoutPhase = 'waiting';
        this.emit();
        return false;
      case 'PAID_ENTITLEMENT_PENDING':
        this.checkoutPhase = 'confirming';
        this.emit();
        return false;
      case 'ACCESS_ACTIVE':
        await this.completeCheckoutSuccess();
        return this.checkoutPhase === 'idle';
      case 'FAILED':
        this.stopCheckoutPolling();
        this.checkoutSessionId = null;
        this.checkoutPhase = 'failed';
        this.checkoutCanReopen = false;
        this.checkoutError = { code: 'CHECKOUT_FAILED', message: 'Payment failed.' };
        if (this.billing === 'checkout_pending') {
          this.billing = 'none';
        }
        this.emit();
        return true;
      case 'CANCELLED':
        this.stopCheckoutPolling();
        this.checkoutSessionId = null;
        this.checkoutPhase = 'cancelled';
        this.checkoutCanReopen = false;
        if (this.billing === 'checkout_pending') {
          this.billing = 'none';
        }
        this.emit();
        return true;
      default:
        return false;
    }
  }

  private async completeCheckoutSuccess(): Promise<void> {
    this.checkoutError = null;

    try {
      await this.performColdStartValidation();
    } catch (error) {
      await this.handleColdStartFailure(error);
    }

    if (this.status === 'ACTIVE' && this.entitlement === 'active') {
      this.stopCheckoutPolling();
      this.checkoutSessionId = null;
      this.lastValidatedCheckoutUrl = null;
      this.checkoutPhase = 'idle';
      this.checkoutPlanId = null;
      this.checkoutCanReopen = false;
      this.billing = 'active';
    } else {
      this.checkoutPhase = 'confirming';
      this.billing = 'checkout_pending';
    }
    this.emit();
  }

  private clearCheckoutState(): void {
    this.stopCheckoutPolling();
    this.checkoutSessionId = null;
    this.lastValidatedCheckoutUrl = null;
    this.checkoutPhase = 'idle';
    this.checkoutPlanId = null;
    this.checkoutCanReopen = false;
    this.checkoutError = null;
  }

  async signOut(): Promise<KhepreeAccessState> {
    this.clearCheckoutState();
    const accessToken = this.sessionStore.getAccessToken() ?? (await this.ensureAccessToken());
    if (accessToken) {
      try {
        await this.api.revokeSession({ accessToken });
      } catch {
        // Best-effort server revoke — local credentials still cleared.
      }
    }
    await this.sessionStore.clearRefreshToken();
    this.oauthTransaction.clearTransaction();
    this.hasRefreshCredential = false;
    this.user = null;
    this.plan = null;
    this.entitlement = 'none';
    this.billing = 'none';
    this.features = {};
    this.currentLease = null;
    this.devicesUsed = null;
    this.devicesMax = null;
    this.status = 'AUTH_REQUIRED';
    this.loginPhase = 'idle';
    this.lastError = null;
    this.emit();
    return this.getPublicState();
  }

  async handleHeartbeat(): Promise<void> {
    if (!isKhepreeActive(this.status)) return;

    const accessToken = await this.ensureAccessToken();
    const sessionPublicId = this.sessionStore.getSessionPublicId();
    if (!accessToken || !sessionPublicId) return;

    const body = JSON.stringify({
      sessionPublicId,
      accessToken,
    });
    const deviceProof = await this.buildDesktopDeviceProof(
      sessionPublicId,
      'POST',
      KHEPREE_DESKTOP_PROOF_PATHS.heartbeat,
      body,
    );

    try {
      const { status } = await this.api.heartbeat({
        accessToken,
        sessionPublicId,
        deviceProof,
      });
      this.heartbeatStatus = status;
      await this.applyHeartbeatStatus(status);
    } catch (error) {
      if (error instanceof KhepreeNetworkError) {
        this.heartbeatStatus = 'NETWORK_TEMPORARY';
        if (isLeaseCurrentlyValid(this.currentLease)) {
          return;
        }
        this.notifyRuntimeRevocation('NETWORK_LEASE_EXPIRED');
        this.currentLease = null;
        this.status = 'OFFLINE_COLD_START';
        this.lastError = { code: error.code, message: error.message };
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
        break;
      case 'ENTITLEMENT_SUSPENDED':
        this.notifyRuntimeRevocation(status);
        this.currentLease = null;
        this.entitlement = 'suspended';
        this.status = 'ENTITLEMENT_SUSPENDED';
        break;
      case 'ENTITLEMENT_EXPIRED':
        this.notifyRuntimeRevocation(status);
        this.currentLease = null;
        this.entitlement = 'expired';
        this.status = 'ENTITLEMENT_EXPIRED';
        break;
      case 'DEVICE_REMOVED':
        this.notifyRuntimeRevocation(status);
        this.currentLease = null;
        this.deviceIdentity.clearDeviceId();
        this.status = 'DEVICE_REMOVED';
        break;
      case 'DEVICE_BLOCKED':
        this.notifyRuntimeRevocation(status);
        this.currentLease = null;
        this.status = 'DEVICE_BLOCKED';
        break;
      case 'SESSION_REVOKED':
        this.notifyRuntimeRevocation(status);
        await this.signOut();
        break;
      case 'NETWORK_TEMPORARY':
        break;
      default:
        break;
    }
  }

  assertProductAccess(feature: string = KHEPREE_ACCESS_FEATURE): void {
    if (!isKhepreeActive(this.status)) {
      throw new KhepreeProductAccessDeniedError(feature);
    }
    if (this.entitlement !== 'active') {
      throw new KhepreeProductAccessDeniedError(feature);
    }
    if (!isLeaseCurrentlyValid(this.currentLease)) {
      throw new KhepreeProductAccessDeniedError(feature);
    }
    if (!this.features[KHEPREE_ACCESS_FEATURE]) {
      throw new KhepreeProductAccessDeniedError(KHEPREE_ACCESS_FEATURE);
    }
    if (feature !== KHEPREE_ACCESS_FEATURE && !this.features[feature]) {
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
      const sessionPublicId = this.requireSessionPublicId();
      const refreshBody = JSON.stringify({
        sessionPublicId,
        refreshToken,
      });
      const deviceProof = await this.buildDesktopDeviceProof(
        sessionPublicId,
        'POST',
        KHEPREE_DESKTOP_PROOF_PATHS.authRefresh,
        refreshBody,
      );
      const refreshed = await this.api.refreshSession({
        refreshToken,
        installationId: identity.installationId,
        sessionPublicId,
        deviceProof,
      });
      await this.sessionStore.saveRefreshToken(refreshed.refreshToken, refreshed.user.id);
      this.sessionStore.setSessionPublicId(refreshed.sessionPublicId);
      this.sessionStore.setAccessToken(
        refreshed.accessToken,
        refreshed.expiresIn,
        refreshed.user.id,
      );
      this.user = refreshed.user;
      return refreshed.accessToken;
    } catch (error) {
      if (isInvalidRefreshError(error)) {
        await this.sessionStore.clearRefreshToken();
        this.hasRefreshCredential = false;
      }
      return null;
    }
  }

  async shutdown(): Promise<void> {
    this.clearCheckoutState();
    this.oauthTransaction.clearTransaction();
  }
}
