import { z } from 'zod';
import { AI_PREFERENCES } from '../constants/ai-preference';

export const AiAutoSetupOutcomeSchema = z.enum(['ready', 'action_required', 'failed']);

export type AiAutoSetupOutcome = z.infer<typeof AiAutoSetupOutcomeSchema>;

export const AiAutoSetupActionSchema = z.enum(['login', 'add_account']).nullable();

export const AiAutoSetupLoginTargetSchema = z
  .enum(['GEMINI', 'CHATGPT', 'META_AI'])
  .nullable()
  .optional();

export const AiAutoSetupStepSchema = z.object({
  id: z.string(),
  ok: z.boolean(),
  message: z.string(),
});

export const AiAutoSetupResultSchema = z.object({
  outcome: AiAutoSetupOutcomeSchema,
  title: z.string(),
  message: z.string(),
  usableAccountCount: z.number().int().nonnegative(),
  action: AiAutoSetupActionSchema.optional(),
  loginTarget: AiAutoSetupLoginTargetSchema,
  steps: z.array(AiAutoSetupStepSchema),
  technical: z.record(z.union([z.string(), z.boolean(), z.number(), z.null()])).optional(),
});

export type AiAutoSetupStep = z.infer<typeof AiAutoSetupStepSchema>;
export type AiAutoSetupResult = z.infer<typeof AiAutoSetupResultSchema>;

export const AiStatusSnapshotSchema = z.object({
  ready: z.boolean(),
  usableAccountCount: z.number().int().nonnegative(),
  aiPreference: z.enum(AI_PREFERENCES),
  providerHealth: z.array(
    z.object({
      preference: z.enum(['GEMINI', 'CHATGPT', 'META_AI']),
      ok: z.boolean(),
      accountCount: z.number().int().nonnegative(),
    }),
  ),
  loginRequired: z.enum(['GEMINI', 'CHATGPT', 'META_AI']).nullable(),
  /** @deprecated legacy field */
  geminiOk: z.boolean().optional(),
  /** @deprecated renderer should use i18n keys */
  statusLine: z.string().optional(),
  detailLine: z.string().nullable().optional(),
});

export type AiStatusSnapshot = z.infer<typeof AiStatusSnapshotSchema>;
