import { z } from 'zod';
import {
  KHEPREE_EXTERNAL_URLS,
  KHEPREE_GATE_PHASES,
  KHEPREE_HEARTBEAT_STATUSES,
} from '../constants/khepree';

export const KhepreeUserDisplaySchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string().nullable(),
});

export type KhepreeUserDisplay = z.infer<typeof KhepreeUserDisplaySchema>;

export const KhepreePlanDisplaySchema = z.object({
  planId: z.string(),
  planName: z.string(),
  status: z.enum(['active', 'trialing', 'past_due', 'canceled', 'none']),
});

export type KhepreePlanDisplay = z.infer<typeof KhepreePlanDisplaySchema>;

export const KhepreeDeviceDisplaySchema = z.object({
  deviceId: z.string(),
  deviceName: z.string(),
  isCurrent: z.boolean(),
  lastSeenAt: z.string().nullable(),
});

export type KhepreeDeviceDisplay = z.infer<typeof KhepreeDeviceDisplaySchema>;

export const KhepreeEntitlementStateSchema = z.enum([
  'none',
  'active',
  'suspended',
  'expired',
]);

export type KhepreeEntitlementState = z.infer<typeof KhepreeEntitlementStateSchema>;

export const KhepreeBillingStateSchema = z.enum([
  'none',
  'active',
  'payment_required',
  'checkout_pending',
]);

export type KhepreeBillingState = z.infer<typeof KhepreeBillingStateSchema>;

export const KhepreeAccessErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export type KhepreeAccessError = z.infer<typeof KhepreeAccessErrorSchema>;

/** Sanitized state exposed to renderer — no tokens or private keys. */
export const KhepreeAccessStateSchema = z.object({
  gate: z.enum(KHEPREE_GATE_PHASES),
  signedIn: z.boolean(),
  user: KhepreeUserDisplaySchema.nullable(),
  plan: KhepreePlanDisplaySchema.nullable(),
  entitlement: KhepreeEntitlementStateSchema,
  billing: KhepreeBillingStateSchema,
  devicesUsed: z.number().int().nonnegative().nullable(),
  devicesMax: z.number().int().nonnegative().nullable(),
  features: z.record(z.string(), z.boolean()),
  leaseValid: z.boolean(),
  leaseExpiresAt: z.string().nullable(),
  graceUntil: z.string().nullable(),
  heartbeatStatus: z.enum(KHEPREE_HEARTBEAT_STATUSES).nullable(),
  error: KhepreeAccessErrorSchema.nullable(),
  canStartTranslation: z.boolean(),
  canUseWorkspace: z.boolean(),
});

export type KhepreeAccessState = z.infer<typeof KhepreeAccessStateSchema>;

export const KhepreeGetAccessStateResponseSchema = KhepreeAccessStateSchema;

export const KhepreeStartLoginResponseSchema = z.object({
  ok: z.literal(true),
  state: KhepreeAccessStateSchema,
});

export const KhepreeRetryActivationResponseSchema = z.object({
  ok: z.boolean(),
  state: KhepreeAccessStateSchema,
});

export const KhepreeSignOutResponseSchema = z.object({
  ok: z.literal(true),
  state: KhepreeAccessStateSchema,
});

export const KhepreeRefreshEntitlementResponseSchema = z.object({
  ok: z.boolean(),
  state: KhepreeAccessStateSchema,
});

export const KhepreeOpenExternalRequestSchema = z.object({
  target: z.enum(
    Object.keys(KHEPREE_EXTERNAL_URLS) as [
      keyof typeof KHEPREE_EXTERNAL_URLS,
      ...(keyof typeof KHEPREE_EXTERNAL_URLS)[],
    ],
  ),
});

export const KhepreeOpenExternalResponseSchema = z.object({
  ok: z.boolean(),
});

export const KhepreeStartCheckoutResponseSchema = z.object({
  ok: z.boolean(),
  state: KhepreeAccessStateSchema,
});

/** Signed lease payload — verified in main process only. */
export const KhepreeSignedLeasePayloadSchema = z.object({
  installationId: z.string().uuid(),
  deviceId: z.string(),
  productId: z.string(),
  features: z.record(z.string(), z.boolean()),
  expiresAt: z.string(),
  graceUntil: z.string().nullable(),
  heartbeatIntervalMs: z.number().int().positive().optional(),
});

export type KhepreeSignedLeasePayload = z.infer<typeof KhepreeSignedLeasePayloadSchema>;

export const KhepreeSignedLeaseSchema = z.object({
  payload: KhepreeSignedLeasePayloadSchema,
  keyId: z.string(),
  signature: z.string(),
});

export type KhepreeSignedLease = z.infer<typeof KhepreeSignedLeaseSchema>;
