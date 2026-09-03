import { z } from 'zod';
import { QA_ISSUE_CODES } from '../constants/output-protocol';
import {
  QA_SCORE_COMPONENTS,
  TRANSLATION_QA_FINDING_SEVERITIES,
  TRANSLATION_QA_FINDING_STATUSES,
  TRANSLATION_QA_SUGGESTED_ACTIONS,
} from '../constants/translation-qa-findings';

export const TranslationQaFindingCodeSchema = z.enum(QA_ISSUE_CODES);

export const TranslationQaTextRangeSchema = z.object({
  paragraphId: z.string().optional(),
  start: z.number().int().nonnegative().optional(),
  end: z.number().int().nonnegative().optional(),
  excerpt: z.string().optional(),
});

export type TranslationQaTextRange = z.infer<typeof TranslationQaTextRangeSchema>;

export const TranslationQaFindingSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  editionId: z.string().uuid().nullable(),
  stableParagraphId: z.string().nullable(),
  paragraphUuid: z.string().uuid().nullable(),
  jobId: z.string().nullable(),
  campaignId: z.string().nullable(),
  code: TranslationQaFindingCodeSchema,
  severity: z.enum(TRANSLATION_QA_FINDING_SEVERITIES),
  message: z.string(),
  sourceRange: TranslationQaTextRangeSchema.nullable(),
  targetRange: TranslationQaTextRangeSchema.nullable(),
  evidence: z.record(z.string(), z.unknown()).nullable(),
  suggestedAction: z.enum(TRANSLATION_QA_SUGGESTED_ACTIONS),
  termSource: z.string().nullable(),
  expected: z.string().nullable(),
  found: z.string().nullable(),
  status: z.enum(TRANSLATION_QA_FINDING_STATUSES),
  fingerprint: z.string(),
  sourceHash: z.string().nullable(),
  dismissedReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  dismissedAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
});

export type TranslationQaFindingDto = z.infer<typeof TranslationQaFindingSchema>;

export const QaScoreBreakdownSchema = z.object({
  components: z.record(
    z.string(),
    z.object({
      weight: z.number(),
      label: z.string(),
      passRatio: z.number().min(0).max(1),
      issueCount: z.number().int().nonnegative(),
    }),
  ),
  /** Weighted sum of component pass ratios — formula is public via QA_SCORE_COMPONENTS. */
  composite: z.number().min(0).max(1),
  formula: z.literal('sum(weight_i * passRatio_i)'),
  weights: z.record(z.string(), z.number()),
});

export type QaScoreBreakdown = z.infer<typeof QaScoreBreakdownSchema>;

export const DismissFindingRequestSchema = z.object({
  findingId: z.string().uuid(),
  reason: z.string().min(1).max(500).optional(),
});

export const ListFindingsRequestSchema = z.object({
  projectId: z.string().uuid(),
  status: z.enum(TRANSLATION_QA_FINDING_STATUSES).optional(),
  limit: z.number().int().positive().max(500).default(100),
});

/** Default published weights for clients. */
export const PUBLISHED_QA_SCORE_WEIGHTS = Object.fromEntries(
  Object.entries(QA_SCORE_COMPONENTS).map(([k, v]) => [k, v.weight]),
);
