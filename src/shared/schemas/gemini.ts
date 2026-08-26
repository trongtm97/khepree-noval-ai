import { z } from 'zod';
import { TranslationPackDtoSchema } from './translation-pack';
import { GEMINI_REQUEST_STATUSES } from '../constants/gemini';

export const GeminiSendRequestSchema = z.object({
  projectId: z.string().uuid(),
  accountId: z.string().uuid(),
  pack: TranslationPackDtoSchema,
  headless: z.boolean().optional(),
  maxTimeoutMs: z.number().int().positive().optional(),
  stabilizationWindowMs: z.number().int().positive().optional(),
});

export type GeminiSendRequest = z.infer<typeof GeminiSendRequestSchema>;

export const GeminiSendResponseSchema = z.object({
  correlationId: z.string().uuid(),
  status: z.enum(GEMINI_REQUEST_STATUSES),
  rawResponse: z.string(),
  rawResponsePath: z.string().nullable(),
  retainedRaw: z.boolean(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
});

export type GeminiSendResponse = z.infer<typeof GeminiSendResponseSchema>;

export const GeminiRequestDtoSchema = z.object({
  id: z.string().uuid(),
  correlationId: z.string().uuid(),
  projectId: z.string().uuid(),
  accountId: z.string().uuid(),
  packHash: z.string(),
  status: z.enum(GEMINI_REQUEST_STATUSES),
  rawResponsePath: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
});

export type GeminiRequestDto = z.infer<typeof GeminiRequestDtoSchema>;
