import { z } from 'zod';
import { DRIVE_SYNC_STATUSES } from '../constants/drive';

export const DriveSyncResourceDtoSchema = z.object({
  resourceKey: z.string(),
  driveFileId: z.string(),
  localHash: z.string().nullable(),
  syncStatus: z.string(),
  lastSyncedAt: z.string().nullable(),
});

export const DriveSyncStatusDtoSchema = z.object({
  projectId: z.string().uuid(),
  accountId: z.string().uuid().nullable(),
  syncStatus: z.enum(DRIVE_SYNC_STATUSES),
  lastSyncAt: z.string().nullable(),
  lastError: z.string().nullable(),
  syncEveryNChapters: z.number().int().positive(),
  chaptersSinceSync: z.number().int().nonnegative(),
  criticalChangePending: z.boolean(),
  resources: z.array(DriveSyncResourceDtoSchema),
});

export type DriveSyncStatusDto = z.infer<typeof DriveSyncStatusDtoSchema>;

export const DriveOAuthConfigStatusSchema = z.object({
  configured: z.boolean(),
  /** Masked client id for UI (never full secret). */
  clientIdHint: z.string().nullable(),
  /** Exact redirect URI the app uses — register if using Web client. */
  redirectUri: z.string(),
});

export const DriveSetOAuthClientRequestSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().optional(),
});

export const DriveProjectIdRequestSchema = z.object({
  projectId: z.string().uuid(),
});

export const DriveAssignWorkerRequestSchema = z.object({
  projectId: z.string().uuid(),
  accountId: z.string().uuid(),
});

export const DriveSetScheduleRequestSchema = z.object({
  projectId: z.string().uuid(),
  everyNChapters: z.number().int().positive().max(1000),
});

export const DriveSyncProjectRequestSchema = z.object({
  projectId: z.string().uuid(),
  force: z.boolean().optional(),
});

export const DriveSyncResultSchema = z.object({
  updated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  errors: z.array(z.string()),
});

export const DriveStatusResponseSchema = z.object({
  status: DriveSyncStatusDtoSchema,
});

export const DriveSyncResponseSchema = z.object({
  result: DriveSyncResultSchema,
  status: DriveSyncStatusDtoSchema,
});

export const DriveProvisionResponseSchema = z.object({
  status: DriveSyncStatusDtoSchema,
});
