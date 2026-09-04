import { createHash } from 'node:crypto';
import type { PackMode } from '@shared/constants/pack-mode';
import { isLocalContextPack, normalizePackMode } from '@shared/constants/pack-mode';
import {
  composeTranslationStyleRules,
  formatTranslationTaskHeader,
} from '@shared/constants/translation-style-model';
import {
  OUTPUT_PROTOCOL_BLOCK,
  type TranslationStyle,
} from '@shared/constants/translation-pack';
import type { TranslationPackDto, TranslationPackSections } from '@shared/schemas/translation-pack';
import type { MemoryContextDto } from '@shared/schemas/memory';
import { estimateTokens } from '../memory/budget-estimator';
import type { DatabaseManager } from '../db/database-manager';
import type { ChapterRow } from '../db/repositories/chapter-repository';
import type { ParagraphRow } from '../db/repositories/paragraph-repository';
import { buildBookProfile } from '../source-folder/book-profile-builder';
import { resolveForProjectEdition } from '../services/translation-language-resolver';

export interface BuildPackInput {
  projectId: string;
  chapterIds: string[];
  style: TranslationStyle;
  context: MemoryContextDto;
  extraRules?: string[];
  /** When set, only these stable paragraph IDs are included in ## Source. */
  paragraphIds?: string[];
  /**
   * Phase 4: local_context (default) or notebook_assisted (explicit opt-in).
   * Legacy slim/hybrid/fat normalized on read.
   */
  packMode?: PackMode | 'slim' | 'hybrid' | 'fat';
  /** Unsynced hot deltas text (already formatted section body or empty). */
  hotMemoryOverride?: string;
  /** Override pair for tests — production resolves via TranslationLanguageResolver. */
  sourceLanguage?: string;
  targetLanguage?: string;
  editionId?: string;
  /** When source detection flagged embedded foreign material in the batch. */
  sourceMixedLanguage?: boolean;
}

function hashPrompt(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex');
}

function compactJson(value: unknown): string {
  return JSON.stringify(value);
}

function buildBookProfileSection(db: DatabaseManager, projectId: string): string {
  const profile = buildBookProfile(db, projectId);
  if (!profile.trim()) return '';
  return ['## Book Profile', profile].join('\n');
}

function chapterLabel(chapter: ChapterRow): string {
  if (chapter.display_title) return chapter.display_title;
  if (chapter.chapter_number != null) return `chapter ${chapter.chapter_number}`;
  return chapter.chapter_type.toLowerCase();
}

function buildKnowledgePriorityRules(): string {
  return [
    '## Knowledge Priority',
    'If conflict:',
    '1. This Translation Pack explicit instruction',
    '2. HOT MEMORY (recent SQLite changes)',
    '3. LOCKED PROJECT TERM',
    '4. SERIES glossary / series style rules / series world facts (when project is in a series)',
    '5. Local Knowledge Engine context in this pack',
    '6. Model general knowledge (lowest)',
    'Do not let general knowledge override locked project or series terms.',
  ].join('\n');
}

function buildTaskHeaderFromChapters(
  style: TranslationStyle,
  chapters: ChapterRow[],
  sourceLanguage: string,
  targetLanguage: string,
  sourceMixedLanguage?: boolean,
): string {
  const labels = chapters.map(chapterLabel);
  const range =
    labels.length === 1
      ? labels[0]
      : `${labels[0]}–${labels[labels.length - 1]}`;
  return [
    formatTranslationTaskHeader({
      sourceLanguage,
      targetLanguage,
      styleLabel: style,
      range,
      sourceMixedLanguage,
    }),
    'Use ONLY the Local Context sections below (ContextSelector from SQLite). Do not invent terms, characters, or plot.',
  ].join('\n');
}

function buildCriticalRules(
  style: TranslationStyle,
  projectRules: string[],
  editionRules: string[] | undefined,
  sourceLanguage: string,
  targetLanguage: string,
): string {
  const styleRules = composeTranslationStyleRules({
    style,
    sourceLanguage,
    targetLanguage,
    projectRules,
    editionRules,
  });
  const unique = [...new Set(styleRules.map((rule) => rule.trim()).filter(Boolean))];
  return ['## Critical Rules', ...unique.map((rule) => `- ${rule}`)].join('\n');
}

function buildTermSections(context: MemoryContextDto): string {
  const locked = context.activeTerms.filter((t) => t.locked);
  const relevant = context.activeTerms.filter((t) => !t.locked);
  const lines: string[] = [];

  lines.push('## Locked Terms');
  if (locked.length === 0) {
    lines.push('(none)');
  } else {
    for (const term of locked) {
      lines.push(
        `${term.sourceText} → ${term.preferredTranslation ?? '?'} (${term.type}) LOCKED`,
      );
    }
  }

  lines.push('', '## Relevant Terms');
  if (relevant.length === 0) {
    lines.push('(none)');
  } else {
    for (const term of relevant) {
      lines.push(
        `${term.sourceText} → ${term.preferredTranslation ?? '?'} (${term.type})`,
      );
    }
  }
  return lines.join('\n');
}

function buildLocalContextBody(
  context: MemoryContextDto,
  hotMemoryOverride?: string,
): string {
  if (hotMemoryOverride?.trim()) {
    const hot = hotMemoryOverride.trim().startsWith('##')
      ? hotMemoryOverride.trim()
      : ['## Hot Changes', hotMemoryOverride.trim()].join('\n');
    return hot;
  }

  const lines: string[] = [];

  lines.push('## Active Characters');
  if (context.activeCharacters.length === 0) {
    lines.push('(none)');
  } else {
    for (const character of context.activeCharacters) {
      const aliases =
        character.aliases.length > 0 ? ` aliases=${character.aliases.join('|')}` : '';
      lines.push(
        character.canonicalName +
          (character.translatedName ? ` → ${character.translatedName}` : '') +
          (character.role ? ` [${character.role}]` : '') +
          aliases,
      );
    }
  }

  lines.push('', '## Relevant Relationships');
  if (context.relationships.length === 0) {
    lines.push('(none)');
  } else {
    for (const rel of context.relationships) {
      lines.push(
        `${rel.fromName} → ${rel.toName} (${rel.relationshipType})` +
          (rel.aCallsB || rel.bCallsA
            ? ` calls=${rel.aCallsB ?? '?'}/${rel.bCallsA ?? '?'}`
            : ''),
      );
    }
  }

  lines.push('', '## Current Story State');
  if (context.storyState?.summaryText) {
    lines.push(context.storyState.summaryText);
    const extras: Record<string, unknown> = {};
    if (context.storyState.cultivationState) extras.cultivation = context.storyState.cultivationState;
    if (context.storyState.locationState) extras.location = context.storyState.locationState;
    if (context.storyState.importantItems?.length) extras.items = context.storyState.importantItems;
    if (context.storyState.unresolvedPlotPoints?.length) {
      extras.openPlots = context.storyState.unresolvedPlotPoints;
    }
    if (Object.keys(extras).length > 0) {
      lines.push(compactJson(extras));
    }
  } else {
    lines.push('(none)');
  }

  lines.push('', '## Relevant World Facts');
  const world = context.worldKnowledge ?? [];
  if (world.length === 0) {
    lines.push('(none)');
  } else {
    for (const entry of world) {
      lines.push(`${entry.key}: ${entry.value}`);
    }
  }

  lines.push('', '## Recent Context');
  if (context.recentMemory.length === 0) {
    lines.push('(none)');
  } else {
    for (const event of context.recentMemory) {
      lines.push(
        `@${event.chapterNumber ?? '?'} ${event.category}.${event.key}=${event.value ?? ''}`,
      );
    }
  }

  return lines.join('\n');
}

function buildSourceParagraphs(
  chapters: ChapterRow[],
  paragraphsByChapter: Map<string, ParagraphRow[]>,
  paragraphIdFilter?: Set<string>,
): string {
  const lines: string[] = ['## Source'];
  for (const chapter of chapters) {
    const paragraphs = paragraphsByChapter.get(chapter.id) ?? [];
    for (const paragraph of paragraphs) {
      if (paragraphIdFilter && !paragraphIdFilter.has(paragraph.paragraph_id)) {
        continue;
      }
      lines.push(`${paragraph.paragraph_id} ${paragraph.source_text}`);
    }
  }
  return lines.join('\n');
}

function assemblePrompt(sections: TranslationPackSections): string {
  return [
    sections.taskHeader,
    '',
    sections.criticalRules,
    '',
    sections.hotMemoryDelta,
    '',
    sections.activeProjectTerms,
    '',
    sections.sourceParagraphs,
    '',
    '## Output Protocol',
    sections.outputProtocol,
  ].join('\n');
}

export function buildTranslationPack(
  db: DatabaseManager,
  input: BuildPackInput,
): TranslationPackDto {
  const chapters: ChapterRow[] = [];
  const paragraphsByChapter = new Map<string, ParagraphRow[]>();

  for (const chapterId of input.chapterIds) {
    const chapter = db.chapters.getById(chapterId);
    if (!chapter) {
      throw new Error(`Chapter not found: ${chapterId}`);
    }
    if (chapter.project_id !== input.projectId) {
      throw new Error(`Chapter ${chapterId} does not belong to project`);
    }
    chapters.push(chapter);
    paragraphsByChapter.set(chapterId, db.paragraphs.listByChapter(chapterId));
  }

  chapters.sort((a, b) => a.sequence_order - b.sequence_order);
  const chapterNumbers = chapters.map((chapter) => chapter.chapter_number ?? chapter.sequence_order);
  const packMode = normalizePackMode(input.packMode ?? 'local_context');
  const bookProfile = isLocalContextPack(packMode)
    ? buildBookProfileSection(db, input.projectId)
    : '';

  const paragraphIdFilter =
    input.paragraphIds && input.paragraphIds.length > 0
      ? new Set(input.paragraphIds)
      : undefined;

  const projectRules = input.context.criticalProjectRules;

  const resolvedPair =
    input.sourceLanguage && input.targetLanguage
      ? {
          sourceLanguage: input.sourceLanguage,
          targetLanguage: input.targetLanguage,
        }
      : resolveForProjectEdition(db, {
          projectId: input.projectId,
          editionId: input.editionId,
        });
  const sourceLanguage = resolvedPair.sourceLanguage;
  const targetLanguage = resolvedPair.targetLanguage;

  const sections: TranslationPackSections = {
    taskHeader: buildTaskHeaderFromChapters(
      input.style,
      chapters,
      sourceLanguage,
      targetLanguage,
      input.sourceMixedLanguage,
    ),
    criticalRules: [
      bookProfile,
      buildKnowledgePriorityRules(),
      buildCriticalRules(
        input.style,
        projectRules,
        input.extraRules,
        sourceLanguage,
        targetLanguage,
      ),
    ]
      .filter(Boolean)
      .join('\n\n'),
    hotMemoryDelta: buildLocalContextBody(input.context, input.hotMemoryOverride),
    activeProjectTerms: buildTermSections(input.context),
    sourceParagraphs: buildSourceParagraphs(
      chapters,
      paragraphsByChapter,
      paragraphIdFilter,
    ),
    outputProtocol: OUTPUT_PROTOCOL_BLOCK,
  };

  const prompt = assemblePrompt(sections);
  const sourceChars = sections.sourceParagraphs.length;
  const contextChars =
    sections.taskHeader.length +
    sections.criticalRules.length +
    sections.hotMemoryDelta.length +
    sections.activeProjectTerms.length +
    sections.outputProtocol.length;
  const paragraphCount = [...paragraphsByChapter.values()].reduce((sum, rows) => {
    if (!paragraphIdFilter) return sum + rows.length;
    return sum + rows.filter((r) => paragraphIdFilter.has(r.paragraph_id)).length;
  }, 0);

  const baseContext = buildLocalContextSnapshot(sections);
  const operationPrompt = [
    sections.taskHeader,
    sections.sourceParagraphs,
    '## Output Protocol',
    sections.outputProtocol,
  ]
    .filter((s) => s.trim())
    .join('\n\n');

  return {
    projectId: input.projectId,
    chapterIds: chapters.map((chapter) => chapter.id),
    chapterNumbers,
    style: input.style,
    prompt,
    baseContext,
    operationPrompt,
    operationType: 'TRANSLATE' as const,
    sections,
    size: {
      sourceChars,
      contextChars,
      totalChars: prompt.length,
      estimatedTokens: estimateTokens(prompt),
      activeTermCount: input.context.activeTerms.length,
      activeCharacterCount: input.context.activeCharacters.length,
      relationshipCount: input.context.relationships.length,
      recentMemoryCount: input.context.recentMemory.length,
      paragraphCount,
      chapterCount: chapters.length,
    },
    promptHash: hashPrompt(prompt),
    contextFingerprint: input.context.fingerprint,
  };
}

function buildTaskHeader(
  style: TranslationStyle,
  chapterNumbers: number[],
  sourceLanguage: string,
  targetLanguage: string,
  sourceMixedLanguage?: boolean,
): string {
  const range =
    chapterNumbers.length === 1
      ? `chapter ${chapterNumbers[0]}`
      : `chapters ${chapterNumbers[0]}–${chapterNumbers[chapterNumbers.length - 1]}`;
  return [
    formatTranslationTaskHeader({
      sourceLanguage,
      targetLanguage,
      styleLabel: style,
      range,
      sourceMixedLanguage,
    }),
    'Use ONLY the Local Context sections below (ContextSelector from SQLite). Do not invent terms, characters, or plot.',
  ].join('\n');
}

/** Pure section assembler for snapshot tests (no DB). */
export function assemblePackSections(input: {
  style: TranslationStyle;
  chapterNumbers: number[];
  criticalRules: string[];
  extraRules?: string[];
  context: MemoryContextDto;
  sourceLines: string[];
  packMode?: PackMode;
  hotMemoryOverride?: string;
  sourceLanguage: string;
  targetLanguage: string;
  sourceMixedLanguage?: boolean;
}): { sections: TranslationPackSections; prompt: string; baseContext: string; operationPrompt: string } {
  const sourceLanguage = input.sourceLanguage;
  const targetLanguage = input.targetLanguage;
  const rules = input.context.criticalProjectRules.length
    ? input.context.criticalProjectRules
    : input.criticalRules;
  const sections: TranslationPackSections = {
    taskHeader: buildTaskHeader(
      input.style,
      input.chapterNumbers,
      sourceLanguage,
      targetLanguage,
      input.sourceMixedLanguage,
    ),
    criticalRules: [
      buildKnowledgePriorityRules(),
      buildCriticalRules(
        input.style,
        rules,
        input.extraRules,
        sourceLanguage,
        targetLanguage,
      ),
    ].join('\n\n'),
    hotMemoryDelta: buildLocalContextBody(input.context, input.hotMemoryOverride),
    activeProjectTerms: buildTermSections(input.context),
    sourceParagraphs: ['## Source', ...input.sourceLines].join('\n'),
    outputProtocol: OUTPUT_PROTOCOL_BLOCK,
  };
  const prompt = assemblePrompt(sections);
  const baseContext = buildLocalContextSnapshot(sections);
  const operationPrompt = [
    sections.taskHeader,
    sections.sourceParagraphs,
    '## Output Protocol',
    sections.outputProtocol,
  ]
    .filter((s) => s.trim())
    .join('\n\n');
  return { sections, prompt, baseContext, operationPrompt };
}

/** Build provider-neutral local context snapshot (for repair/continuation). */
export function buildLocalContextSnapshot(sections: TranslationPackSections): string {
  return [sections.criticalRules, sections.activeProjectTerms, sections.hotMemoryDelta]
    .filter((s) => s.trim())
    .join('\n\n');
}

/** Count structured hot/delta bullet lines for job telemetry. */
export function countHotDeltaLines(hotMemoryText: string | null | undefined): number {
  if (!hotMemoryText?.trim()) return 0;
  return hotMemoryText
    .split('\n')
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.startsWith('- ') ||
        l.startsWith('- TERM') ||
        l.startsWith('- CHARACTER') ||
        l.startsWith('- RELATIONSHIP') ||
        l.startsWith('- STORY') ||
        l.startsWith('- WORLD') ||
        l.startsWith('- LOCATION') ||
        l.startsWith('- CULTIVATION') ||
        l.startsWith('story:') ||
        l.startsWith('char:') ||
        l.startsWith('rel:') ||
        l.startsWith('mem@'),
    ).length;
}
