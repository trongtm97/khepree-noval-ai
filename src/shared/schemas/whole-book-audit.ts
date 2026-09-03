import { z } from 'zod';
import {
  WHOLE_BOOK_AUDIT_CODES,
  WHOLE_BOOK_AUDIT_RUN_STATUSES,
} from '../constants/whole-book-audit';
import { TRANSLATION_RECIPE_MODES } from '../constants/translation-recipes';

export const WholeBookAuditRunSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  editionId: z.string().uuid().nullable(),
  campaignId: z.string().uuid().nullable(),
  status: z.enum(WHOLE_BOOK_AUDIT_RUN_STATUSES),
  recipeMode: z.enum(TRANSLATION_RECIPE_MODES).nullable(),
  lastChapterIndex: z.number().int().nonnegative(),
  chaptersTotal: z.number().int().nonnegative(),
  findingsCount: z.number().int().nonnegative(),
  criticalCount: z.number().int().nonnegative(),
  reportJsonPath: z.string().nullable(),
  reportHtmlPath: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  finishedAt: z.string().nullable(),
});

export type WholeBookAuditRunDto = z.infer<typeof WholeBookAuditRunSchema>;

export const WholeBookAuditFindingViewSchema = z.object({
  id: z.string(),
  code: z.string(),
  severity: z.enum(['error', 'warning', 'info']),
  message: z.string(),
  chapterId: z.string().nullable(),
  chapterNumber: z.number().nullable(),
  stableParagraphId: z.string().nullable(),
  evidence: z.record(z.string(), z.unknown()).nullable(),
  suggestedAction: z.string(),
  status: z.string(),
  openHref: z.string(),
});

export type WholeBookAuditFindingView = z.infer<
  typeof WholeBookAuditFindingViewSchema
>;

export const WholeBookAuditReportSchema = z.object({
  runId: z.string().uuid(),
  projectId: z.string().uuid(),
  projectTitle: z.string(),
  status: z.enum(WHOLE_BOOK_AUDIT_RUN_STATUSES),
  generatedAt: z.string(),
  summary: z.object({
    chaptersTotal: z.number().int(),
    findingsCount: z.number().int(),
    criticalCount: z.number().int(),
    openCount: z.number().int(),
    dismissedCount: z.number().int(),
    autoRepairedCount: z.number().int(),
  }),
  findings: z.array(WholeBookAuditFindingViewSchema),
  indexStats: z.object({
    characterCount: z.number().int(),
    termCount: z.number().int(),
    placeOrgCount: z.number().int(),
    paragraphCount: z.number().int(),
  }),
});

export type WholeBookAuditReport = z.infer<typeof WholeBookAuditReportSchema>;

export const RunWholeBookAuditRequestSchema = z.object({
  projectId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
  recipeMode: z.enum(TRANSLATION_RECIPE_MODES).optional(),
  forceNew: z.boolean().optional(),
  exportReport: z.boolean().optional(),
});

void WHOLE_BOOK_AUDIT_CODES;
