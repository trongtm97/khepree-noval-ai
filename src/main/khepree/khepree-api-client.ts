import { createPrivateKey, sign } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type {
  KhepreeSignedLease,
  KhepreeSignedLeasePayload,
} from '@shared/schemas/khepree';
import type {
  KhepreeBillingState,
  KhepreeEntitlementState,
  KhepreePlanDisplay,
  KhepreeUserDisplay,
} from '@shared/schemas/khepree';
import type { KhepreeHeartbeatStatus } from '@shared/constants/khepree';
import { getDevSigningKeys } from './dev-signing-keys';

export interface ColdStartResult {
  user: KhepreeUserDisplay;
  plan: KhepreePlanDisplay;
  entitlement: KhepreeEntitlementState;
  billing: KhepreeBillingState;
  features: Record<string, boolean>;
  lease: KhepreeSignedLease;
  devicesUsed: number;
  devicesMax: number;
  deviceId: string;
}

export interface AuthTokenResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: KhepreeUserDisplay;
}

export interface KhepreeApiClient {
  startDeviceAuth(input: {
    installationId: string;
    devicePublicKey: string;
    productId: string;
    redirectUri: string;
  }): Promise<{ authUrl: string; state: string }>;

  completeDeviceAuth(input: {
    state: string;
    code: string;
    installationId: string;
  }): Promise<AuthTokenResult>;

  refreshSession(input: {
    refreshToken: string;
    installationId: string;
  }): Promise<AuthTokenResult>;

  activateDevice(input: {
    accessToken: string;
    installationId: string;
    devicePublicKey: string;
    deviceName: string;
  }): Promise<{ deviceId: string; devicesUsed: number; devicesMax: number }>;

  coldStartValidate(input: {
    accessToken: string;
    installationId: string;
    deviceId: string;
  }): Promise<ColdStartResult>;

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

/** In-process mock for dev — simulates Khepree API without network. */
export class MockKhepreeApiClient implements KhepreeApiClient {
  private sessions = new Map<string, { user: KhepreeUserDisplay; refreshToken: string }>();
  private devices = new Map<string, { installationId: string; deviceId: string }>();
  private authStates = new Map<string, { installationId: string }>();

  startDeviceAuth(input: {
    installationId: string;
    devicePublicKey: string;
    productId: string;
    redirectUri: string;
  }): Promise<{ authUrl: string; state: string }> {
    const state = randomUUID();
    this.authStates.set(state, { installationId: input.installationId });
    const url = new URL(input.redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('code', `mock-code-${state.slice(0, 8)}`);
    return Promise.resolve({ authUrl: url.toString(), state });
  }

  completeDeviceAuth(input: {
    state: string;
    code: string;
    installationId: string;
  }): Promise<AuthTokenResult> {
    const pending = this.authStates.get(input.state);
    if (pending?.installationId !== input.installationId) {
      throw new Error('Invalid auth state');
    }
    this.authStates.delete(input.state);
    const user: KhepreeUserDisplay = {
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
  }): Promise<AuthTokenResult> {
    const session = this.sessions.get(input.refreshToken);
    if (!session) {
      throw new Error('Invalid refresh token');
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
  }): Promise<{ deviceId: string; devicesUsed: number; devicesMax: number }> {
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
    if (this.devices.size >= 3 && process.env.KHEPREE_MOCK_DEVICE_LIMIT === '1') {
      const err = new Error('DEVICE_LIMIT') as Error & { devicesUsed: number; devicesMax: number };
      err.devicesUsed = 3;
      err.devicesMax = 3;
      throw err;
    }
    const deviceId = randomUUID();
    this.devices.set(deviceId, { installationId: input.installationId, deviceId });
    return Promise.resolve({ deviceId, devicesUsed: this.devices.size, devicesMax: 3 });
  }

  private buildColdStart(
    installationId: string,
    deviceId: string,
    user: KhepreeUserDisplay,
  ): ColdStartResult {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const graceUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const features = {
      translation: true,
      export: true,
      multi_provider: true,
      learning: true,
    };
    const payload: KhepreeSignedLeasePayload = {
      installationId,
      deviceId,
      productId: 'novel-ai',
      features,
      expiresAt,
      graceUntil,
      heartbeatIntervalMs: 15 * 60 * 1000,
    };
    return {
      user,
      plan: { planId: 'pro', planName: 'Pro (Dev Mock)', status: 'active' },
      entitlement: 'active',
      billing: 'active',
      features,
      lease: signLeasePayload(payload),
      devicesUsed: this.devices.size,
      devicesMax: 3,
      deviceId,
    };
  }

  coldStartValidate(input: {
    accessToken: string;
    installationId: string;
    deviceId: string;
  }): Promise<ColdStartResult> {
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
      const { KhepreeNetworkError } = await import('./errors');
      throw new KhepreeNetworkError();
    }
    const body = (await response.json().catch(() => ({}))) as T & {
      error?: { code?: string; message?: string; devicesUsed?: number; devicesMax?: number };
    };
    if (!response.ok) {
      const code = body.error?.code ?? `HTTP_${response.status}`;
      if (code === 'DEVICE_LIMIT') {
        const { KhepreeDeviceLimitError } = await import('./errors');
        throw new KhepreeDeviceLimitError(
          body.error?.devicesUsed ?? 0,
          body.error?.devicesMax ?? 0,
        );
      }
      const { KhepreeAccessError } = await import('./errors');
      throw new KhepreeAccessError(code, body.error?.message ?? response.statusText);
    }
    return body;
  }

  startDeviceAuth(input: {
    installationId: string;
    devicePublicKey: string;
    productId: string;
    redirectUri: string;
  }): Promise<{ authUrl: string; state: string }> {
    return this.request('/auth/device/start', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  completeDeviceAuth(input: {
    state: string;
    code: string;
    installationId: string;
  }): Promise<AuthTokenResult> {
    return this.request('/auth/device/complete', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  refreshSession(input: {
    refreshToken: string;
    installationId: string;
  }): Promise<AuthTokenResult> {
    return this.request('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  activateDevice(input: {
    accessToken: string;
    installationId: string;
    devicePublicKey: string;
    deviceName: string;
  }): Promise<{ deviceId: string; devicesUsed: number; devicesMax: number }> {
    return this.request('/devices/activate', {
      method: 'POST',
      accessToken: input.accessToken,
      body: JSON.stringify({
        installationId: input.installationId,
        devicePublicKey: input.devicePublicKey,
        deviceName: input.deviceName,
      }),
    });
  }

  coldStartValidate(input: {
    accessToken: string;
    installationId: string;
    deviceId: string;
  }): Promise<ColdStartResult> {
    return this.request('/session/cold-start', {
      method: 'POST',
      accessToken: input.accessToken,
      body: JSON.stringify({
        installationId: input.installationId,
        deviceId: input.deviceId,
      }),
    });
  }

  refreshLease(input: {
    accessToken: string;
    installationId: string;
    deviceId: string;
  }): Promise<KhepreeSignedLease> {
    return this.request('/lease/refresh', {
      method: 'POST',
      accessToken: input.accessToken,
      body: JSON.stringify({
        installationId: input.installationId,
        deviceId: input.deviceId,
      }),
    });
  }

  heartbeat(input: {
    accessToken: string;
    installationId: string;
    deviceId: string;
  }): Promise<{ status: KhepreeHeartbeatStatus }> {
    return this.request('/heartbeat', {
      method: 'POST',
      accessToken: input.accessToken,
      body: JSON.stringify({
        installationId: input.installationId,
        deviceId: input.deviceId,
      }),
    });
  }

  getCheckoutUrl(input: {
    accessToken: string;
    productId: string;
  }): Promise<{ checkoutUrl: string }> {
    return this.request('/billing/checkout-url', {
      method: 'POST',
      accessToken: input.accessToken,
      body: JSON.stringify({ productId: input.productId }),
    });
  }
}

export function createKhepreeApiClient(baseUrl: string, useMock: boolean): KhepreeApiClient {
  if (useMock) {
    return new MockKhepreeApiClient();
  }
  return new HttpKhepreeApiClient(baseUrl);
}
