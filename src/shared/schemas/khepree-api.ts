import { z } from 'zod';
import { KHEPREE_HEARTBEAT_STATUSES } from '../constants/khepree';
import {
  KhepreeBillingStateSchema,
  KhepreeEntitlementStateSchema,
  KhepreePlanDisplaySchema,
  KhepreeSignedLeaseSchema,
  KhepreeUserDisplaySchema,
} from './khepree';

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

export const KhepreeHeartbeatResponseSchema = z.object({
  status: z.enum(KHEPREE_HEARTBEAT_STATUSES),
});

export type KhepreeHeartbeatResponse = z.infer<typeof KhepreeHeartbeatResponseSchema>;

export const KhepreeCheckoutUrlResponseSchema = z.object({
  checkoutUrl: z.string().url(),
});

export type KhepreeCheckoutUrlResponse = z.infer<typeof KhepreeCheckoutUrlResponseSchema>;
