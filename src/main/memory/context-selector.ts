import { DEFAULT_CONTEXT_TOKEN_BUDGET } from '@shared/constants/memory';
import { PACK_CANDIDATE_MIN_CONFIDENCE } from '@shared/constants/learning';
import type { DatabaseManager } from '../db/database-manager';
import { buildTermMatchIndex, matchKnownTermsInText } from '../terms/term-matcher';
import { estimateTokens, trimToTokenBudget } from './budget-estimator';
import { getRecentMemory } from './recent-memory';
import { filterRelevantEntities } from './relevant-memory';
import type { CharacterDto, MemoryContextDto, RelationshipDto } from '@shared/schemas/memory';
import type { TermRow } from '../db/repositories/term-repository';
import type { TermCandidateRow } from '../db/repositories/term-candidate-repository';

export interface ContextSelectorInput {
  projectId: string;
  chapterIds: string[];
  tokenBudget?: number;
  recentWindow?: number;
}

function loadBatchText(db: DatabaseManager, chapterIds: string[]): string {
  const parts: string[] = [];
  for (const chapterId of chapterIds) {
    const paragraphs = db.paragraphs.listByChapter(chapterId);
    for (const paragraph of paragraphs) {
      parts.push(paragraph.source_text);
    }
  }
  return parts.join('\n');
}

function maxChapterNumber(db: DatabaseManager, chapterIds: string[]): number {
  let max = 1;
  for (const chapterId of chapterIds) {
    const chapter = db.chapters.getById(chapterId);
    const num = chapter?.chapter_number ?? chapter?.sequence_order;
    if (num != null && num > max) {
      max = num;
    }
  }
  return max;
}

function loadCriticalRules(db: DatabaseManager, projectId: string): string[] {
  const rules: string[] = [];
  const styleRow = db
    .getConnection()
    .prepare(`SELECT style_config FROM project_settings WHERE project_id = ?`)
    .get(projectId) as { style_config: string | null } | undefined;
  if (styleRow?.style_config) {
    try {
      const parsed = JSON.parse(styleRow.style_config) as { rules?: string[]; criticalRules?: string[] };
      if (Array.isArray(parsed.rules)) rules.push(...parsed.rules.filter(Boolean));
      if (Array.isArray(parsed.criticalRules)) rules.push(...parsed.criticalRules.filter(Boolean));
    } catch {
      rules.push(styleRow.style_config);
    }
  }

  const customRules = db.memoryEvents
    .listByProject(projectId)
    .filter((event) => event.category === 'custom' && event.event_key.startsWith('rule:'));
  for (const event of customRules) {
    if (event.event_value) rules.push(event.event_value);
  }
  return [...new Set(rules)];
}

/** Synthetic vault-like row so matcher can find pending candidates in source text. */
function candidateAsMatchTerm(candidate: TermCandidateRow): TermRow {
  const now = candidate.updated_at;
  return {
    id: candidate.id,
    source_simplified: candidate.source_text,
    source_traditional: null,
    pinyin: null,
    term_type: candidate.suggested_type ?? 'OTHER',
    genre: null,
    scope: 'PROJECT',
    scope_ref: candidate.project_id,
    status: 'CANDIDATE',
    confidence: candidate.confidence,
    occurrence_count: candidate.frequency,
    novel_count: 1,
    project_count: 1,
    locked: 0,
    meaning: candidate.suggested_translation,
    notes: null,
    human_confirm_count: 0,
    first_seen_chapter: candidate.first_seen_chapter,
    discovered_from_chapter: candidate.discovered_from_chapter,
    created_at: candidate.created_at || now,
    updated_at: now,
    deleted_at: null,
  };
}

function loadTermsForPack(db: DatabaseManager, projectId: string): TermRow[] {
  const vaultRows = db.terms.listForMatching({ projectId });
  const vaultSources = new Set(vaultRows.map((row) => row.source_simplified));
  const candidateRows = db.termCandidates
    .listPendingForPack(projectId, PACK_CANDIDATE_MIN_CONFIDENCE)
    .filter((c) => !vaultSources.has(c.source_text))
    .map(candidateAsMatchTerm);
  return [...vaultRows, ...candidateRows];
}

export function buildMemoryContext(
  db: DatabaseManager,
  input: ContextSelectorInput,
  toCharacterDto: (id: string) => CharacterDto | null,
  toRelationshipDto: (row: import('../db/repositories/relationship-repository').RelationshipRow) => RelationshipDto,
): MemoryContextDto {
  const budget = input.tokenBudget ?? DEFAULT_CONTEXT_TOKEN_BUDGET;
  const batchText = loadBatchText(db, input.chapterIds);
  const anchorChapter = maxChapterNumber(db, input.chapterIds);

  const allCharacters = db.characters
    .listByProject(input.projectId)
    .filter(
      (character) =>
        character.first_chapter == null || character.first_chapter <= anchorChapter,
    );
  const aliasesByCharacter = new Map<string, string[]>();
  for (const character of allCharacters) {
    aliasesByCharacter.set(
      character.id,
      db.characters.listAliases(character.id).map((a) => a.alias),
    );
  }

  const allRelationships = db.relationships.listActiveAtChapter(
    input.projectId,
    anchorChapter,
  );
  const recentSlice = getRecentMemory(
    db,
    input.projectId,
    anchorChapter,
    input.recentWindow,
  );

  const relevant = filterRelevantEntities({
    batchText,
    characters: allCharacters,
    aliasesByCharacter,
    relationships: allRelationships,
    memoryEvents: recentSlice.events.filter(
      (event) => event.chapter_number == null || event.chapter_number <= anchorChapter,
    ),
  });

  const termRows = loadTermsForPack(db, input.projectId);
  // Lexical look-ahead: all known terms may standardize names early.
  // Plot/relationship timing is enforced via listActiveAtChapter + character first_chapter.
  const termIndex = buildTermMatchIndex(termRows);
  const termMatches = matchKnownTermsInText(batchText, termIndex, termRows, {
    projectId: input.projectId,
  });
  const activeTerms = trimToTokenBudget(
    termMatches.map((match) => {
      const preferred =
        match.term.status === 'CANDIDATE'
          ? match.term.meaning
          : (db.terms.listTranslations(match.term.id).find((translation) => translation.is_primary === 1)
              ?.target_text ?? null);
      return {
        sourceText: match.sourceText,
        preferredTranslation: preferred,
        type: match.term.term_type,
        locked: match.term.locked === 1 || match.term.status === 'LOCKED',
      };
    }),
    (term) => `${term.sourceText}:${term.preferredTranslation ?? ''}`,
    Math.floor(budget * 0.35),
  );

  const activeCharacters = trimToTokenBudget(
    relevant.activeCharacters
      .map((row) => toCharacterDto(row.id))
      .filter((dto): dto is CharacterDto => dto !== null),
    (character) =>
      `${character.canonicalName}|${character.translatedName ?? ''}|${character.description ?? ''}`,
    Math.floor(budget * 0.3),
  );

  const activeRelationships = trimToTokenBudget(
    relevant.activeRelationships.map(toRelationshipDto),
    (rel) =>
      `${rel.fromCharacterId}:${rel.toCharacterId}:${rel.relationshipType}:${rel.description ?? ''}`,
    Math.floor(budget * 0.2),
  );

  const recentMemory = trimToTokenBudget(
    recentSlice.events.map((event) => ({
      category: event.category,
      key: event.event_key,
      value: event.event_value,
      chapterNumber: event.chapter_number,
    })),
    (event) => `${event.category}.${event.key}:${event.value ?? ''}`,
    Math.floor(budget * 0.1),
  );

  const criticalProjectRules = trimToTokenBudget(
    loadCriticalRules(db, input.projectId).map((rule) => ({ rule })),
    (entry) => entry.rule,
    Math.floor(budget * 0.05),
  );

  const storyState = db.storyStates.getByProject(input.projectId);
  const structuredStory = storyState
    ? db.storyStates.parseStructured(storyState)
    : undefined;

  // Do not inject bootstrap "through chapter 10" story snapshot when translating earlier chapters.
  const storyForPack =
    structuredStory &&
    (structuredStory.currentChapterNumber == null ||
      structuredStory.currentChapterNumber <= anchorChapter)
      ? structuredStory
      : structuredStory
        ? {
            ...structuredStory,
            summaryText:
              structuredStory.currentChapterNumber != null &&
              structuredStory.currentChapterNumber > anchorChapter
                ? null
                : structuredStory.summaryText,
            unresolvedPlotPoints: undefined,
            locationState: undefined,
            cultivationState: undefined,
          }
        : undefined;

  const payload = {
    activeTerms: activeTerms.items,
    activeCharacters: activeCharacters.items,
    relationships: activeRelationships.items,
    recentMemory: recentMemory.items,
    criticalProjectRules: criticalProjectRules.items.map((entry) => entry.rule),
    storyState: storyForPack,
    anchorChapter,
    recentWindow: {
      fromChapter: recentSlice.fromChapter,
      toChapter: recentSlice.toChapter,
    },
  };

  const estimatedTokens = estimateTokens(JSON.stringify(payload));

  return {
    ...payload,
    budget: {
      limit: budget,
      estimated: estimatedTokens,
      dropped:
        activeTerms.dropped +
        activeCharacters.dropped +
        activeRelationships.dropped +
        recentMemory.dropped +
        criticalProjectRules.dropped,
    },
  };
}
