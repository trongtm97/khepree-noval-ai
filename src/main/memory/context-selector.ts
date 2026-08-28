import { DEFAULT_CONTEXT_TOKEN_BUDGET } from '@shared/constants/memory';
import { PACK_CANDIDATE_MIN_CONFIDENCE } from '@shared/constants/learning';
import {
  DEFAULT_CONTEXT_BUDGET_ALLOCATION,
  type ContextBudgetSlice,
} from '@shared/constants/context-budget';
import type { DatabaseManager } from '../db/database-manager';
import { buildTermMatchIndex, matchKnownTermsInText } from '../terms/term-matcher';
import { estimateTokens } from './budget-estimator';
import { getRecentMemory } from './recent-memory';
import { resolveCharacterPreferredName } from './edition-memory';
import type { CharacterDto, MemoryContextDto, RelationshipDto } from '@shared/schemas/memory';
import type { TermRow } from '../db/repositories/term-repository';
import type { TermCandidateRow } from '../db/repositories/term-candidate-repository';
import { applySliceBudget, type ContextRecord } from '../knowledge/context-budget';
import { buildContextFingerprint, type ContextFingerprint } from '../knowledge/context-fingerprint';
import { scanRelevantKnowledge } from '../knowledge/knowledge-retriever';

export interface ContextSelectorInput {
  projectId: string;
  chapterIds: string[];
  tokenBudget?: number;
  recentWindow?: number;
  editionId?: string;
}

export interface MemoryContextResult extends MemoryContextDto {
  fingerprint: ContextFingerprint;
  worldKnowledge: { key: string; value: string }[];
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
      const parsed = JSON.parse(styleRow.style_config) as {
        rules?: string[];
        criticalRules?: string[];
      };
      if (Array.isArray(parsed.rules)) rules.push(...parsed.rules.filter(Boolean));
      if (Array.isArray(parsed.criticalRules))
        rules.push(...parsed.criticalRules.filter(Boolean));
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

function candidateAsMatchTerm(
  candidate: TermCandidateRow,
  pair: { sourceLanguage: string; targetLanguage: string },
): TermRow {
  const now = candidate.updated_at;
  return {
    id: candidate.id,
    source_text: candidate.source_text,
    source_simplified: candidate.source_text,
    source_traditional: null,
    pinyin: null,
    source_language: pair.sourceLanguage,
    target_language: pair.targetLanguage,
    source_variants: null,
    target_variants: null,
    transliteration: null,
    transliteration_system: null,
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
    future_sensitive: 0,
    created_at: candidate.created_at || now,
    updated_at: now,
    deleted_at: null,
  };
}

function loadTermsForPack(db: DatabaseManager, projectId: string): TermRow[] {
  const project = db.projects.getById(projectId);
  const pair = {
    sourceLanguage: project?.source_language ?? 'zh-Hans',
    targetLanguage: project?.target_language ?? 'vi',
  };
  const vaultRows = db.terms.listForMatching({ projectId, ...pair });
  const vaultSources = new Set(
    vaultRows.map((row) => row.source_text ?? row.source_simplified),
  );
  const candidateRows = db.termCandidates
    .listPendingForPack(projectId, PACK_CANDIDATE_MIN_CONFIDENCE)
    .filter((c) => !vaultSources.has(c.source_text))
    .map((c) => candidateAsMatchTerm(c, pair));
  return [...vaultRows, ...candidateRows];
}

function termPriority(locked: boolean, confidence: number | null): number {
  return (locked ? 1000 : 0) + (confidence ?? 0) * 100;
}

export function buildMemoryContext(
  db: DatabaseManager,
  input: ContextSelectorInput,
  toCharacterDto: (id: string) => CharacterDto | null,
  toRelationshipDto: (row: import('../db/repositories/relationship-repository').RelationshipRow) => RelationshipDto,
): MemoryContextResult {
  const budget = input.tokenBudget ?? DEFAULT_CONTEXT_TOKEN_BUDGET;
  const batchText = loadBatchText(db, input.chapterIds);
  const anchorChapter = maxChapterNumber(db, input.chapterIds);
  const editionId = input.editionId;
  if (!editionId) {
    throw new Error('buildMemoryContext requires editionId');
  }

  const project = db.projects.getById(input.projectId);
  const editionRow = db.translationEditions.getById(editionId);

  const allCharacters = db.characters.listByProject(input.projectId);
  const preferredNameByCharacter = new Map<string, string | null>();
  for (const character of allCharacters) {
    preferredNameByCharacter.set(
      character.id,
      resolveCharacterPreferredName(db, character, editionId),
    );
  }

  const scanned = scanRelevantKnowledge(
    db,
    {
      projectId: input.projectId,
      batchText,
      anchorChapter,
      editionId,
      sourceLanguage: project?.source_language,
      targetLanguage: editionRow?.target_language ?? project?.target_language,
    },
    preferredNameByCharacter,
  );

  const recentSlice = getRecentMemory(
    db,
    input.projectId,
    anchorChapter,
    input.recentWindow,
  );

  const termRows = loadTermsForPack(db, input.projectId);
  const termIndex = buildTermMatchIndex(termRows, {
    sourceLanguage: project?.source_language,
  });
  const allTermMatches = matchKnownTermsInText(batchText, termIndex, termRows, {
    projectId: input.projectId,
    sourceLanguage: project?.source_language,
    targetLanguage: editionRow?.target_language ?? project?.target_language,
  });

  type TermPackItem = {
    sourceText: string;
    preferredTranslation: string | null;
    type: string;
    locked: boolean;
    termId: string;
  };

  const termItems: ContextRecord<TermPackItem>[] = allTermMatches.map((match) => {
    const preferred =
      match.term.status === 'CANDIDATE'
        ? match.term.meaning
        : (db.terms
            .listTranslations(match.term.id)
            .find((t) => t.is_primary === 1)?.target_text ?? null);
    const locked = match.term.locked === 1 || match.term.status === 'LOCKED';
    return {
      id: match.term.id,
      item: {
        sourceText: match.sourceText,
        preferredTranslation: preferred,
        type: match.term.term_type,
        locked,
        termId: match.term.id,
      },
      priority: termPriority(locked, match.term.confidence),
      serialize: () => `${match.sourceText}:${preferred ?? ''}`,
    };
  });

  const lockedTerms = termItems.filter((t) => t.item.locked);
  const otherTerms = termItems.filter((t) => !t.item.locked);

  const characterRecords: ContextRecord<CharacterDto>[] = scanned.characters
    .map((row) => toCharacterDto(row.id))
    .filter((dto): dto is CharacterDto => dto !== null)
    .map((dto) => ({
      id: dto.id,
      item: dto,
      priority: dto.locked ? 500 : 100,
      serialize: () =>
        `${dto.canonicalName}|${dto.translatedName ?? ''}|${dto.description ?? ''}`,
    }));

  const relationshipRecords: ContextRecord<RelationshipDto>[] = scanned.relationships.map(
    (row) => {
      const dto = toRelationshipDto(row);
      return {
        id: dto.id,
        item: dto,
        priority: dto.locked ? 400 : 80,
        serialize: () =>
          `${dto.fromCharacterId}:${dto.toCharacterId}:${dto.relationshipType}:${dto.description ?? ''}`,
      };
    },
  );

  type RecentMemoryItem = {
    category: string;
    key: string;
    value: string | null;
    chapterNumber: number | null;
  };

  const recentMemoryRecords: ContextRecord<RecentMemoryItem & { memoryKey: string }>[] =
    recentSlice.events
      .filter((e) => e.chapter_number == null || e.chapter_number <= anchorChapter)
      .filter((e) => scanned.memoryEvents.some((m) => m.id === e.id) || e.chapter_number != null)
      .map((event) => ({
        id: event.id,
        item: {
          category: event.category,
          key: event.event_key,
          value: event.event_value,
          chapterNumber: event.chapter_number,
          memoryKey: `${event.category}.${event.event_key}`,
        },
        priority: (event.chapter_number ?? 0) + (event.locked ? 200 : 0),
        serialize: () => `${event.category}.${event.event_key}:${event.event_value ?? ''}`,
      }));

  const ruleRecords: ContextRecord<string>[] = loadCriticalRules(db, input.projectId).map(
    (rule, idx) => ({
      id: `rule-${idx}`,
      item: rule,
      priority: 300,
      serialize: () => rule,
    }),
  );

  const worldRecords: ContextRecord<{ key: string; value: string }>[] =
    scanned.worldKnowledge.map((entry, idx) => ({
      id: `world-${idx}`,
      item: entry,
      priority: 50,
      serialize: () => `${entry.key}:${entry.value}`,
    }));

  const storyState = db.storyStates.getByProject(input.projectId);
  const structuredStory = storyState ? db.storyStates.parseStructured(storyState) : undefined;
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

  const storyRecords: ContextRecord<typeof storyForPack>[] = storyForPack
    ? [
        {
          id: 'story-state',
          item: storyForPack,
          priority: 200,
          serialize: () => JSON.stringify(storyForPack),
        },
      ]
    : [];

  const pct = (slice: ContextBudgetSlice) =>
    Math.floor(budget * (DEFAULT_CONTEXT_BUDGET_ALLOCATION[slice] ?? 0) / 100);

  const lockedTermResult = applySliceBudget(lockedTerms, pct('lockedTerms'), 'lockedTerms');
  const otherTermResult = applySliceBudget(otherTerms, pct('otherTerms'), 'otherTerms');
  const characterResult = applySliceBudget(characterRecords, pct('characters'), 'characters');
  const relationshipResult = applySliceBudget(
    relationshipRecords,
    pct('relationships'),
    'relationships',
  );
  const ruleResult = applySliceBudget(ruleRecords, pct('translationRules'), 'translationRules');
  const worldResult = applySliceBudget(worldRecords, pct('worldKnowledge'), 'worldKnowledge');
  const storyResult = applySliceBudget(storyRecords, pct('storyState'), 'storyState');
  const recentResult = applySliceBudget(
    recentMemoryRecords,
    pct('recentContext'),
    'recentContext',
  );

  const totalDropped =
    lockedTermResult.dropped +
    otherTermResult.dropped +
    characterResult.dropped +
    relationshipResult.dropped +
    ruleResult.dropped +
    worldResult.dropped +
    storyResult.dropped +
    recentResult.dropped;

  const activeTerms = [...lockedTermResult.items, ...otherTermResult.items].map(
    ({ termId: _id, ...rest }) => rest,
  );
  const activeCharacters = characterResult.items;
  const activeRelationships = relationshipResult.items;
  const recentMemory: RecentMemoryItem[] = recentResult.items.map(
    ({ memoryKey: _mk, ...rest }) => rest,
  );
  const criticalProjectRules = ruleResult.items;
  const worldKnowledge = worldResult.items;
  const storyStateResult = storyResult.items[0];

  const payload = {
    activeTerms,
    activeCharacters,
    relationships: activeRelationships,
    recentMemory,
    criticalProjectRules,
    storyState: storyStateResult,
    worldKnowledge,
    anchorChapter,
    recentWindow: {
      fromChapter: recentSlice.fromChapter,
      toChapter: recentSlice.toChapter,
    },
  };

  const estimatedTokens = estimateTokens(JSON.stringify(payload));
  const contextVersion = db.knowledgeFiles.maxLocalVersion(input.projectId);

  const fingerprint = buildContextFingerprint({
    contextVersion,
    termIds: [
      ...lockedTermResult.items.map((t) => t.termId),
      ...otherTermResult.items.map((t) => t.termId),
    ],
    characterIds: activeCharacters.map((c) => c.id),
    relationshipIds: activeRelationships.map((r) => r.id),
    memoryKeys: recentMemory.map((m) => `${m.category}.${m.key}`),
    estimatedTokens,
  });

  return {
    ...payload,
    budget: {
      limit: budget,
      estimated: estimatedTokens,
      dropped: totalDropped,
    },
    fingerprint,
    worldKnowledge,
  };
}
