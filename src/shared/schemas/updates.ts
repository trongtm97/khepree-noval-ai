import { z } from 'zod';

/** Update state machine exposed to renderer — no feed URLs or tickets. */
export const UpdateStatusPhaseSchema = z.enum([
  'idle',
  'checking',
  'up-to-date',
  'available',
  'downloading',
  'downloaded',
  'installing',
  'error',
  'unavailable',
]);

export type UpdateStatusPhase = z.infer<typeof UpdateStatusPhaseSchema>;

export const UpdateStatusSchema = z.object({
  phase: UpdateStatusPhaseSchema,
  currentVersion: z.string(),
  latestVersion: z.string().nullable(),
  releaseChannel: z.enum(['stable', 'beta', 'alpha']),
  lastCheckedAt: z.string().nullable(),
  mandatoryUpdate: z.boolean(),
  releaseNotes: z.string().nullable(),
  downloadProgress: z.number().min(0).max(100).nullable(),
  errorMessage: z.string().nullable(),
  manualDownloadUrl: z.string().nullable(),
  canInstall: z.boolean(),
  canCheck: z.boolean(),
  jobsRunning: z.number().int().nonnegative(),
  postponedUntil: z.string().nullable(),
});

export type UpdateStatus = z.infer<typeof UpdateStatusSchema>;

export const UpdatePostponeRequestSchema = z.object({
  untilMs: z.number().int().positive().optional(),
});

export const UpdatePostponeResponseSchema = z.object({
  ok: z.literal(true),
  postponedUntil: z.string().nullable(),
});

export type UpdatePostponeResponse = z.infer<typeof UpdatePostponeResponseSchema>;

/** @deprecated Use UpdateStatus via updates.getStatus */
export const CheckForUpdatesResponseSchema = z.object({
  ok: z.boolean(),
  status: z.enum(['up-to-date', 'update-available', 'unavailable', 'error']),
  currentVersion: z.string(),
  latestVersion: z.string().nullable(),
  message: z.string(),
  releaseNotes: z.string().nullable(),
  downloadUrl: z.string().nullable(),
  providerId: z.string(),
  providerLabel: z.string(),
});

export interface CheckForUpdatesResponse {
  ok: boolean;
  status: 'up-to-date' | 'update-available' | 'unavailable' | 'error';
  currentVersion: string;
  latestVersion: string | null;
  message: string;
  releaseNotes: string | null;
  downloadUrl: string | null;
  providerId: string;
  providerLabel: string;
}
