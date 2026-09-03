import { z } from 'zod';

/** Matches @khepree/sdk desktop-announcements contract. */
export const DesktopAnnouncementSeveritySchema = z.enum([
  'info',
  'success',
  'warning',
  'error',
  'action_required',
]);

export const DesktopAnnouncementCtaKindSchema = z.enum(['none', 'open_url', 'open_path']);

export const DesktopAnnouncementCtaSchema = z.object({
  kind: DesktopAnnouncementCtaKindSchema,
  payload: z.record(z.unknown()).nullable(),
});

export const DesktopAnnouncementItemSchema = z.object({
  publicId: z.string().min(1),
  severity: DesktopAnnouncementSeveritySchema,
  title: z.string(),
  body: z.string().nullable(),
  publishedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  cta: DesktopAnnouncementCtaSchema,
  readAt: z.string().nullable(),
  dismissedAt: z.string().nullable(),
});

export type DesktopAnnouncementItem = z.infer<typeof DesktopAnnouncementItemSchema>;

export const DesktopAnnouncementsResponseSchema = z.object({
  items: z.array(DesktopAnnouncementItemSchema),
  nextCursor: z.string().nullable(),
});

export type DesktopAnnouncementsResponse = z.infer<typeof DesktopAnnouncementsResponseSchema>;

export const DesktopAnnouncementReadResponseSchema = z.object({
  publicId: z.string(),
  readAt: z.string(),
});

export type DesktopAnnouncementReadResponse = z.infer<typeof DesktopAnnouncementReadResponseSchema>;

export const DesktopAnnouncementDismissResponseSchema = z.object({
  publicId: z.string(),
  dismissedAt: z.string(),
  readAt: z.string().nullable(),
});

export type DesktopAnnouncementDismissResponse = z.infer<
  typeof DesktopAnnouncementDismissResponseSchema
>;

/** Client-safe CTA actions — never shell/path from server directly. */
export const SafeAnnouncementCtaActionSchema = z.enum([
  'open-settings',
  'open-release-notes',
  'open-account',
  'check-for-updates',
  'open-url',
]);

export type SafeAnnouncementCtaAction = z.infer<typeof SafeAnnouncementCtaActionSchema>;

export const SafeAnnouncementCtaSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('open-url'), url: z.string().url() }),
  z.object({ action: z.literal('open-settings') }),
  z.object({ action: z.literal('open-release-notes') }),
  z.object({ action: z.literal('open-account') }),
  z.object({ action: z.literal('check-for-updates') }),
]);

export type SafeAnnouncementCta = z.infer<typeof SafeAnnouncementCtaSchema>;

/** Renderer-visible announcement DTO (no tokens). */
export const KhepreeAnnouncementDtoSchema = z.object({
  publicId: z.string(),
  kind: z.enum(['SUCCESS', 'INFO', 'WARNING', 'ERROR', 'ACTION_REQUIRED']),
  title: z.string(),
  description: z.string(),
  publishedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  read: z.boolean(),
  dismissed: z.boolean(),
  expired: z.boolean(),
  cta: SafeAnnouncementCtaSchema.nullable(),
});

export type KhepreeAnnouncementDto = z.infer<typeof KhepreeAnnouncementDtoSchema>;

export const KhepreeAnnouncementsListResponseSchema = z.object({
  items: z.array(KhepreeAnnouncementDtoSchema),
  lastSyncedAt: z.string().nullable(),
  syncStatus: z.enum(['idle', 'syncing', 'offline', 'error']),
  syncError: z.string().nullable(),
});

export type KhepreeAnnouncementsListResponse = z.infer<
  typeof KhepreeAnnouncementsListResponseSchema
>;

export const KhepreeAnnouncementMarkReadRequestSchema = z.object({
  publicId: z.string().min(1),
});

export const KhepreeAnnouncementDismissRequestSchema = z.object({
  publicId: z.string().min(1),
});
