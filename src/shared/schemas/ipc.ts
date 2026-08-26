import { z } from 'zod';
import { APP_PATH_KEYS } from '../constants/paths';

export const PingResponseSchema = z.object({
  ok: z.literal(true),
  timestamp: z.string().datetime(),
});

export const GetVersionResponseSchema = z.object({
  version: z.string(),
  name: z.string(),
});

export const GetInfoResponseSchema = z.object({
  name: z.string(),
  version: z.string(),
  platform: z.string(),
  arch: z.string(),
  electronVersion: z.string(),
  nodeVersion: z.string(),
  isPackaged: z.boolean(),
});

export const AppPathsSchema = z.object({
  root: z.string(),
  data: z.string(),
  logs: z.string(),
  browserProfiles: z.string(),
  exports: z.string(),
  backups: z.string(),
  cache: z.string(),
});

export const GetPathsResponseSchema = AppPathsSchema;

export const OpenFolderRequestSchema = z.object({
  pathKey: z.enum(APP_PATH_KEYS),
});

export const OpenFolderResponseSchema = z.object({
  ok: z.literal(true),
  path: z.string(),
});

export const OpenGuideRequestSchema = z.object({
  guideId: z.enum(['drive-oauth-setup']),
});

export const OpenGuideResponseSchema = z.object({
  ok: z.literal(true),
  path: z.string(),
});

export const SecurityHealthCheckResponseSchema = z.object({
  available: z.boolean(),
  backend: z.string().nullable(),
  mode: z.enum(['async', 'sync-wrapped', 'unavailable']),
  message: z.string(),
});

export type PingResponse = z.infer<typeof PingResponseSchema>;
export type GetVersionResponse = z.infer<typeof GetVersionResponseSchema>;
export type GetInfoResponse = z.infer<typeof GetInfoResponseSchema>;
export type AppPaths = z.infer<typeof AppPathsSchema>;
export type GetPathsResponse = z.infer<typeof GetPathsResponseSchema>;
export type OpenFolderRequest = z.infer<typeof OpenFolderRequestSchema>;
export type OpenFolderResponse = z.infer<typeof OpenFolderResponseSchema>;
export type OpenGuideRequest = z.infer<typeof OpenGuideRequestSchema>;
export type OpenGuideResponse = z.infer<typeof OpenGuideResponseSchema>;
export type SecurityHealthCheckResponse = z.infer<
  typeof SecurityHealthCheckResponseSchema
>;
