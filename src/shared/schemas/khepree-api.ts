import { z } from 'zod';
import { KHEPREE_CHECKOUT_STATUSES, KHEPREE_HEARTBEAT_STATUSES } from '../constants/khepree';
import {
  KhepreeBillingStateSchema,
  KhepreeEntitlementStateSchema,
  KhepreePlanCatalogItemSchema,
  KhepreePlanDisplaySchema,
  KhepreeSignedLeaseSchema,
  KhepreeUserDisplaySchema,
  type KhepreePlanCatalogItem,
} from './khepree';

export type { KhepreePlanCatalogItem };
export { KhepreePlanCatalogItemSchema };

export const KhepreeDeviceAuthStartRequestSchema = z.object({
  state: z.string().min(1),
  codeChallenge: z.string().min(43),
  codeChallengeMethod: z.literal('S256'),
  redirectUri: z.string().min(1),
  installationId: z.string().uuid(),
  devicePublicKey: z.string().min(1),
  productId: z.string().min(1),
});

export const KhepreeDeviceAuthExchangeRequestSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  codeVerifier: z.string().min(43),
  clientId: z.string().min(1),
  redirectUri: z.string().min(1),
  installationId: z.string().uuid(),
  devicePublicKey: z.string().min(1),
  platform: z.string().min(1),
  appVersion: z.string().min(1),
});

export const KhepreeDeviceAuthStartResponseSchema = z.object({
  authUrl: z.string().url(),
  state: z.string().min(1),
});

export type KhepreeDeviceAuthStartResponse = z.infer<typeof KhepreeDeviceAuthStartResponseSchema>;

export const KhepreeAuthTokenResultSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  user: KhepreeUserDisplaySchema,
});

export type KhepreeAuthTokenResult = z.infer<typeof KhepreeAuthTokenResultSchema>;

export const KhepreeActivateDeviceResponseSchema = z.object({
  deviceId: z.string().min(1),
  devicesUsed: z.number().int().nonnegative(),
  devicesMax: z.number().int().positive(),
});

export type KhepreeActivateDeviceResponse = z.infer<typeof KhepreeActivateDeviceResponseSchema>;

export const KhepreeColdStartResultSchema = z.object({
  user: KhepreeUserDisplaySchema,
  plan: KhepreePlanDisplaySchema,
  entitlement: KhepreeEntitlementStateSchema,
  billing: KhepreeBillingStateSchema,
  features: z.record(z.string(), z.boolean()),
  lease: KhepreeSignedLeaseSchema,
  devicesUsed: z.number().int().nonnegative(),
  devicesMax: z.number().int().positive(),
  deviceId: z.string().min(1),
});

export type KhepreeColdStartResult = z.infer<typeof KhepreeColdStartResultSchema>;

export const KhepreeDesktopProfileSchema = z.object({
  user: KhepreeUserDisplaySchema,
  plan: KhepreePlanDisplaySchema.nullable(),
  entitlement: KhepreeEntitlementStateSchema,
  billing: KhepreeBillingStateSchema,
  devicesUsed: z.number().int().nonnegative().nullable(),
  devicesMax: z.number().int().nonnegative().nullable(),
  deviceId: z.string().nullable(),
});

export type KhepreeDesktopProfile = z.infer<typeof KhepreeDesktopProfileSchema>;

export const KhepreeHeartbeatRequestSchema = z.object({
  installationId: z.string().uuid(),
  deviceId: z.string().min(1),
  timestamp: z.string().min(1),
  nonce: z.string().min(1),
  signature: z.string().min(1),
});

export type KhepreeHeartbeatRequest = z.infer<typeof KhepreeHeartbeatRequestSchema>;

export const KhepreeHeartbeatResponseSchema = z.object({
  status: z.enum(KHEPREE_HEARTBEAT_STATUSES),
});

export type KhepreeHeartbeatResponse = z.infer<typeof KhepreeHeartbeatResponseSchema>;

export const KhepreeCheckoutUrlResponseSchema = z.object({
  checkoutUrl: z.string().url(),
  checkoutSessionId: z.string().min(1),
});

export type KhepreeCheckoutUrlResponse = z.infer<typeof KhepreeCheckoutUrlResponseSchema>;

export const KhepreePlanCatalogResponseSchema = z.object({
  plans: z.array(KhepreePlanCatalogItemSchema),
  currentPlanId: z.string().nullable(),
});

export type KhepreePlanCatalogResponse = z.infer<typeof KhepreePlanCatalogResponseSchema>;

export const KhepreeCheckoutStatusResponseSchema = z.object({
  status: z.enum(KHEPREE_CHECKOUT_STATUSES),
});

export type KhepreeCheckoutStatusResponse = z.infer<typeof KhepreeCheckoutStatusResponseSchema>;
