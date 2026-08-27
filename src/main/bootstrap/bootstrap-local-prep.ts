import type { DatabaseManager } from '../db/database-manager';
import { loadNotebookSettings, NotebookKnowledgeBuilder } from '../notebook/knowledge-builder';
import {
  BOOTSTRAP_CHAPTER_COUNT_MAX,
  BOOTSTRAP_CHAPTER_COUNT_MIN,
  type BootstrapMode,
  BOOTSTRAP_MODE_CHAPTER_COUNTS,
} from '@shared/constants/bootstrap';
import { buildTermMatchIndex, matchKnownTermsInText } from '../terms/term-matcher';
import type { ChapterRow } from '../db/repositories/chapter-repository';

export interface BootstrapLocalPrepResult {
  projectId: string;
  sourceLanguage: string;
  targetLanguage: string;
  bookProfile: string;
  translationRules: string;
  knownTerms: { source: string; target: string; scope: string }[];
  chapters: { chapterNumber: number; title: string | null; text: string }[];
  throughChapter: number | null;
  chapterCountRequested: number;
  chapterCountUsed: number;
  characterBudget: number;
  totalChars: number;
}

function clampChapterCount(n: number): number {
  return Math.max(
    BOOTSTRAP_CHAPTER_COUNT_MIN,
    Math.min(BOOTSTRAP_CHAPTER_COUNT_MAX, Math.trunc(n)),
  );
}

function resolveChapterCount(
  db: DatabaseManager,
  projectId: string,
  mode?: BootstrapMode,
): number {
  const project = db.projects.getById(projectId);
  if (mode) return BOOTSTRAP_MODE_CHAPTER_COUNTS[mode];
  const fromProject = project?.bootstrap_chapter_count;
  if (typeof fromProject === 'number' && fromProject > 0) {
    return clampChapterCount(fromProject);
  }
  const settings = loadNotebookSettings(db, projectId);
  return clampChapterCount(settings.seedChapterCount);
}

/**
 * Select chapters starting at expected_start_chapter (or first chapter),
 * shrinking count if total source chars exceed budget.
 */
export function selectBootstrapChapters(
  all: ChapterRow[],
  options: {
    expectedStartChapter: number | null;
    chapterCount: number;
    characterBudget: number;
  },
): ChapterRow[] {
  const sorted = [...all].sort(
    (a, b) =>
      (a.chapter_number ?? a.sequence_order) - (b.chapter_number ?? b.sequence_order),
  );
  if (sorted.length === 0) return [];

  const startNum = options.expectedStartChapter;
  let startIdx = 0;
  if (startNum != null) {
    const found = sorted.findIndex(
      (c) => (c.chapter_number ?? c.sequence_order) >= startNum,
    );
    startIdx = found >= 0 ? found : 0;
  }

  const window = sorted.slice(startIdx, startIdx + options.chapterCount);
  const selected: ChapterRow[] = [];
  let total = 0;
  for (const chapter of window) {
    const text = chapter.source_text ?? '';
    if (selected.length > 0 && total + text.length > options.characterBudget) {
      break;
    }
    selected.push(chapter);
    total += text.length;
  }
  if (selected.length === 0 && window[0]) {
    selected.push(window[0]);
  }
  return selected;
}

/** Local deterministic prep — no AI. */
export function prepareBootstrapLocal(
  db: DatabaseManager,
  projectId: string,
  options?: { mode?: BootstrapMode; characterBudget?: number },
): BootstrapLocalPrepResult {
  const project = db.projects.getById(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);

  const chapterCount = resolveChapterCount(db, projectId, options?.mode);
  const budget =
    options?.characterBudget ?? loadNotebookSettings(db, projectId).bootstrapCharacterBudget;

  const allChapters = db.chapters.listByProject(projectId);
  const selected = selectBootstrapChapters(allChapters, {
    expectedStartChapter: project.expected_start_chapter,
    chapterCount,
    characterBudget: budget,
  });

  const builder = new NotebookKnowledgeBuilder(db);
  const bookProfile = builder.buildBookProfile(projectId);
  const translationRules = builder.buildTranslationRules(projectId);

  const chapterPayload = selected.map((c) => ({
    chapterNumber: c.chapter_number ?? c.sequence_order,
    title: c.chapter_title,
    text: c.source_text ?? '',
  }));
  const batchText = chapterPayload.map((c) => c.text).join('\n');

  const termRows = db.terms.listForMatching({
    projectId,
    sourceLanguage: project.source_language,
    targetLanguage: project.target_language,
  });
  const index = buildTermMatchIndex(termRows, {
    sourceLanguage: project.source_language,
  });
  const matches = matchKnownTermsInText(batchText, index, termRows, {
    projectId,
    sourceLanguage: project.source_language,
    targetLanguage: project.target_language,
  });
  const knownTerms = matches.map((m) => {
    const translations = db.terms.listTranslations(m.term.id);
    const target =
      translations.find((t) => t.is_primary === 1)?.target_text ?? m.sourceText;
    return {
      source: m.sourceText,
      target,
      scope: m.term.scope,
    };
  });

  const last = chapterPayload.at(-1);
  const throughChapter = last ? last.chapterNumber : null;

  return {
    projectId,
    sourceLanguage: project.source_language,
    targetLanguage: project.target_language,
    bookProfile: bookProfile || '# Book profile\n',
    translationRules,
    knownTerms,
    chapters: chapterPayload,
    throughChapter,
    chapterCountRequested: chapterCount,
    chapterCountUsed: chapterPayload.length,
    characterBudget: budget,
    totalChars: batchText.length,
  };
}

export function formatKnownTermsBlock(
  knownTerms: BootstrapLocalPrepResult['knownTerms'],
): string {
  if (knownTerms.length === 0) return '(none matched)';
  return knownTerms.map((t) => `- ${t.source} → ${t.target} [${t.scope}]`).join('\n');
}
