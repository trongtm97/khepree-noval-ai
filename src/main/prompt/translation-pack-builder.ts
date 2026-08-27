import { createHash } from 'node:crypto';
import type { PackMode } from '@shared/constants/pack-mode';
import {
  OUTPUT_PROTOCOL_BLOCK,
  TRANSLATION_STYLE_RULES,
  type TranslationStyle,
} from '@shared/constants/translation-pack';
import type { TranslationPackDto, TranslationPackSections } from '@shared/schemas/translation-pack';
import type { MemoryContextDto } from '@shared/schemas/memory';
import { estimateTokens } from '../memory/budget-estimator';
import type { DatabaseManager } from '../db/database-manager';
import type { ChapterRow } from '../db/repositories/chapter-repository';
import type { ParagraphRow } from '../db/repositories/paragraph-repository';
import { buildBookProfile } from '../source-folder/book-profile-builder';

export interface BuildPackInput {
  projectId: string;
  chapterIds: string[];
  style: TranslationStyle;
  context: MemoryContextDto;
  extraRules?: string[];
  /** When set, only these stable paragraph IDs are included in ## Source. */
  paragraphIds?: string[];
  /**
   * slim = Notebook cold; pack = task + tiny hot + locked overrides + source.
   * hybrid = Notebook cold + local delta since last verified (not full DB).
   * fat = full SQLite context when Notebook unavailable / WebAPI.
   */
  packMode?: PackMode;
  /** Unsynced hot deltas text (already formatted section body or empty). */
  hotMemoryOverride?: string;
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
    '2. HOT MEMORY (unsynced overrides)',
    '3. LOCKED PROJECT TERM',
    '4. Current Project Memory in pack',
    '5. Notebook Knowledge sources',
    '6. Model general knowledge (lowest)',
    'Do not let general knowledge override locked project terms.',
  ].join('\n');
}

function buildTaskHeaderFromChapters(
  style: TranslationStyle,
  chapters: ChapterRow[],
  packMode: PackMode,
): string {
  const labels = chapters.map(chapterLabel);
  const range =
    labels.length === 1
      ? labels[0]
      : `${labels[0]}–${labels[labels.length - 1]}`;
  const contextHint =
    packMode === 'slim'
      ? 'Follow Notebook knowledge for characters, terms, story state, and world. This pack only adds source + hot overrides.'
      : packMode === 'hybrid'
        ? 'Notebook holds cold knowledge. Apply Local Knowledge Delta / Hot Memory for unsynced updates since last verified Notebook version. Do not invent beyond Notebook + delta.'
        : 'Use ONLY active context below (local memory fallback). Do not invent terms, characters, or plot.';
  return [
    '## Task',
    `Translate Chinese → Vietnamese (${style}) for ${range}.`,
    contextHint,
    'Preserve every paragraph ID from Source exactly.',
  ].join('\n');
}

function buildCriticalRules(
  style: TranslationStyle,
  contextRules: string[],
  extraRules: string[] | undefined,
): string {
  const styleRules = TRANSLATION_STYLE_RULES[style];
  const merged = [
    ...styleRules,
    ...contextRules,
    ...(extraRules ?? []),
  ];
  const unique = [...new Set(merged.map((rule) => rule.trim()).filter(Boolean))];
  return ['## Critical Rules', ...unique.map((rule) => `- ${rule}`)].join('\n');
}

function buildHybridLocalDelta(context: MemoryContextDto): string {
  /** Relevant story/characters only — not full DB dump. */
  const lines: string[] = ['## Local Knowledge Delta (since last verified Notebook)'];

  if (context.storyState) {
    const hot: Record<string, unknown> = {};
    if (context.storyState.summaryText) hot.summary = context.storyState.summaryText;
    if (context.storyState.cultivationState) hot.cultivation = context.storyState.cultivationState;
    if (context.storyState.locationState) hot.location = context.storyState.locationState;
    if (context.storyState.importantItems?.length) hot.items = context.storyState.importantItems;
    if (context.storyState.unresolvedPlotPoints?.length) {
      hot.openPlots = context.storyState.unresolvedPlotPoints;
    }
    if (Object.keys(hot).length > 0) {
      lines.push(`story: ${compactJson(hot)}`);
    }
  }

  for (const character of context.activeCharacters.slice(0, 24)) {
    const aliases =
      character.aliases.length > 0 ? ` aliases=${character.aliases.join('|')}` : '';
    lines.push(
      `char: ${character.canonicalName}` +
        (character.translatedName ? `=${character.translatedName}` : '') +
        (character.role ? ` [${character.role}]` : '') +
        aliases,
    );
  }

  for (const rel of context.relationships.slice(0, 20)) {
    lines.push(
      `rel: ${rel.fromName}→${rel.toName} (${rel.relationshipType})` +
        (rel.aCallsB || rel.bCallsA
          ? ` calls=${rel.aCallsB ?? '?'}/${rel.bCallsA ?? '?'}`
          : ''),
    );
  }

  if (lines.length === 1) {
    lines.push('(none)');
  }
  return lines.join('\n');
}

function buildHotMemory(
  context: MemoryContextDto,
  packMode: PackMode,
  hotMemoryOverride?: string,
): string {
  if (hotMemoryOverride?.trim()) {
    return hotMemoryOverride.trim().startsWith('##')
      ? hotMemoryOverride.trim()
      : ['## Hot Memory', hotMemoryOverride.trim()].join('\n');
  }

  if (packMode === 'slim') {
    return ['## Hot Memory', '(none — Notebook cold knowledge is authoritative)'].join('\n');
  }

  if (packMode === 'hybrid') {
    return buildHybridLocalDelta(context);
  }

  const lines: string[] = ['## Hot Memory'];

  if (context.storyState) {
    const hot: Record<string, unknown> = {};
    if (context.storyState.summaryText) hot.summary = context.storyState.summaryText;
    if (context.storyState.cultivationState) hot.cultivation = context.storyState.cultivationState;
    if (context.storyState.locationState) hot.location = context.storyState.locationState;
    if (context.storyState.importantItems?.length) hot.items = context.storyState.importantItems;
    if (context.storyState.unresolvedPlotPoints?.length) {
      hot.openPlots = context.storyState.unresolvedPlotPoints;
    }
    if (Object.keys(hot).length > 0) {
      lines.push(`story: ${compactJson(hot)}`);
    }
  }

  for (const character of context.activeCharacters) {
    const aliases =
      character.aliases.length > 0 ? ` aliases=${character.aliases.join('|')}` : '';
    lines.push(
      `char: ${character.canonicalName}` +
        (character.translatedName ? `=${character.translatedName}` : '') +
        (character.role ? ` [${character.role}]` : '') +
        aliases,
    );
  }

  for (const rel of context.relationships) {
    lines.push(
      `rel: ${rel.fromName}→${rel.toName} (${rel.relationshipType})` +
        (rel.aCallsB || rel.bCallsA
          ? ` calls=${rel.aCallsB ?? '?'}/${rel.bCallsA ?? '?'}`
          : ''),
    );
  }

  for (const event of context.recentMemory) {
    lines.push(
      `mem@${event.chapterNumber ?? '?'}: ${event.category}.${event.key}=${event.value ?? ''}`,
    );
  }

  if (lines.length === 1) {
    lines.push('(none)');
  }
  return lines.join('\n');
}

function buildActiveTerms(context: MemoryContextDto, packMode: PackMode): string {
  const lines: string[] = [
    packMode === 'fat'
      ? '## Active Project Terms'
      : packMode === 'slim'
        ? '## Active Overrides (LOCKED only — Notebook cold is authoritative)'
        : '## Active Overrides (locked / local soft)',
  ];

  // SLIM = CONTENT_CURRENT: Notebook holds cold terms. Pack must NOT dump soft
  // matches or grounding proof is invalid (term present in prompt, not Notebook).
  // HYBRID: locked + limited soft as local delta. FAT: all active terms.
  let effective = context.activeTerms;
  if (packMode === 'slim') {
    effective = context.activeTerms.filter((t) => t.locked);
  } else if (packMode === 'hybrid') {
    const locked = context.activeTerms.filter((t) => t.locked);
    effective =
      locked.length === 0
        ? context.activeTerms.slice(0, 15)
        : [...locked, ...context.activeTerms.filter((t) => !t.locked).slice(0, 10)];
  }

  const seen = new Set<string>();
  const unique = effective.filter((t) => {
    if (seen.has(t.sourceText)) return false;
    seen.add(t.sourceText);
    return true;
  });

  if (unique.length === 0) {
    lines.push('(none)');
    return lines.join('\n');
  }
  for (const term of unique) {
    const lock = term.locked ? ' LOCKED' : '';
    lines.push(
      `${term.sourceText} → ${term.preferredTranslation ?? '?'}` +
        ` (${term.type})${lock}`,
    );
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
  const packMode = input.packMode ?? 'fat';
  const bookProfile =
    packMode === 'fat' ? buildBookProfileSection(db, input.projectId) : '';

  const paragraphIdFilter =
    input.paragraphIds && input.paragraphIds.length > 0
      ? new Set(input.paragraphIds)
      : undefined;

  const projectRules =
    packMode === 'slim'
      ? []
      : packMode === 'hybrid'
        ? input.context.criticalProjectRules.slice(0, 8)
        : input.context.criticalProjectRules;

  const sections: TranslationPackSections = {
    taskHeader: buildTaskHeaderFromChapters(input.style, chapters, packMode),
    criticalRules: [
      bookProfile,
      buildKnowledgePriorityRules(),
      buildCriticalRules(input.style, projectRules, input.extraRules),
    ]
      .filter(Boolean)
      .join('\n\n'),
    hotMemoryDelta: buildHotMemory(input.context, packMode, input.hotMemoryOverride),
    activeProjectTerms: buildActiveTerms(input.context, packMode),
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

  const baseContext = [
    sections.criticalRules,
    sections.hotMemoryDelta,
    sections.activeProjectTerms,
  ]
    .filter((s) => s.trim())
    .join('\n\n');
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
  };
}

function buildTaskHeader(
  style: TranslationStyle,
  chapterNumbers: number[],
): string {
  const range =
    chapterNumbers.length === 1
      ? `chapter ${chapterNumbers[0]}`
      : `chapters ${chapterNumbers[0]}–${chapterNumbers[chapterNumbers.length - 1]}`;
  return [
    '## Task',
    `Translate Chinese → Vietnamese (${style}) for ${range}.`,
    'Use ONLY active context below. Do not invent terms, characters, or plot.',
    'Preserve every paragraph ID from Source exactly.',
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
}): { sections: TranslationPackSections; prompt: string } {
  const packMode = input.packMode ?? 'fat';
  const rules =
    packMode === 'slim'
      ? []
      : packMode === 'hybrid'
        ? input.criticalRules.slice(0, 8)
        : input.criticalRules;
  const sections: TranslationPackSections = {
    taskHeader: buildTaskHeader(input.style, input.chapterNumbers),
    criticalRules: [
      buildKnowledgePriorityRules(),
      buildCriticalRules(input.style, rules, input.extraRules),
    ].join('\n\n'),
    hotMemoryDelta: buildHotMemory(input.context, packMode, input.hotMemoryOverride),
    activeProjectTerms: buildActiveTerms(input.context, packMode),
    sourceParagraphs: ['## Source', ...input.sourceLines].join('\n'),
    outputProtocol: OUTPUT_PROTOCOL_BLOCK,
  };
  return { sections, prompt: assemblePrompt(sections) };
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
