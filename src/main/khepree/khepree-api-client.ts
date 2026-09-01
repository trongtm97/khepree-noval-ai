import { createPrivateKey, sign } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type { ZodType } from 'zod';
import { z } from 'zod';
import type { KhepreeSignedLease, KhepreeSignedLeasePayload } from '@shared/schemas/khepree';
import type { KhepreeHeartbeatStatus, KhepreeCheckoutStatus } from '@shared/constants/khepree';
import type {
  KhepreeActivateDeviceResponse,
  KhepreeAuthTokenResult,
  KhepreeColdStartResult,
  KhepreeDesktopProfile,
  KhepreePlanCatalogResponse,
} from '@shared/schemas/khepree-api';
import { getDevSigningKeys } from './dev-signing-keys';
import { deriveS256Challenge } from './pkce';
import type { KhepreeDeviceProof } from './khepree-device-proof';
import { getKhepreeOAuthClientId, getKhepreeProductId } from './config';
import {
  isPlatformSignedLease,
  mapDesktopMeToColdStart,
  mapDesktopMeToProfile,
  mapPlatformFeatures,
  verifyPlatformSignedLease,
  type PlatformSignedLease,
} from './platform-lease';
import {
  KHEPREE_ACCESS_FEATURE,
  KHEPREE_DESKTOP_API_PATHS,
} from '@shared/constants/khepree';
import { KhepreeApiResponseInvalidError, KhepreeDeviceLimitError, KhepreeNetworkError, KhepreeAccessError, mapDesktopApiErrorCode } from './errors';

export type { KhepreeAuthTokenResult, KhepreeColdStartResult };

export interface DeviceAuthStartInput {
  state: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  redirectUri: string;
  installationId: string;
  devicePublicKey: string;
  productId: string;
}

export interface DeviceAuthExchangeInput {
  code: string;
  state: string;
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
  installationId: string;
  devicePublicKey: string;
  platform: string;
  appVersion: string;
  deviceName?: string;
}

function parseApiResponse<T>(schema: ZodType<T>, body: unknown, context: string): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new KhepreeApiResponseInvalidError(context);
  }
  return parsed.data;
}


export interface KhepreeApiClient {
  startDeviceAuth(input: DeviceAuthStartInput): Promise<{ ok: true }>;

  exchangeDeviceAuth(input: DeviceAuthExchangeInput): Promise<KhepreeAuthTokenResult & { sessionPublicId?: string }>;

  refreshSession(input: {
    refreshToken: string;
    installationId: string;
    sessionPublicId: string;
    deviceProof: KhepreeDeviceProof;
  }): Promise<KhepreeAuthTokenResult & { sessionPublicId: string; lease?: PlatformSignedLease }>;

  activateDevice(input: {
    accessToken: string;
    installationId: string;
    devicePublicKey: string;
    deviceName: string;
    platform?: string;
    appVersion?: string;
  }): Promise<KhepreeActivateDeviceResponse & { lease?: PlatformSignedLease }>;

  coldStartValidate(input: {
    accessToken: string;
    installationId: string;
    deviceId: string;
    sessionPublicId: string;
    refreshToken: string;
    deviceProof: KhepreeDeviceProof;
    devicePublicKey: string;
    deviceName: string;
    platform?: string;
    appVersion?: string;
  }): Promise<KhepreeColdStartResult>;

  refreshLease(input: {
    accessToken: string;
    installationId: string;
    deviceId: string;
    sessionPublicId: string;
    refreshToken: string;
    deviceProof: KhepreeDeviceProof;
    devicePublicKey: string;
    deviceName: string;
    platform?: string;
    appVersion?: string;
  }): Promise<KhepreeSignedLease>;

  heartbeat(input: {
    accessToken: string;
    sessionPublicId: string;
    deviceProof: KhepreeDeviceProof;
  }): Promise<{ status: KhepreeHeartbeatStatus }>;

  getCheckoutUrl(input: {
    accessToken: string;
    productId: string;
    planId: string;
  }): Promise<{ checkoutUrl: string; checkoutSessionId: string }>;

  getCheckoutStatus(input: {
    accessToken: string;
    productId: string;
    checkoutSessionId: string;
  }): Promise<{ status: KhepreeCheckoutStatus }>;

  getPlanCatalog(input: {
    accessToken: string;
    productId: string;
  }): Promise<KhepreePlanCatalogResponse>;

  fetchDesktopProfile(input: { accessToken: string }): Promise<KhepreeDesktopProfile>;

  revokeSession(input: { accessToken: string }): Promise<{ ok: true }>;
}

function canonicalPayload(payload: KhepreeSignedLeasePayload): Buffer {
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
  return Buffer.from(JSON.stringify(ordered), 'utf8');
}

function signLeasePayload(payload: KhepreeSignedLeasePayload): KhepreeSignedLease {
  const dev = getDevSigningKeys();
  if (!dev) {
    throw new Error('Dev signing keys unavailable');
  }
  const privateKey = createPrivateKey({
    key: Buffer.from(dev.privateKeyPkcs8, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const signature = sign(null, canonicalPayload(payload), privateKey).toString('base64url');
  return { payload, keyId: dev.keyId, signature };
}

/** Shared mock server state — persists across client instances like a real API. */
const mockSessions = new Map<string, { user: KhepreeAuthTokenResult['user']; refreshToken: string }>();
const mockDevices = new Map<string, { installationId: string; deviceId: string }>();
const mockPendingAuth = new Map<
  string,
  { installationId: string; codeChallenge: string; redirectUri: string }
>();

export const mockKhepreeHeartbeatState = {
  nextStatus: 'ACTIVE' as KhepreeHeartbeatStatus,
  networkFail: false,
};

export const mockKhepreeCheckoutState = {
  statusSequence: ['PENDING', 'PENDING', 'ACCESS_ACTIVE'] as KhepreeCheckoutStatus[],
  statusIndex: 0,
  returnBadUrl: false,
  invalidPlanIds: new Set<string>(),
  /** After payment, entitlement cold-start may lag until this is cleared. */
  entitlementPendingAfterPayment: false,
};

function buildMockPlanCatalog(): KhepreePlanCatalogResponse {
  const hasEntitlement = process.env.KHEPREE_MOCK_NO_ENTITLEMENT !== '1';
  return {
    currentPlanId: hasEntitlement ? 'plan_year:price_year' : null,
    plans: [
      {
        planId: 'plan_trial:price_trial',
        planName: 'Free Trial',
        price: 0,
        currency: 'VND',
        accessTerm: '24 hours',
        featureSummary: ['Full access'],
        isCurrent: false,
        isUpgradeAvailable: true,
      },
      {
        planId: 'plan_month:price_month',
        planName: '1 Tháng',
        price: 99_000,
        currency: 'VND',
        accessTerm: '30 days',
        featureSummary: ['Full access'],
        isCurrent: false,
        isUpgradeAvailable: true,
      },
      {
        planId: 'plan_year:price_year',
        planName: '1 Năm',
        price: 900_000,
        currency: 'VND',
        accessTerm: '365 days',
        featureSummary: ['Full access'],
        isCurrent: hasEntitlement,
        isUpgradeAvailable: !hasEntitlement,
      },
    ],
  };
}

/** In-process mock for dev — simulates Khepree API without network. */
export class MockKhepreeApiClient implements KhepreeApiClient {
  private sessions = mockSessions;
  private devices = mockDevices;
  private pendingAuth = mockPendingAuth;

  startDeviceAuth(input: DeviceAuthStartInput): Promise<{ ok: true }> {
    this.pendingAuth.set(input.state, {
      installationId: input.installationId,
      codeChallenge: input.codeChallenge,
      redirectUri: input.redirectUri,
    });
    return Promise.resolve({ ok: true });
  }

  exchangeDeviceAuth(input: DeviceAuthExchangeInput): Promise<KhepreeAuthTokenResult> {
    const pending = this.pendingAuth.get(input.state);
    if (!pending || pending.installationId !== input.installationId) {
      return Promise.reject(new KhepreeAccessError('OAUTH_STATE_MISMATCH', 'Invalid auth state'));
    }
    if (pending.redirectUri !== input.redirectUri) {
      return Promise.reject(new KhepreeAccessError('OAUTH_REDIRECT_MISMATCH', 'Redirect URI mismatch'));
    }
    const derivedChallenge = deriveS256Challenge(input.codeVerifier);
    if (derivedChallenge !== pending.codeChallenge) {
      return Promise.reject(new KhepreeAccessError('OAUTH_PKCE_FAILED', 'PKCE verification failed'));
    }
    if (!input.code.startsWith('mock-code-')) {
      return Promise.reject(new KhepreeAccessError('INVALID_AUTH_CODE', 'Invalid authorization code'));
    }
    this.pendingAuth.delete(input.state);

    const user: KhepreeAuthTokenResult['user'] = {
      id: randomUUID(),
      email: 'dev@khepree.local',
      displayName: 'Dev User',
    };
    const refreshToken = `mock-refresh-${input.installationId}`;
    this.sessions.set(refreshToken, { user, refreshToken });
    return Promise.resolve({
      accessToken: `mock-access-${user.id}`,
      refreshToken,
      expiresIn: 3600,
      user,
      sessionPublicId: `mock-session-${user.id}`,
    });
  }

  refreshSession(input: {
    refreshToken: string;
    installationId: string;
    sessionPublicId?: string;
    deviceProof?: KhepreeDeviceProof;
  }): Promise<KhepreeAuthTokenResult & { sessionPublicId: string; lease?: PlatformSignedLease }> {
    void input.sessionPublicId;
    void input.deviceProof;
    const session = this.sessions.get(input.refreshToken);
    if (!session) {
      return Promise.reject(new KhepreeAccessError('INVALID_REFRESH', 'Refresh token invalid'));
    }
    return Promise.resolve({
      accessToken: `mock-access-${session.user.id}`,
      refreshToken: input.refreshToken,
      expiresIn: 3600,
      user: session.user,
      sessionPublicId: `mock-session-${session.user.id}`,
    });
  }

  activateDevice(input: {
    accessToken: string;
    installationId: string;
    devicePublicKey: string;
    deviceName: string;
  }): Promise<KhepreeActivateDeviceResponse> {
    const existing = [...this.devices.values()].find(
      (d) => d.installationId === input.installationId,
    );
    if (existing) {
      return Promise.resolve({
        deviceId: existing.deviceId,
        devicesUsed: this.devices.size,
        devicesMax: 3,
      });
    }
    if (process.env.KHEPREE_MOCK_DEVICE_LIMIT === '1') {
      throw new KhepreeDeviceLimitError(3, 3);
    }
    const deviceId = randomUUID();
    this.devices.set(deviceId, { installationId: input.installationId, deviceId });
    return Promise.resolve({ deviceId, devicesUsed: this.devices.size, devicesMax: 3 });
  }

  private buildColdStart(
    installationId: string,
    deviceId: string,
    user: KhepreeAuthTokenResult['user'],
  ): KhepreeColdStartResult {
    if (process.env.KHEPREE_MOCK_NETWORK_FAIL === '1') {
      throw new KhepreeNetworkError();
    }
    if (process.env.KHEPREE_MOCK_DEVICE_BLOCKED === '1') {
      throw new KhepreeAccessError('DEVICE_BLOCKED', 'This device is blocked.');
    }
    if (process.env.KHEPREE_MOCK_DEVICE_REMOVED === '1') {
      throw new KhepreeAccessError('DEVICE_REMOVED', 'This device was removed.');
    }
    const now = Date.now();
    const expiresAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();
    const graceUntil = new Date(now + 48 * 60 * 60 * 1000).toISOString();
    const entitlement =
      process.env.KHEPREE_MOCK_NO_ENTITLEMENT === '1'
        ? ('none' as const)
        : process.env.KHEPREE_MOCK_ENTITLEMENT_EXPIRED === '1'
          ? ('expired' as const)
          : process.env.KHEPREE_MOCK_ENTITLEMENT_SUSPENDED === '1'
            ? ('suspended' as const)
            : ('active' as const);
    const features: Record<string, boolean> =
      entitlement === 'active'
        ? {
            [KHEPREE_ACCESS_FEATURE]: true,
            translation: true,
            export: true,
            multi_provider: true,
            learning: true,
          }
        : {};
    const payload: KhepreeSignedLeasePayload = {
      installationId,
      deviceId,
      productId: process.env.KHEPREE_MOCK_WRONG_PRODUCT === '1' ? 'wrong-product' : getKhepreeProductId(),
      entitlementId: `ent-${user.id}`,
      features,
      iat: new Date(now).toISOString(),
      expiresAt:
        process.env.KHEPREE_MOCK_EXPIRED_LEASE === '1'
          ? new Date(now - 60_000).toISOString()
          : expiresAt,
      graceUntil: process.env.KHEPREE_MOCK_EXPIRED_LEASE === '1' ? null : graceUntil,
      heartbeatIntervalMs: 15 * 60 * 1000,
    };
    let lease = signLeasePayload(payload);
    if (process.env.KHEPREE_MOCK_BAD_LEASE_SIGNATURE === '1') {
      lease = { ...lease, signature: 'bad-signature' };
    }
    return {
      user,
      plan: { planId: 'pro', planName: 'Pro (Dev Mock)', status: 'active' },
      entitlement,
      billing: entitlement === 'active' ? 'active' : 'none',
      features,
      lease,
      devicesUsed: this.devices.size,
      devicesMax: 3,
      deviceId,
    };
  }

  coldStartValidate(input: {
    accessToken: string;
    installationId: string;
    deviceId: string;
    sessionPublicId?: string;
    refreshToken?: string;
    deviceProof?: KhepreeDeviceProof;
    devicePublicKey?: string;
    deviceName?: string;
    platform?: string;
    appVersion?: string;
  }): Promise<KhepreeColdStartResult> {
    void input.sessionPublicId;
    void input.refreshToken;
    void input.deviceProof;
    void input.devicePublicKey;
    void input.deviceName;
    void input.platform;
    void input.appVersion;
    const userId = input.accessToken.replace('mock-access-', '');
    const session = [...this.sessions.values()].find((s) => s.user.id === userId);
    if (!session) {
      throw new Error('Invalid session');
    }
    const device = this.devices.get(input.deviceId);
    if (device?.installationId !== input.installationId) {
      throw new Error('Device not activated');
    }
    return Promise.resolve(this.buildColdStart(input.installationId, input.deviceId, session.user));
  }

  refreshLease(input: {
    accessToken: string;
    installationId: string;
    deviceId: string;
    sessionPublicId?: string;
    refreshToken?: string;
    deviceProof?: KhepreeDeviceProof;
    devicePublicKey?: string;
    deviceName?: string;
    platform?: string;
    appVersion?: string;
  }): Promise<KhepreeSignedLease> {
    void input.sessionPublicId;
    void input.refreshToken;
    void input.deviceProof;
    void input.devicePublicKey;
    void input.deviceName;
    void input.platform;
    void input.appVersion;
    return this.coldStartValidate(input).then((result) => result.lease);
  }

  heartbeat(input: {
    accessToken: string;
    sessionPublicId?: string;
    deviceProof?: KhepreeDeviceProof;
  }): Promise<{ status: KhepreeHeartbeatStatus }> {
    void input.sessionPublicId;
    void input.deviceProof;
    if (mockKhepreeHeartbeatState.networkFail || process.env.KHEPREE_MOCK_HEARTBEAT_NETWORK === '1') {
      throw new KhepreeNetworkError();
    }
    if (!input.deviceProof?.nonce || !input.deviceProof.signature) {
      throw new KhepreeAccessError('HEARTBEAT_PROOF_REQUIRED', 'Device proof required.');
    }
    const envStatus = process.env.KHEPREE_MOCK_HEARTBEAT_STATUS as KhepreeHeartbeatStatus | undefined;
    const status = envStatus ?? mockKhepreeHeartbeatState.nextStatus;
    return Promise.resolve({ status });
  }

  getCheckoutUrl(input: {
    accessToken: string;
    productId: string;
    planId: string;
  }): Promise<{ checkoutUrl: string; checkoutSessionId: string }> {
    if (
      mockKhepreeCheckoutState.invalidPlanIds.has(input.planId) ||
      input.planId === 'bad-plan'
    ) {
      return Promise.reject(new KhepreeAccessError('INVALID_PLAN', 'Plan not available for checkout.'));
    }
    const catalog = buildMockPlanCatalog();
    const known = catalog.plans.some((plan) => plan.planId === input.planId);
    if (!known) {
      return Promise.reject(new KhepreeAccessError('INVALID_PLAN', 'Plan not found.'));
    }
    if (mockKhepreeCheckoutState.returnBadUrl) {
      return Promise.resolve({
        checkoutUrl: 'https://evil.example/checkout',
        checkoutSessionId: `mock-checkout-${input.planId}`,
      });
    }
    return Promise.resolve({
      checkoutUrl: `https://account.khepree.com/checkout?mock=1&plan=${encodeURIComponent(input.planId)}`,
      checkoutSessionId: `mock-checkout-${input.planId}`,
    });
  }

  getCheckoutStatus(_input: {
    accessToken: string;
    productId: string;
    checkoutSessionId: string;
  }): Promise<{ status: KhepreeCheckoutStatus }> {
    const envStatus = process.env.KHEPREE_MOCK_CHECKOUT_STATUS as KhepreeCheckoutStatus | undefined;
    if (envStatus) {
      return Promise.resolve({ status: envStatus });
    }
    const seq = mockKhepreeCheckoutState.statusSequence;
    const idx = mockKhepreeCheckoutState.statusIndex;
    mockKhepreeCheckoutState.statusIndex = Math.min(idx + 1, seq.length);
    const status = seq[Math.min(idx, seq.length - 1)] ?? 'PENDING';
    if (status === 'ACCESS_ACTIVE' && mockKhepreeCheckoutState.entitlementPendingAfterPayment) {
      return Promise.resolve({ status: 'PAID_ENTITLEMENT_PENDING' });
    }
    if (status === 'ACCESS_ACTIVE') {
      delete process.env.KHEPREE_MOCK_NO_ENTITLEMENT;
    }
    return Promise.resolve({ status });
  }

  getPlanCatalog(_input: {
    accessToken: string;
    productId: string;
  }): Promise<KhepreePlanCatalogResponse> {
    return Promise.resolve(buildMockPlanCatalog());
  }

  fetchDesktopProfile(input: { accessToken: string }): Promise<KhepreeDesktopProfile> {
    const userId = input.accessToken.replace('mock-access-', '');
    const session = [...this.sessions.values()].find((s) => s.user.id === userId);
    if (!session) {
      throw new KhepreeAccessError('AUTH_REQUIRED', 'Invalid session.');
    }
    const entitlement =
      process.env.KHEPREE_MOCK_NO_ENTITLEMENT === '1'
        ? 'none'
        : process.env.KHEPREE_MOCK_ENTITLEMENT_EXPIRED === '1'
          ? 'expired'
          : process.env.KHEPREE_MOCK_ENTITLEMENT_SUSPENDED === '1'
            ? 'suspended'
            : 'active';
    const device = [...this.devices.values()].find(
      (d) => d.installationId === [...this.devices.values()][0]?.installationId,
    );
    return Promise.resolve(
      mapDesktopMeToProfile({
        me: {
          user: {
            publicId: session.user.id,
            email: session.user.email,
            name: session.user.displayName ?? session.user.email,
          },
          plan:
            entitlement === 'active'
              ? { name: 'Pro (Dev Mock)', planSlug: 'pro', planPublicId: 'pro' }
              : null,
          entitlement: entitlement === 'active' ? { status: 'active', entitlementPublicId: `ent-${session.user.id}` } : null,
          billing: {
            hasActiveSubscription: entitlement === 'active',
            checkoutAvailable: true,
            pendingPayment: false,
          },
          device: device ? { devicePublicId: device.deviceId } : null,
          deviceUsage: { slotsUsed: this.devices.size, slotsMax: 3 },
        },
      }),
    );
  }

  revokeSession(): Promise<{ ok: true }> {
    return Promise.resolve({ ok: true });
  }
}

/** HTTP client for Khepree platform desktop API (/api/v1/desktop/*). */
export class HttpKhepreeApiClient implements KhepreeApiClient {
  constructor(private readonly baseUrl: string) {}

  private unwrapData(body: unknown): unknown {
    if (body && typeof body === 'object' && 'data' in body) {
      return (body as { data: unknown }).data;
    }
    return body;
  }

  private mapAccessError(code: string, message: string, details?: Record<string, unknown>): never {
    const mappedCode = mapDesktopApiErrorCode(code);
    if (mappedCode === 'DEVICE_LIMIT_REACHED' || mappedCode === 'DEVICE_LIMIT') {
      throw new KhepreeDeviceLimitError(
        Number(details?.devicesUsed ?? details?.slotsUsed ?? 0),
        Number(details?.devicesMax ?? details?.slotsMax ?? 0),
      );
    }
    throw new KhepreeAccessError(mappedCode, message);
  }

  private async requestRaw(
    path: string,
    init: RequestInit & { accessToken?: string },
  ): Promise<{ ok: boolean; status: number; body: unknown }> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    };
    if (init.body != null) {
      headers['Content-Type'] = 'application/json';
    }
    if (init.accessToken) {
      headers.Authorization = `Bearer ${init.accessToken}`;
    }
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    } catch {
      throw new KhepreeNetworkError();
    }
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  }

  private async requestData<T>(
    path: string,
    init: RequestInit & { accessToken?: string },
    schema: ZodType<T>,
    context: string,
  ): Promise<T> {
    const { ok, status, body } = await this.requestRaw(path, init);
    if (!ok) {
      const errorBody = body as {
        error?: { code?: string; message?: string; details?: Record<string, unknown> };
      };
      const code = errorBody.error?.code ?? `HTTP_${status}`;
      this.mapAccessError(
        code,
        errorBody.error?.message ?? `Request failed (${status})`,
        errorBody.error?.details,
      );
    }
    return parseApiResponse(schema, this.unwrapData(body), context);
  }

  startDeviceAuth(_input: DeviceAuthStartInput): Promise<{ ok: true }> {
    return Promise.resolve({ ok: true });
  }

  exchangeDeviceAuth(input: DeviceAuthExchangeInput): Promise<KhepreeAuthTokenResult> {
    return this.requestData(
      KHEPREE_DESKTOP_API_PATHS.authExchange,
      {
        method: 'POST',
        body: JSON.stringify({
          clientId: input.clientId,
          code: input.code,
          redirectUri: input.redirectUri,
          codeVerifier: input.codeVerifier,
          devicePublicKey: input.devicePublicKey,
          installationId: input.installationId,
          platform: input.platform,
          deviceName: input.deviceName,
          appVersion: input.appVersion,
        }),
      },
      z.object({
        sessionPublicId: z.string(),
        accessToken: z.string(),
        refreshToken: z.string(),
        accessExpiresAt: z.string(),
        user: z.object({
          publicId: z.string(),
          email: z.string().email(),
          name: z.string(),
        }),
      }),
      'desktop/auth/exchange',
    ).then((data) => ({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresIn: Math.max(60, Math.floor((Date.parse(data.accessExpiresAt) - Date.now()) / 1000)),
      user: {
        id: data.user.publicId,
        email: data.user.email,
        displayName: data.user.name || null,
      },
      sessionPublicId: data.sessionPublicId,
    } as KhepreeAuthTokenResult & { sessionPublicId: string }));
  }

  refreshSession(input: {
    refreshToken: string;
    installationId: string;
    sessionPublicId: string;
    deviceProof: KhepreeDeviceProof;
  }): Promise<KhepreeAuthTokenResult & { sessionPublicId: string; lease?: PlatformSignedLease }> {
    void input.installationId;
    const body = JSON.stringify({
      sessionPublicId: input.sessionPublicId,
      refreshToken: input.refreshToken,
      deviceProof: input.deviceProof,
    });
    return this.requestData(
      KHEPREE_DESKTOP_API_PATHS.authRefresh,
      { method: 'POST', body },
      z.object({
        accessToken: z.string(),
        refreshToken: z.string(),
        accessExpiresAt: z.string(),
        lease: z.unknown().optional(),
        user: z
          .object({
            publicId: z.string(),
            email: z.string().email(),
            name: z.string(),
          })
          .optional(),
      }),
      'desktop/auth/refresh',
    ).then((data) => ({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresIn: Math.max(60, Math.floor((Date.parse(data.accessExpiresAt) - Date.now()) / 1000)),
      user: data.user
        ? {
            id: data.user.publicId,
            email: data.user.email,
            displayName: data.user.name || null,
          }
        : { id: input.sessionPublicId, email: 'unknown@khepree.local', displayName: null },
      sessionPublicId: input.sessionPublicId,
      lease: isPlatformSignedLease(data.lease) ? data.lease : undefined,
    }));
  }

  activateDevice(input: {
    accessToken: string;
    installationId: string;
    devicePublicKey: string;
    deviceName: string;
    platform?: string;
    appVersion?: string;
  }): Promise<KhepreeActivateDeviceResponse & { lease?: PlatformSignedLease }> {
    return this.requestData(
      KHEPREE_DESKTOP_API_PATHS.activate,
      {
        method: 'POST',
        accessToken: input.accessToken,
        body: JSON.stringify({
          clientId: getKhepreeOAuthClientId(),
          installationId: input.installationId,
          devicePublicKey: input.devicePublicKey,
          deviceName: input.deviceName,
          platform: input.platform,
          appVersion: input.appVersion,
        }),
      },
      z.object({
        devicePublicId: z.string(),
        lease: z.unknown(),
        features: z.array(z.object({ key: z.string(), value: z.unknown() })).optional(),
      }),
      'desktop/activate',
    ).then((data) => ({
      deviceId: data.devicePublicId,
      devicesUsed: 0,
      devicesMax: 0,
      lease: isPlatformSignedLease(data.lease) ? data.lease : undefined,
    }));
  }

  private getDesktopMe(accessToken: string): Promise<{
    user: { publicId: string; email: string; name: string };
    plan: { name: string; planSlug: string | null; planPublicId: string | null } | null;
    entitlement: { status: string; entitlementPublicId: string } | null;
    billing: { hasActiveSubscription: boolean; checkoutAvailable: boolean; pendingPayment: boolean };
    device: { devicePublicId: string } | null;
    deviceUsage: { slotsUsed: number; slotsMax: number } | null;
  }> {
    return this.requestData(
      KHEPREE_DESKTOP_API_PATHS.me,
      { method: 'GET', accessToken },
      z.object({
        user: z.object({ publicId: z.string(), email: z.string(), name: z.string() }),
        plan: z
          .object({
            name: z.string(),
            planSlug: z.string().nullable(),
            planPublicId: z.string().nullable(),
          })
          .nullable(),
        entitlement: z
          .object({ status: z.string(), entitlementPublicId: z.string() })
          .nullable(),
        billing: z.object({
          hasActiveSubscription: z.boolean(),
          checkoutAvailable: z.boolean(),
          pendingPayment: z.boolean(),
        }),
        device: z.object({ devicePublicId: z.string() }).nullable(),
        deviceUsage: z.object({ slotsUsed: z.number(), slotsMax: z.number() }).nullable(),
      }),
      'desktop/me',
    );
  }

  fetchDesktopProfile(input: { accessToken: string }): Promise<KhepreeDesktopProfile> {
    return this.getDesktopMe(input.accessToken).then((me) => mapDesktopMeToProfile({ me }));
  }

  coldStartValidate(input: {
    accessToken: string;
    installationId: string;
    deviceId: string;
    sessionPublicId: string;
    refreshToken: string;
    deviceProof: KhepreeDeviceProof;
    devicePublicKey: string;
    deviceName: string;
    platform?: string;
    appVersion?: string;
  }): Promise<KhepreeColdStartResult> {
    return this.getDesktopMe(input.accessToken).then(async (me) => {
      let lease: PlatformSignedLease | undefined;
      try {
        const refreshed = await this.refreshSession({
          refreshToken: input.refreshToken,
          installationId: input.installationId,
          sessionPublicId: input.sessionPublicId,
          deviceProof: input.deviceProof,
        });
        lease = refreshed.lease;
      } catch {
        lease = undefined;
      }

      if (!lease) {
        const activation = await this.activateDevice({
          accessToken: input.accessToken,
          installationId: input.installationId,
          devicePublicKey: input.devicePublicKey,
          deviceName: input.deviceName,
          platform: input.platform,
          appVersion: input.appVersion,
        });
        lease = activation.lease;
      }

      if (!lease || !isPlatformSignedLease(lease)) {
        throw new KhepreeAccessError('ENTITLEMENT_MISSING', 'Could not obtain a valid license lease.');
      }

      verifyPlatformSignedLease(lease, { productSlug: getKhepreeProductId() });
      const features = mapPlatformFeatures(lease.payload.features);
      return mapDesktopMeToColdStart({
        me,
        lease,
        installationId: input.installationId,
        productSlug: getKhepreeProductId(),
        features,
      });
    });
  }

  refreshLease(input: {
    accessToken: string;
    installationId: string;
    deviceId: string;
    sessionPublicId: string;
    refreshToken: string;
    deviceProof: KhepreeDeviceProof;
    devicePublicKey: string;
    deviceName: string;
    platform?: string;
    appVersion?: string;
  }): Promise<KhepreeSignedLease> {
    return this.coldStartValidate(input).then((result) => result.lease);
  }

  heartbeat(input: {
    accessToken: string;
    sessionPublicId: string;
    deviceProof: KhepreeDeviceProof;
  }): Promise<{ status: KhepreeHeartbeatStatus }> {
    const body = JSON.stringify({
      sessionPublicId: input.sessionPublicId,
      accessToken: input.accessToken,
      deviceProof: input.deviceProof,
    });
    return this.requestData(
      KHEPREE_DESKTOP_API_PATHS.heartbeat,
      { method: 'POST', accessToken: input.accessToken, body },
      z.object({ state: z.string() }),
      'desktop/heartbeat',
    ).then((data) => ({
      status: data.state as KhepreeHeartbeatStatus,
    }));
  }

  getCheckoutUrl(input: {
    accessToken: string;
    productId: string;
    planId: string;
  }): Promise<{ checkoutUrl: string; checkoutSessionId: string }> {
    void input.productId;
    const [planPublicId, pricePublicId] = input.planId.includes(':')
      ? input.planId.split(':', 2)
      : [input.planId, input.planId];
    return this.requestData(
      KHEPREE_DESKTOP_API_PATHS.checkout,
      {
        method: 'POST',
        accessToken: input.accessToken,
        body: JSON.stringify({
          clientId: getKhepreeOAuthClientId(),
          planPublicId,
          pricePublicId,
        }),
      },
      z.object({ checkoutPublicId: z.string(), handoffUrl: z.string().url() }),
      'desktop/checkout',
    ).then((data) => ({
      checkoutUrl: data.handoffUrl,
      checkoutSessionId: data.checkoutPublicId,
    }));
  }

  getCheckoutStatus(input: {
    accessToken: string;
    productId: string;
    checkoutSessionId: string;
  }): Promise<{ status: KhepreeCheckoutStatus }> {
    void input.productId;
    const clientId = encodeURIComponent(getKhepreeOAuthClientId());
    return this.requestData(
      `${KHEPREE_DESKTOP_API_PATHS.checkout}/${encodeURIComponent(input.checkoutSessionId)}/status?clientId=${clientId}`,
      { method: 'GET', accessToken: input.accessToken },
      z.object({ status: z.string() }),
      'desktop/checkout/status',
    ).then((data) => {
      const mapped =
        data.status === 'PAID_PROCESSING_ACCESS'
          ? 'PAID_ENTITLEMENT_PENDING'
          : (data.status as KhepreeCheckoutStatus);
      return { status: mapped };
    });
  }

  getPlanCatalog(input: {
    accessToken: string;
    productId: string;
  }): Promise<KhepreePlanCatalogResponse> {
    void input.productId;
    const clientId = encodeURIComponent(getKhepreeOAuthClientId());
    return this.requestData(
      `${KHEPREE_DESKTOP_API_PATHS.plans}?clientId=${clientId}`,
      { method: 'GET', accessToken: input.accessToken },
      z.object({
        currentPlanId: z.string().nullable(),
        plans: z.array(
          z.object({
            planPublicId: z.string(),
            pricePublicId: z.string(),
            planSlug: z.string().nullable(),
            name: z.string(),
            priceAmount: z.number(),
            currency: z.string(),
            accessTermLabel: z.string(),
            isCurrent: z.boolean(),
            isUpgradeAvailable: z.boolean(),
          }),
        ),
      }),
      'desktop/plans',
    ).then((data) => ({
      currentPlanId: data.currentPlanId,
      plans: data.plans.map((plan) => ({
        planId: `${plan.planPublicId}:${plan.pricePublicId}`,
        planName: plan.name,
        price: plan.priceAmount,
        currency: plan.currency,
        accessTerm: plan.accessTermLabel,
        featureSummary: [],
        isCurrent: plan.isCurrent,
        isUpgradeAvailable: plan.isUpgradeAvailable,
      })),
    }));
  }

  revokeSession(input: { accessToken: string }): Promise<{ ok: true }> {
    return this.requestData(
      KHEPREE_DESKTOP_API_PATHS.authLogout,
      { method: 'POST', accessToken: input.accessToken, body: JSON.stringify({}) },
      z.object({ ok: z.literal(true).optional() }).or(z.object({})),
      'desktop/auth/logout',
    ).then(() => ({ ok: true as const }));
  }
}

export function resetMockKhepreeApiStateForTests(): void {
  mockSessions.clear();
  mockDevices.clear();
  mockPendingAuth.clear();
  mockKhepreeHeartbeatState.nextStatus = 'ACTIVE';
  mockKhepreeHeartbeatState.networkFail = false;
  mockKhepreeCheckoutState.statusSequence = ['PENDING', 'PENDING', 'ACCESS_ACTIVE'];
  mockKhepreeCheckoutState.statusIndex = 0;
  mockKhepreeCheckoutState.returnBadUrl = false;
  mockKhepreeCheckoutState.invalidPlanIds = new Set();
  mockKhepreeCheckoutState.entitlementPendingAfterPayment = false;
  delete process.env.KHEPREE_MOCK_CHECKOUT_STATUS;
}

export function createKhepreeApiClient(baseUrl: string, useMock: boolean): KhepreeApiClient {
  if (useMock) {
    return new MockKhepreeApiClient();
  }
  return new HttpKhepreeApiClient(baseUrl);
}
