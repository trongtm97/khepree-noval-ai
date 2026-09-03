import { z } from 'zod';
import {
  ATTENTION_INBOX_PRIMARY_ACTIONS,
  ATTENTION_INBOX_SEVERITIES,
  ATTENTION_INBOX_STATUSES,
  ATTENTION_INBOX_TYPES,
} from '../constants/attention-inbox';

export const AttentionInboxItemSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(ATTENTION_INBOX_TYPES),
  status: z.enum(ATTENTION_INBOX_STATUSES),
  severity: z.enum(ATTENTION_INBOX_SEVERITIES),
  titleEn: z.string(),
  titleVi: z.string(),
  descriptionEn: z.string(),
  descriptionVi: z.string(),
  causeCode: z.string().nullable(),
  primaryAction: z.enum(ATTENTION_INBOX_PRIMARY_ACTIONS),
  secondaryActions: z.array(z.enum(ATTENTION_INBOX_PRIMARY_ACTIONS)),
  campaignId: z.string().uuid().nullable(),
  projectId: z.string().uuid().nullable(),
  chapterId: z.string().uuid().nullable(),
  jobId: z.string().uuid().nullable(),
  accountId: z.string().nullable(),
  accountKind: z.string().nullable(),
  /** Affected job/project ids — UI scope list, not hundreds of rows. */
  affectedScope: z.object({
    jobIds: z.array(z.string()).default([]),
    projectIds: z.array(z.string()).default([]),
    chapterIds: z.array(z.string()).default([]),
  }),
  dedupeKey: z.string(),
  /** Sanitized tech detail — never cookies/tokens/full prompts. */
  techDetail: z.string().nullable(),
  snoozedUntil: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  resolvedAt: z.string().nullable(),
});

export type AttentionInboxItemDto = z.infer<typeof AttentionInboxItemSchema>;

export const AttentionInboxListResponseSchema = z.object({
  items: z.array(AttentionInboxItemSchema),
  openCount: z.number().int().nonnegative(),
});

export const AttentionInboxActRequestSchema = z.object({
  itemId: z.string().uuid(),
  action: z.enum([
    'RESOLVE',
    'DISMISS',
    'SNOOZE',
    'RETRY',
    'SKIP',
    'OPEN_LOGIN',
    'VIEW_ERROR',
    'CHOOSE_SOURCE',
    'SWITCH_PROVIDER',
    'OPEN_FOLDER',
  ]),
  snoozeMinutes: z.number().int().positive().max(7 * 24 * 60).optional(),
});

export const AttentionInboxBulkRetryRequestSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(100).optional(),
  /** When true, retry all OPEN retryable items. */
  allRetryable: z.boolean().optional(),
});

export const AttentionInboxCountResponseSchema = z.object({
  openCount: z.number().int().nonnegative(),
});
