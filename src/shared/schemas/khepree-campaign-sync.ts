/**
 * khepree-campaign-sync.ts — Shared types for opt-in campaign status sync.
 *
 * PRIVACY CONTRACT — only these fields may be sent to Khepree servers:
 *   campaignPublicId  opaque ID, never contains novel title or author
 *   appVersion        semver string
 *   totalProjects     aggregate count
 *   totalChapters     aggregate count
 *   countByStatus     { pending, in_progress, completed, error } — counts only
 *   overallPercent    0–100
 *   stage             "idle" | "active" | "completed" | "error"
 *   startedAt         ISO 8601 timestamp (nullable)
 *   updatedAt         ISO 8601 timestamp
 *   completedAt       ISO 8601 timestamp (nullable)
 *   errorCode         normalized code string (no stack trace, no provider response)
 *
 * NEVER INCLUDE:
 *   novel title, chapter name, author, file path, source text, translation,
 *   prompt, glossary, memory, audit evidence, cookie, session token,
 *   browser profile path, account secret, stack trace, raw provider response.
 */

import { z } from 'zod';

export const CAMPAIGN_SYNC_STAGES = ['idle', 'active', 'completed', 'error'] as const;
export type CampaignSyncStage = (typeof CAMPAIGN_SYNC_STAGES)[number];

/** Closed schema — .strict() rejects unknown keys, preventing accidental PII leaks. */
export const CampaignSyncPayloadSchema = z
  .object({
    campaignPublicId: z.string().min(1).max(64),
    appVersion: z.string().max(32).optional(),
    totalProjects: z.number().int().min(0),
    totalChapters: z.number().int().min(0),
    countByStatus: z.object({
      pending: z.number().int().min(0),
      in_progress: z.number().int().min(0),
      completed: z.number().int().min(0),
      error: z.number().int().min(0),
    }),
    overallPercent: z.number().min(0).max(100),
    stage: z.enum(CAMPAIGN_SYNC_STAGES),
    startedAt: z.string().datetime({ offset: true }).nullable().optional(),
    updatedAt: z.string().datetime({ offset: true }),
    completedAt: z.string().datetime({ offset: true }).nullable().optional(),
    errorCode: z.string().max(64).nullable().optional(),
  })
  .strict();

export type CampaignSyncPayload = z.infer<typeof CampaignSyncPayloadSchema>;

export const CampaignSyncResponseSchema = z.object({
  syncedAt: z.string(),
});

export type CampaignSyncResponse = z.infer<typeof CampaignSyncResponseSchema>;

/** Privacy copy shown to user before enabling the toggle. */
export const CAMPAIGN_SYNC_PRIVACY_COPY = {
  en: 'Share campaign progress with Khepree — off by default. Only aggregate counts and status are sent. No story content, filenames, or personal data beyond your account identity.',
  vi: 'Chia sẻ tiến độ chiến dịch với Khepree — mặc định tắt. Chỉ gửi số lượng tổng hợp và trạng thái. Không gửi nội dung truyện, tên file hoặc dữ liệu cá nhân ngoài tài khoản của bạn.',
} as const;
