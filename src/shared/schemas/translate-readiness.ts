import { z } from 'zod';

export const TranslateEnsureReasonSchema = z.enum([
  'ok',
  'no_account',
  'needs_google_login',
  'needs_notebook',
  'no_channel',
]);

export const TranslateEnsureActionSchema = z.enum([
  'check_google',
  'open_notebook',
  'open_ai_memory',
]);

export const TranslateEnsureReadyRequestSchema = z.object({
  projectId: z.string().uuid(),
  accountId: z.string().uuid().optional().nullable(),
});

export const TranslateEnsureReadyResponseSchema = z.object({
  ok: z.boolean(),
  reason: TranslateEnsureReasonSchema,
  message: z.string(),
  workerAccountId: z.string().uuid().nullable(),
  notebookStatus: z.string().nullable(),
  usedFallback: z.boolean(),
  needsAssisted: z.boolean(),
  actions: z.array(TranslateEnsureActionSchema),
});

export type TranslateEnsureReadyResponse = z.infer<
  typeof TranslateEnsureReadyResponseSchema
>;
