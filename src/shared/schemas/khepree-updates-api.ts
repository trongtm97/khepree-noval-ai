import { z } from 'zod';

/** Matches @khepree/sdk desktop-updates contract. */
export const DesktopUpdateArtifactSchema = z.object({
  artifactPublicId: z.string(),
  kind: z.string(),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number(),
  sha256: z.string(),
});

export const DesktopLatestUpdateSchema = z.object({
  releasePublicId: z.string(),
  version: z.string(),
  platform: z.string(),
  architecture: z.string(),
  channel: z.string(),
  mandatoryUpdate: z.boolean(),
  minimumSupportedVersion: z.string().nullable(),
  publishedAt: z.string().nullable(),
  releaseNotes: z.string().nullable(),
  artifacts: z.array(DesktopUpdateArtifactSchema),
});

export const DesktopLatestUpdateResponseSchema = z.object({
  update: DesktopLatestUpdateSchema.nullable(),
});

export type DesktopLatestUpdateResponse = z.infer<typeof DesktopLatestUpdateResponseSchema>;

export const DesktopSquirrelFeedTicketResponseSchema = z.object({
  feedBaseUrl: z.string(),
  feedTicketExpiresAt: z.string(),
});

export type DesktopSquirrelFeedTicketResponse = z.infer<
  typeof DesktopSquirrelFeedTicketResponseSchema
>;
