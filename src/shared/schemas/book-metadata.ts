import { z } from 'zod';
import {
  CHAPTER_TYPES,
  PROJECT_DOCUMENT_TYPES,
  SOURCE_FILE_CLASSIFICATIONS,
} from '../constants/book-metadata';

export const ParsedBookMetadataSchema = z.object({
  sourceTitle: z.string().optional(),
  targetTitle: z.string().optional(),
  /** Legacy alias of sourceTitle. */
  titleCn: z.string().optional(),
  /** Legacy alias of targetTitle. */
  titleVi: z.string().optional(),
  titleOriginal: z.string().optional(),
  alternativeTitles: z.array(z.string()).optional(),
  authorName: z.string().optional(),
  authorNameCn: z.string().optional(),
  genre: z.string().optional(),
  subgenres: z.array(z.string()).optional(),
  publicationStatus: z.string().optional(),
  expectedChapterCount: z.number().int().positive().optional(),
  description: z.string().optional(),
  introduction: z.string().optional(),
  officialSummary: z.string().optional(),
  notes: z.string().optional(),
});

export type ParsedBookMetadataDto = z.infer<typeof ParsedBookMetadataSchema>;

export const BookMetadataPreviewSchema = z.object({
  sourceFilePath: z.string(),
  sourceFileName: z.string(),
  parsed: ParsedBookMetadataSchema,
});

export const ScannedDocumentEntrySchema = z.object({
  sourceFilePath: z.string(),
  sourceFileName: z.string(),
  documentType: z.enum(PROJECT_DOCUMENT_TYPES),
  classification: z.enum(SOURCE_FILE_CLASSIFICATIONS),
  contentHash: z.string(),
  status: z.enum(['new', 'unchanged', 'modified']),
});

export const ScannedSpecialChapterEntrySchema = z.object({
  sourceFilePath: z.string(),
  sourceFileName: z.string(),
  chapterType: z.enum(CHAPTER_TYPES),
  sequenceOrder: z.number().int().nonnegative(),
  chapterNumber: z.number().int().positive().nullable().optional(),
  chapterTitle: z.string(),
  displayTitle: z.string(),
  contentHash: z.string(),
  status: z.enum(['new', 'unchanged', 'modified', 'duplicate', 'conflict', 'error']),
  existingChapterId: z.string().uuid().optional(),
  errorMessage: z.string().optional(),
});

export const ClassifiedFileEntrySchema = z.object({
  sourceFilePath: z.string(),
  sourceFileName: z.string(),
  classification: z.enum(SOURCE_FILE_CLASSIFICATIONS),
  documentType: z.enum(PROJECT_DOCUMENT_TYPES).optional(),
  chapterType: z.enum(CHAPTER_TYPES).optional(),
  chapterNumber: z.number().int().positive().nullable().optional(),
  sequenceOrder: z.number().int().nonnegative().optional(),
  displayTitle: z.string().optional(),
  confidence: z.number(),
  readError: z.string().optional(),
});

export type ClassifiedFileEntryDto = z.infer<typeof ClassifiedFileEntrySchema>;

export const ProjectMetadataDtoSchema = z.object({
  title: z.string(),
  sourceTitle: z.string().nullable(),
  targetTitle: z.string().nullable(),
  /** Legacy alias of sourceTitle. */
  titleCn: z.string().nullable(),
  /** Legacy alias of targetTitle. */
  titleVi: z.string().nullable(),
  titleOriginal: z.string().nullable(),
  alternativeTitles: z.array(z.string()),
  authorName: z.string().nullable(),
  authorNameCn: z.string().nullable(),
  genre: z.string().nullable(),
  subgenres: z.array(z.string()),
  publicationStatus: z.string().nullable(),
  expectedChapterCount: z.number().int().positive().nullable(),
  description: z.string().nullable(),
  introduction: z.string().nullable(),
  officialSummary: z.string().nullable(),
  notes: z.string().nullable(),
  metadataSource: z.string().nullable(),
});

export type ProjectMetadataDto = z.infer<typeof ProjectMetadataDtoSchema>;

export const BookMetadataUpdateRequestSchema = z.object({
  projectId: z.string().uuid(),
  metadata: ProjectMetadataDtoSchema.partial(),
});

export const BookMetadataListDocumentsRequestSchema = z.object({
  projectId: z.string().uuid(),
});

export const BookMetadataGetRequestSchema = z.object({
  projectId: z.string().uuid(),
});
