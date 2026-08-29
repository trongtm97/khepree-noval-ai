import { z } from 'zod';

export const SystemHealthStepSchema = z.object({
  id: z.enum(['database', 'app_storage', 'browser', 'ai', 'export', 'backup']),
  ok: z.boolean(),
  message: z.string(),
});

export const SystemHealthResultSchema = z.object({
  ok: z.boolean(),
  passedCount: z.number().int().nonnegative(),
  totalCount: z.number().int().positive(),
  title: z.string(),
  message: z.string(),
  steps: z.array(SystemHealthStepSchema),
});

export type SystemHealthResult = z.infer<typeof SystemHealthResultSchema>;
