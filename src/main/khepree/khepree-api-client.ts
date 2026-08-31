import { createPrivateKey, sign } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type { ZodType } from 'zod';
import { z } from 'zod';
import { KhepreeSignedLeaseSchema, type KhepreeSignedLease, type KhepreeSignedLeasePayload } from '@shared/schemas/khepree';
import type { KhepreeHeartbeatStatus } from '@shared/constants/khepree';
import {
  KhepreeActivateDeviceResponseSchema,
  KhepreeAuthTokenResultSchema,
  KhepreeCheckoutUrlResponseSchema,
  KhepreeColdStartResultSchema,
  KhepreeHeartbeatResponseSchema,
  type KhepreeActivateDeviceResponse,
  type KhepreeAuthTokenResult,
  type KhepreeColdStartResult,
} from '@shared/schemas/khepree-api';
import { getDevSigningKeys } from './dev-signing-keys';
import { deriveS256Challenge } from './pkce';
import { KhepreeApiResponseInvalidError, KhepreeDeviceLimitError, KhepreeNetworkError, KhepreeAccessError } from './errors';

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
}

function parseApiResponse<T>(schema: ZodType<T>, body: unknown, context: string): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new KhepreeApiResponseInvalidError(context);
  }
  return parsed.data;
}

const KhepreeOkResponseSchema = z.object({ ok: z.literal(true) });

export interface KhepreeApiClient {
  startDeviceAuth(input: DeviceAuthStartInput): Promise<{ ok: true }>;

  exchangeDeviceAuth(input: DeviceAuthExchangeInput): Promise<KhepreeAuthTokenResult>;

  refreshSession(input: {
    refreshToken: string;
    installationId: string;
  }): Promise<KhepreeAuthTokenResult>;

  activateDevice(input: {
    accessToken: string;
    installationId: string;
    devicePublicKey: string;
    deviceName: string;
  }): Promise<KhepreeActivateDeviceResponse>;

  coldStartValidate(input: {
    accessToken: string;
    installationId: string;
    deviceId: string;
  }): Promise<KhepreeColdStartResult>;

  refreshLease(input: {
    accessToken: string;
    installationId: string;
    deviceId: string;
  }): Promise<KhepreeSignedLease>;

  heartbeat(input: {
    accessToken: string;
    installationId: string;
    deviceId: string;
  }): Promise<{ status: KhepreeHeartbeatStatus }>;

  getCheckoutUrl(input: { accessToken: string; productId: string }): Promise<{ checkoutUrl: string }>;
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
    });
  }

  refreshSession(input: {
    refreshToken: string;
    installationId: string;
  }): Promise<KhepreeAuthTokenResult> {
    const session = this.sessions.get(input.refreshToken);
    if (!session) {
      return Promise.reject(new KhepreeAccessError('INVALID_REFRESH', 'Refresh token invalid'));
    }
    return Promise.resolve({
      accessToken: `mock-access-${session.user.id}`,
      refreshToken: input.refreshToken,
      expiresIn: 3600,
      user: session.user,
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
            translation: true,
            export: true,
            multi_provider: true,
            learning: true,
          }
        : {};
    const payload: KhepreeSignedLeasePayload = {
      installationId,
      deviceId,
      productId: process.env.KHEPREE_MOCK_WRONG_PRODUCT === '1' ? 'wrong-product' : 'novel-ai',
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
  }): Promise<KhepreeColdStartResult> {
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
  }): Promise<KhepreeSignedLease> {
    return this.coldStartValidate(input).then((result) => result.lease);
  }

  heartbeat(): Promise<{ status: KhepreeHeartbeatStatus }> {
    return Promise.resolve({ status: 'ACTIVE' });
  }

  getCheckoutUrl(): Promise<{ checkoutUrl: string }> {
    return Promise.resolve({ checkoutUrl: 'https://account.khepree.com/checkout?mock=1' });
  }
}

/** HTTP client for production Khepree API. */
export class HttpKhepreeApiClient implements KhepreeApiClient {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(
    path: string,
    init: RequestInit & { accessToken?: string },
    schema: ZodType<T>,
    context: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    };
    if (init.accessToken) {
      headers.Authorization = `Bearer ${init.accessToken}`;
    }
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers,
      });
    } catch {
      throw new KhepreeNetworkError();
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorBody = body as {
        error?: { code?: string; message?: string; devicesUsed?: number; devicesMax?: number };
      };
      const code = errorBody.error?.code ?? `HTTP_${response.status}`;
      if (code === 'DEVICE_LIMIT') {
        throw new KhepreeDeviceLimitError(
          errorBody.error?.devicesUsed ?? 0,
          errorBody.error?.devicesMax ?? 0,
        );
      }
      throw new KhepreeAccessError(code, errorBody.error?.message ?? response.statusText);
    }
    return parseApiResponse(schema, body, context);
  }

  startDeviceAuth(input: DeviceAuthStartInput): Promise<{ ok: true }> {
    return this.request(
      '/auth/device/start',
      { method: 'POST', body: JSON.stringify(input) },
      KhepreeOkResponseSchema,
      'auth/device/start',
    );
  }

  exchangeDeviceAuth(input: DeviceAuthExchangeInput): Promise<KhepreeAuthTokenResult> {
    return this.request(
      '/auth/device/exchange',
      { method: 'POST', body: JSON.stringify(input) },
      KhepreeAuthTokenResultSchema,
      'auth/device/exchange',
    );
  }

  refreshSession(input: {
    refreshToken: string;
    installationId: string;
  }): Promise<KhepreeAuthTokenResult> {
    return this.request(
      '/auth/refresh',
      { method: 'POST', body: JSON.stringify(input) },
      KhepreeAuthTokenResultSchema,
      'auth/refresh',
    );
  }

  activateDevice(input: {
    accessToken: string;
    installationId: string;
    devicePublicKey: string;
    deviceName: string;
  }): Promise<KhepreeActivateDeviceResponse> {
    return this.request(
      '/devices/activate',
      {
        method: 'POST',
        accessToken: input.accessToken,
        body: JSON.stringify({
          installationId: input.installationId,
          devicePublicKey: input.devicePublicKey,
          deviceName: input.deviceName,
        }),
      },
      KhepreeActivateDeviceResponseSchema,
      'devices/activate',
    );
  }

  coldStartValidate(input: {
    accessToken: string;
    installationId: string;
    deviceId: string;
  }): Promise<KhepreeColdStartResult> {
    return this.request(
      '/session/cold-start',
      {
        method: 'POST',
        accessToken: input.accessToken,
        body: JSON.stringify({
          installationId: input.installationId,
          deviceId: input.deviceId,
        }),
      },
      KhepreeColdStartResultSchema,
      'session/cold-start',
    );
  }

  refreshLease(input: {
    accessToken: string;
    installationId: string;
    deviceId: string;
  }): Promise<KhepreeSignedLease> {
    return this.request(
      '/lease/refresh',
      {
        method: 'POST',
        accessToken: input.accessToken,
        body: JSON.stringify({
          installationId: input.installationId,
          deviceId: input.deviceId,
        }),
      },
      KhepreeSignedLeaseSchema,
      'lease/refresh',
    );
  }

  heartbeat(input: {
    accessToken: string;
    installationId: string;
    deviceId: string;
  }): Promise<{ status: KhepreeHeartbeatStatus }> {
    return this.request(
      '/heartbeat',
      {
        method: 'POST',
        accessToken: input.accessToken,
        body: JSON.stringify({
          installationId: input.installationId,
          deviceId: input.deviceId,
        }),
      },
      KhepreeHeartbeatResponseSchema,
      'heartbeat',
    );
  }

  getCheckoutUrl(input: {
    accessToken: string;
    productId: string;
  }): Promise<{ checkoutUrl: string }> {
    return this.request(
      '/billing/checkout-url',
      {
        method: 'POST',
        accessToken: input.accessToken,
        body: JSON.stringify({ productId: input.productId }),
      },
      KhepreeCheckoutUrlResponseSchema,
      'billing/checkout-url',
    );
  }
}

export function resetMockKhepreeApiStateForTests(): void {
  mockSessions.clear();
  mockDevices.clear();
  mockPendingAuth.clear();
}

export function createKhepreeApiClient(baseUrl: string, useMock: boolean): KhepreeApiClient {
  if (useMock) {
    return new MockKhepreeApiClient();
  }
  return new HttpKhepreeApiClient(baseUrl);
}
