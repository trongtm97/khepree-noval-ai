import { z } from 'zod';
import {
  AI_ACCOUNT_STATUSES,
  AI_PROVIDER_STATUSES,
  AI_PROVIDER_TYPES,
  AI_RESPONSE_STATUSES,
} from '../constants/ai-provider';

export const AiProviderDtoSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: z.enum(AI_PROVIDER_TYPES),
  status: z.enum(AI_PROVIDER_STATUSES),
  priority: z.number().int(),
  enabled: z.boolean(),
  fallbackAllowed: z.boolean(),
  accountEmail: z.string().nullable().optional(),
  lastUsedAt: z.string().nullable().optional(),
  lastError: z.string().nullable().optional(),
  modelCount: z.number().int().nonnegative().optional(),
});

export type AiProviderDto = z.infer<typeof AiProviderDtoSchema>;

export const AiAccountDtoSchema = z.object({
  id: z.string().uuid(),
  providerId: z.string().min(1),
  providerType: z.enum(AI_PROVIDER_TYPES).optional(),
  googleAccountId: z.string().uuid().nullable(),
  googleEmail: z.string().nullable(),
  sessionLocation: z.string(),
  status: z.enum(AI_ACCOUNT_STATUSES),
  lastUsedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AiAccountDto = z.infer<typeof AiAccountDtoSchema>;

export const AiModelDtoSchema = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  modelName: z.string(),
  displayName: z.string(),
  capabilities: z.record(z.unknown()).nullable(),
  enabled: z.boolean(),
});

export type AiModelDto = z.infer<typeof AiModelDtoSchema>;

export const AiProviderListResponseSchema = z.object({
  providers: z.array(AiProviderDtoSchema),
  fallbackEnabled: z.boolean(),
  fallbackStatuses: z.array(z.enum(AI_RESPONSE_STATUSES)),
  workerInstalled: z.boolean(),
  workerRunning: z.boolean(),
  workerMessage: z.string().nullable(),
});

export const AiProviderHealthResponseSchema = z.object({
  providers: z.array(
    z.object({
      id: z.string(),
      type: z.enum(AI_PROVIDER_TYPES),
      name: z.string(),
      ok: z.boolean(),
      status: z.enum(AI_PROVIDER_STATUSES),
      message: z.string(),
      accountEmail: z.string().nullable(),
      lastUsedAt: z.string().nullable(),
      lastError: z.string().nullable(),
    }),
  ),
});

export const AiProviderSetPriorityRequestSchema = z.object({
  providerId: z.string().min(1),
  /** Absolute priority (1 = highest). Ignored when promote is true. */
  priority: z.number().int().min(1).max(999).optional(),
  /** Swap with the previous provider in the list (Raise priority button). */
  promote: z.boolean().optional(),
}).refine((v) => v.promote === true || typeof v.priority === 'number', {
  message: 'priority or promote required',
});

export const AiProviderSetEnabledRequestSchema = z.object({
  providerId: z.string().min(1),
  enabled: z.boolean(),
});

export const AiProviderCheckRequestSchema = z.object({
  providerId: z.string().min(1),
});

export const AiFallbackConfigRequestSchema = z.object({
  enabled: z.boolean(),
  statuses: z.array(z.enum(AI_RESPONSE_STATUSES)).optional(),
});

export const AiAccountListRequestSchema = z.object({
  providerId: z.string().min(1).optional(),
});

export const AiAccountListResponseSchema = z.object({
  accounts: z.array(AiAccountDtoSchema),
});

export const AiAccountCreateRequestSchema = z.object({
  providerId: z.string().min(1),
  googleAccountId: z.string().uuid().nullable().optional(),
  googleEmail: z.string().email().nullable().optional(),
});

export const AiAccountPasteCookiesRequestSchema = z.object({
  accountId: z.string().uuid(),
  secure1psid: z.string().min(1),
  secure1psidts: z.string().min(1).optional(),
  googleEmail: z.string().email().optional(),
});

export const AiAccountIdRequestSchema = z.object({
  accountId: z.string().uuid(),
});

export const AiAccountActionResponseSchema = z.object({
  account: AiAccountDtoSchema,
  message: z.string().optional(),
});

export const AiModelsListRequestSchema = z.object({
  providerId: z.string().min(1),
});

export const AiModelsListResponseSchema = z.object({
  models: z.array(AiModelDtoSchema),
});

export const AiWorkerInstallResponseSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  pythonPath: z.string().nullable(),
  venvPath: z.string().nullable(),
});
