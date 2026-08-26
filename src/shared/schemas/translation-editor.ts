import { z } from 'zod';
import {
  TRANSLATION_EDITOR_STATUSES,
  TRANSLATION_VERSION_SOURCES,
} from '../constants/translation-editor';

export const TranslationVersionSourceSchema = z.enum(TRANSLATION_VERSION_SOURCES);
export const TranslationEditorStatusSchema = z.enum(TRANSLATION_EDITOR_STATUSES);

export const EditorTermHighlightSchema = z.object({
  sourceText: z.string(),
  termId: z.string().uuid(),
  preferredTranslation: z.string().nullable(),
  termType: z.string(),
  scope: z.string(),
  confidence: z.number().nullable(),
  startIndex: z.number().int().nonnegative(),
  endIndex: z.number().int().nonnegative(),
});

export const EditorParagraphDtoSchema = z.object({
  id: z.string().uuid(),
  stableParagraphId: z.string(),
  sequence: z.number().int(),
  sourceText: z.string(),
  translationId: z.string().uuid().nullable(),
  translatedText: z.string().nullable(),
  status: TranslationEditorStatusSchema,
  versionSource: TranslationVersionSourceSchema.nullable(),
  humanLocked: z.boolean(),
  qaWarnings: z.array(z.string()),
  termHighlights: z.array(EditorTermHighlightSchema),
});

export type EditorParagraphDto = z.infer<typeof EditorParagraphDtoSchema>;

export const EditorGetChapterRequestSchema = z.object({
  projectId: z.string().uuid(),
  chapterId: z.string().uuid(),
});

export const EditorGetChapterResponseSchema = z.object({
  projectId: z.string().uuid(),
  chapterId: z.string().uuid(),
  chapterNumber: z.number().int(),
  chapterTitle: z.string().nullable(),
  chapterStatus: z.string(),
  paragraphs: z.array(EditorParagraphDtoSchema),
  qaSummary: z
    .object({
      verdict: z.string().nullable(),
      missingParagraphIds: z.array(z.string()),
    })
    .nullable(),
});

export const EditorSaveParagraphRequestSchema = z.object({
  projectId: z.string().uuid(),
  chapterId: z.string().uuid(),
  stableParagraphId: z.string(),
  translatedText: z.string(),
});

export const EditorSaveParagraphResponseSchema = z.object({
  paragraph: EditorParagraphDtoSchema,
  savedAt: z.string(),
});

export const EditorListVersionsRequestSchema = z.object({
  translationId: z.string().uuid(),
});

export const EditorVersionDtoSchema = z.object({
  version: z.number().int().positive(),
  translatedText: z.string().nullable(),
  status: z.string(),
  versionSource: TranslationVersionSourceSchema,
  createdAt: z.string(),
  editorNote: z.string().nullable(),
});

export const EditorListVersionsResponseSchema = z.object({
  versions: z.array(EditorVersionDtoSchema),
});

export const EditorRevertVersionRequestSchema = z.object({
  projectId: z.string().uuid(),
  chapterId: z.string().uuid(),
  translationId: z.string().uuid(),
  version: z.number().int().positive(),
});

export const EditorRevertVersionResponseSchema = z.object({
  paragraph: EditorParagraphDtoSchema.nullable(),
});

export const EditorContextRequestSchema = z.object({
  projectId: z.string().uuid(),
  chapterNumber: z.number().int().positive(),
});

export const EditorContextResponseSchema = z.object({
  characters: z.array(
    z.object({
      id: z.string(),
      canonicalName: z.string(),
      translatedName: z.string().nullable(),
      role: z.string().nullable(),
    }),
  ),
  relationships: z.array(
    z.object({
      id: z.string(),
      fromName: z.string(),
      toName: z.string(),
      type: z.string(),
    }),
  ),
  terms: z.array(
    z.object({
      id: z.string(),
      sourceText: z.string(),
      translation: z.string().nullable(),
      scope: z.string(),
      confidence: z.number().nullable(),
    }),
  ),
  memorySnippet: z.string().nullable(),
});

export const EditorClearChapterTranslationsRequestSchema = z.object({
  projectId: z.string().uuid(),
  chapterId: z.string().uuid(),
});

export const EditorClearChapterTranslationsResponseSchema = z.object({
  deleted: z.number().int().nonnegative(),
  keptLocked: z.number().int().nonnegative(),
  chapter: EditorGetChapterResponseSchema,
});

export const EditorRetranslateChapterRequestSchema = z.object({
  projectId: z.string().uuid(),
  chapterId: z.string().uuid(),
});

export const EditorRetranslateChapterResponseSchema = z.object({
  deleted: z.number().int().nonnegative(),
  keptLocked: z.number().int().nonnegative(),
  job: z.object({
    id: z.string().uuid(),
    state: z.string(),
  }),
  chapter: EditorGetChapterResponseSchema,
});

export const EditorClearChaptersTranslationsRequestSchema = z.object({
  projectId: z.string().uuid(),
  chapterIds: z.array(z.string().uuid()).min(1),
});

export const EditorClearChaptersTranslationsResponseSchema = z.object({
  deleted: z.number().int().nonnegative(),
  keptLocked: z.number().int().nonnegative(),
  chapterIds: z.array(z.string().uuid()),
});

export const EditorRetranslateChaptersRequestSchema = z.object({
  projectId: z.string().uuid(),
  chapterIds: z.array(z.string().uuid()).min(1),
});

export const EditorRetranslateChaptersResponseSchema = z.object({
  deleted: z.number().int().nonnegative(),
  keptLocked: z.number().int().nonnegative(),
  jobs: z.array(
    z.object({
      id: z.string().uuid(),
      state: z.string(),
      chapterId: z.string().uuid(),
    }),
  ),
  chapterIds: z.array(z.string().uuid()),
});
