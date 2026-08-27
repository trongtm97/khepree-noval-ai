import { z } from 'zod';
import {
  PARSE_STATUSES,
  PARSE_WARNING_CODES,
  QA_ISSUE_CODES,
  QA_VERDICTS,
} from '../constants/output-protocol';
import { TermDeltaItemSchema } from './term-delta';
import { MemoryDeltaItemSchema } from './memory-delta';

export const ParseWarningSchema = z.object({
  code: z.enum(PARSE_WARNING_CODES),
  message: z.string(),
  section: z.enum(['TRANSLATION', 'TERM_DELTA', 'MEMORY_DELTA', 'raw']).optional(),
});

export type ParseWarning = z.infer<typeof ParseWarningSchema>;

export const TranslationLineSchema = z.object({
  paragraphId: z.string(),
  text: z.string(),
  lineNumber: z.number().int().nonnegative().optional(),
});

export type TranslationLine = z.infer<typeof TranslationLineSchema>;

export const ParsedBatchResultSchema = z.object({
  status: z.enum(PARSE_STATUSES),
  translations: z.array(TranslationLineSchema),
  termDeltas: z.array(TermDeltaItemSchema),
  memoryDeltas: z.array(MemoryDeltaItemSchema),
  warnings: z.array(ParseWarningSchema),
  recoveryUsed: z.boolean(),
  protocolVersion: z.number().int().positive().nullable(),
});

export type ParsedBatchResult = z.infer<typeof ParsedBatchResultSchema>;

export const QaIssueSchema = z.object({
  code: z.enum(QA_ISSUE_CODES),
  severity: z.enum(['error', 'warning']),
  message: z.string(),
  paragraphId: z.string().optional(),
  termSource: z.string().optional(),
  expected: z.string().optional(),
  found: z.string().optional(),
});

export type QaIssue = z.infer<typeof QaIssueSchema>;

export const QaResultSchema = z.object({
  verdict: z.enum(QA_VERDICTS),
  passed: z.boolean(),
  errors: z.array(QaIssueSchema),
  warnings: z.array(QaIssueSchema),
  missingParagraphIds: z.array(z.string()),
  duplicateParagraphIds: z.array(z.string()),
  unknownParagraphIds: z.array(z.string()),
  emptyParagraphIds: z.array(z.string()),
  corruptParagraphIds: z.array(z.string()),
  outOfOrder: z.boolean(),
});

export type QaResult = z.infer<typeof QaResultSchema>;

export const RepairPackParagraphSchema = z.object({
  paragraphId: z.string(),
  sourceText: z.string(),
});

export const RepairPackSchema = z.object({
  missingParagraphIds: z.array(z.string()).min(1),
  paragraphs: z.array(RepairPackParagraphSchema),
  /** Neighbor paragraphs for local context (not re-translated unless missing). */
  contextParagraphs: z.array(RepairPackParagraphSchema),
  prompt: z.string(),
});

export type RepairPack = z.infer<typeof RepairPackSchema>;
