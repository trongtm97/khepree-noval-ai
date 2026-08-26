import { z } from 'zod';

export const LogsTailRequestSchema = z.object({
  maxLines: z.number().int().positive().max(5000).optional(),
  level: z.enum(['all', 'info', 'warn', 'error', 'debug']).optional(),
});

export const LogEntryDtoSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  level: z.string(),
  message: z.string(),
  module: z.string().optional(),
  details: z.string().optional(),
});

export const LogsTailResponseSchema = z.object({
  lines: z.array(LogEntryDtoSchema),
  path: z.string(),
});

export type LogsTailRequest = z.infer<typeof LogsTailRequestSchema>;
export type LogsTailResponse = z.infer<typeof LogsTailResponseSchema>;
