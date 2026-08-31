import { createHash, createPublicKey, verify } from 'node:crypto';
import { KHEPREE_DEFAULT_HEARTBEAT_MS } from '@shared/constants/khepree';
import type {
  KhepreeBillingState,
  KhepreeEntitlementState,
  KhepreeSignedLease,
} from '@shared/schemas/khepree';
import type { KhepreeColdStartResult } from '@shared/schemas/khepree-api';
import type { KhepreeDesktopProfile } from '@shared/schemas/khepree-api';
import { resolveTrustedSigningKey } from './config';
import { KhepreeLeaseInvalidError } from './errors';

/** Raw signed lease from Khepree platform API. */
export interface PlatformSignedLease {
  payload: {
    version: number;
    jti: string;
    subject: string;
    licenseId: string;
    entitlementId: string;
    productId: string;
    productSlug: string;
    plan: string;
    deviceId: string;
    featureSnapshotVersion: number;
    features: Record<string, { valueType: string; booleanValue?: boolean; integerValue?: number; stringValue?: string }>;
    iat: number;
    exp: number;
  };
  signature: string;
  keyId: string;
}

export const PLATFORM_MAPPED_LEASE_KEY_ID = 'platform-mapped' as const;

function canonicalizeValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new Error('Lease payload numbers must be integers');
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalizeValue).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalizeValue(record[key])}`).join(',')}}`;
  }
  throw new Error('Lease payload contains a non-canonical value');
}

function canonicalizePlatformLeasePayload(payload: PlatformSignedLease['payload']): Buffer {
  return Buffer.from(canonicalizeValue(payload), 'utf8');
}

export function verifyPlatformSignedLease(
  lease: PlatformSignedLease,
  options: { now?: number; productSlug?: string } = {},
): PlatformSignedLease['payload'] {
  const now = options.now ?? Date.now();
  const publicKeySpki = resolveTrustedSigningKey(lease.keyId);
  if (!publicKeySpki) {
    throw new KhepreeLeaseInvalidError(`Unknown signing keyId: ${lease.keyId}`);
  }

  let publicKey;
  try {
    publicKey = createPublicKey({
      key: Buffer.from(publicKeySpki, 'base64'),
      format: 'der',
      type: 'spki',
    });
  } catch {
    throw new KhepreeLeaseInvalidError('Trusted signing public key is misconfigured.');
  }

  const message = canonicalizePlatformLeasePayload(lease.payload);
  const signature = Buffer.from(lease.signature, 'base64');
  const ok = verify(null, message, publicKey, signature);
  if (!ok) {
    throw new KhepreeLeaseInvalidError('Lease Ed25519 signature verification failed.');
  }

  const expiresAtMs = lease.payload.exp * 1000;
  const issuedAtMs = lease.payload.iat * 1000;
  const clockSkewMs = 5 * 60 * 1000;
  if (issuedAtMs > now + clockSkewMs) {
    throw new KhepreeLeaseInvalidError('Lease iat is in the future.');
  }
  if (now > expiresAtMs) {
    throw new KhepreeLeaseInvalidError('Lease has expired.');
  }

  if (options.productSlug && lease.payload.productSlug !== options.productSlug) {
    throw new KhepreeLeaseInvalidError('Lease productSlug does not match this product.');
  }

  return lease.payload;
}

export function mapPlatformFeatures(
  features: PlatformSignedLease['payload']['features'] | Array<{ key: string; value: { valueType: string; booleanValue?: boolean } }>,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (Array.isArray(features)) {
    for (const row of features) {
      if (row.value.valueType === 'boolean') {
        out[row.key] = row.value.booleanValue === true;
      }
    }
    return out;
  }
  for (const [key, value] of Object.entries(features)) {
    if (value.valueType === 'boolean') {
      out[key] = value.booleanValue === true;
    }
  }
  return out;
}

export function mapPlatformLeaseToAppLease(
  lease: PlatformSignedLease,
  ctx: { installationId: string; devicePublicId: string; productSlug: string },
): KhepreeSignedLease {
  return {
    payload: {
      installationId: ctx.installationId,
      deviceId: ctx.devicePublicId,
      productId: ctx.productSlug,
      entitlementId: lease.payload.entitlementId,
      features: mapPlatformFeatures(lease.payload.features),
      iat: new Date(lease.payload.iat * 1000).toISOString(),
      expiresAt: new Date(lease.payload.exp * 1000).toISOString(),
      graceUntil: null,
      heartbeatIntervalMs: KHEPREE_DEFAULT_HEARTBEAT_MS,
    },
    signature: lease.signature,
    keyId: PLATFORM_MAPPED_LEASE_KEY_ID,
  };
}

export function mapEntitlementStatus(status: string): KhepreeEntitlementState {
  switch (status) {
    case 'active':
      return 'active';
    case 'suspended':
      return 'suspended';
    case 'expired':
    case 'revoked':
      return 'expired';
    default:
      return 'none';
  }
}

export function computeSigningKeyId(publicKeySpkiBase64: string): string {
  return createHash('sha256').update(publicKeySpkiBase64, 'utf8').digest('hex').slice(0, 16);
}

export function isPlatformSignedLease(raw: unknown): raw is PlatformSignedLease {
  if (!raw || typeof raw !== 'object') return false;
  const lease = raw as PlatformSignedLease;
  return (
    typeof lease.signature === 'string' &&
    typeof lease.keyId === 'string' &&
    lease.payload != null &&
    typeof lease.payload === 'object' &&
    typeof lease.payload.version === 'number'
  );
}

export function mapDesktopMeToProfile(input: {
  me: {
    user: { publicId: string; email: string; name: string };
    plan: { name: string; planSlug: string | null; planPublicId: string | null } | null;
    entitlement: { status: string; entitlementPublicId: string } | null;
    billing: { hasActiveSubscription: boolean; checkoutAvailable: boolean; pendingPayment: boolean };
    device: { devicePublicId: string } | null;
    deviceUsage: { slotsUsed: number; slotsMax: number } | null;
  };
}): KhepreeDesktopProfile {
  const entitlement = input.me.entitlement
    ? mapEntitlementStatus(input.me.entitlement.status)
    : ('none' as const);
  const billing: KhepreeBillingState =
    input.me.billing.hasActiveSubscription || entitlement === 'active'
      ? 'active'
      : input.me.billing.pendingPayment
        ? 'checkout_pending'
        : 'none';

  return {
    user: {
      id: input.me.user.publicId,
      email: input.me.user.email,
      displayName: input.me.user.name || null,
    },
    plan: input.me.plan
      ? {
          planId: input.me.plan.planPublicId ?? input.me.plan.planSlug ?? 'unknown',
          planName: input.me.plan.name,
          status: entitlement === 'active' ? 'active' : 'none',
        }
      : null,
    entitlement,
    billing,
    devicesUsed: input.me.deviceUsage?.slotsUsed ?? null,
    devicesMax: input.me.deviceUsage?.slotsMax ?? null,
    deviceId: input.me.device?.devicePublicId ?? null,
  };
}

export function mapDesktopMeToColdStart(input: {
  me: {
    user: { publicId: string; email: string; name: string };
    plan: { name: string; planSlug: string | null; planPublicId: string | null } | null;
    entitlement: { status: string; entitlementPublicId: string } | null;
    billing: { hasActiveSubscription: boolean; checkoutAvailable: boolean; pendingPayment: boolean };
    device: { devicePublicId: string } | null;
    deviceUsage: { slotsUsed: number; slotsMax: number } | null;
  };
  lease: PlatformSignedLease;
  installationId: string;
  productSlug: string;
  features: Record<string, boolean>;
}): KhepreeColdStartResult {
  const entitlement = input.me.entitlement
    ? mapEntitlementStatus(input.me.entitlement.status)
    : ('none' as const);
  const billing: KhepreeBillingState =
    input.me.billing.hasActiveSubscription || entitlement === 'active'
      ? 'active'
      : input.me.billing.pendingPayment
        ? 'checkout_pending'
        : 'none';

  const mappedLease = mapPlatformLeaseToAppLease(input.lease, {
    installationId: input.installationId,
    devicePublicId: input.me.device?.devicePublicId ?? '',
    productSlug: input.productSlug,
  });

  return {
    user: {
      id: input.me.user.publicId,
      email: input.me.user.email,
      displayName: input.me.user.name || null,
    },
    plan: {
      planId: input.me.plan?.planPublicId ?? input.me.plan?.planSlug ?? 'unknown',
      planName: input.me.plan?.name ?? 'Unknown',
      status: entitlement === 'active' ? 'active' : 'none',
    },
    entitlement,
    billing,
    features: input.features,
    lease: mappedLease,
    devicesUsed: input.me.deviceUsage?.slotsUsed ?? 0,
    devicesMax: input.me.deviceUsage?.slotsMax ?? 0,
    deviceId: input.me.device?.devicePublicId ?? '',
  };
}
