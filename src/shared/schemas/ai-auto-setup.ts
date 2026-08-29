import { z } from 'zod';

export const AiAutoSetupOutcomeSchema = z.enum(['ready', 'action_required', 'failed']);

export type AiAutoSetupOutcome = z.infer<typeof AiAutoSetupOutcomeSchema>;

export const AiAutoSetupActionSchema = z.enum(['login', 'add_account']).nullable();

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
  steps: z.array(AiAutoSetupStepSchema),
  technical: z.record(z.union([z.string(), z.boolean(), z.number(), z.null()])).optional(),
});

export type AiAutoSetupStep = z.infer<typeof AiAutoSetupStepSchema>;
export type AiAutoSetupResult = z.infer<typeof AiAutoSetupResultSchema>;

export const AiStatusSnapshotSchema = z.object({
  ready: z.boolean(),
  usableAccountCount: z.number().int().nonnegative(),
  geminiOk: z.boolean(),
  statusLine: z.string(),
  detailLine: z.string().nullable(),
});

export type AiStatusSnapshot = z.infer<typeof AiStatusSnapshotSchema>;
