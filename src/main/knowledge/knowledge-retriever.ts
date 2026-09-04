import type { DatabaseManager } from '../db/database-manager';
import type { CharacterRow } from '../db/repositories/character-repository';
import type { RelationshipRow } from '../db/repositories/relationship-repository';
import type { MemoryEventRow } from '../db/repositories/memory-event-repository';
import type { TermRow } from '../db/repositories/term-repository';
import { buildTermMatchIndex, matchKnownTermsInText } from '../terms/term-matcher';
import { filterRelevantEntities } from '../memory/relevant-memory';
import { getSemanticRetriever } from './semantic-retriever';
import type { TermScope } from '@shared/constants/term';
import { resolveKnowledgeScopeContext } from './scope-context';

export interface KnowledgeScanInput {
  projectId: string;
  batchText: string;
  anchorChapter: number;
  editionId: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}

export interface ScannedKnowledge {
  termRows: TermRow[];
  termMatches: ReturnType<typeof matchKnownTermsInText>;
  characters: CharacterRow[];
  aliasesByCharacter: Map<string, string[]>;
  preferredNameByCharacter: Map<string, string | null>;
  relationships: RelationshipRow[];
  memoryEvents: MemoryEventRow[];
  worldKnowledge: { key: string; value: string }[];
}

function extractFtsTokens(text: string, maxTokens = 12): string[] {
  const tokens = new Set<string>();
  for (const match of text.matchAll(/[\u4e00-\u9fff]{2,}/gu)) {
    tokens.add(match[0]);
    if (tokens.size >= maxTokens) break;
  }
  if (tokens.size < maxTokens) {
    for (const match of text.matchAll(/\b[A-Za-z]{3,}\b/g)) {
      tokens.add(match[0]);
      if (tokens.size >= maxTokens) break;
    }
  }
  return [...tokens];
}

function ftsQueryFromText(text: string): string | null {
  const tokens = extractFtsTokens(text);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t.replace(/"/g, '')}"`).join(' OR ');
}

function isFutureSensitive(row: { future_sensitive?: number | null }, anchor: number): boolean {
  if (row.future_sensitive !== 1) return false;
  const firstSeen =
    'first_seen_chapter' in row
      ? (row as { first_seen_chapter?: number | null }).first_seen_chapter
      : 'discovered_from_chapter' in row
        ? (row as { discovered_from_chapter?: number | null }).discovered_from_chapter
        : null;
  return firstSeen != null && firstSeen > anchor;
}

function filterTemporalTerms(terms: TermRow[], anchor: number): TermRow[] {
  return terms.filter((t) => {
    if (isFutureSensitive(t, anchor)) return false;
    const from = t.first_seen_chapter ?? t.discovered_from_chapter;
    return from == null || from <= anchor;
  });
}

function filterTemporalCharacters(chars: CharacterRow[], anchor: number): CharacterRow[] {
  return chars.filter((c) => {
    if (c.first_chapter != null && c.first_chapter > anchor) return false;
    if (c.last_chapter != null && c.last_chapter < anchor) return false;
    return true;
  });
}

function filterTemporalMemory(events: MemoryEventRow[], anchor: number): MemoryEventRow[] {
  return events.filter((e) => e.chapter_number == null || e.chapter_number <= anchor);
}

function listPriorSeriesProjectIds(
  db: DatabaseManager,
  projectId: string,
  seriesId: string | null,
): string[] {
  if (!seriesId) return [];
  const volumes = db.fictionSeries.listVolumes(seriesId);
  const current = volumes.find((v) => v.project_id === projectId);
  if (!current) return [];
  return volumes
    .filter((v) => v.volume_order < current.volume_order)
    .map((v) => v.project_id);
}

function parseSeriesWorldKnowledge(
  db: DatabaseManager,
  seriesId: string | null,
  anchorChapter: number,
): { key: string; value: string }[] {
  if (!seriesId) return [];
  const row = db.fictionSeries.getWorldState(seriesId);
  if (!row?.world_knowledge_json) return [];
  try {
    const world = JSON.parse(row.world_knowledge_json) as Record<string, unknown>;
    const entries: { key: string; value: string }[] = [];
    for (const [key, value] of Object.entries(world)) {
      if (value == null) continue;
      const chapter =
        typeof value === 'object' && 'chapter' in value
          ? Number((value as { chapter?: number }).chapter)
          : null;
      if (chapter != null && chapter > anchorChapter) continue;
      entries.push({
        key: `series:${key}`,
        value: typeof value === 'string' ? value : JSON.stringify(value),
      });
    }
    return entries;
  } catch {
    return [];
  }
}

function parseWorldKnowledge(
  db: DatabaseManager,
  projectId: string,
  anchorChapter: number,
): { key: string; value: string }[] {
  const story = db.storyStates.getByProject(projectId);
  if (!story) return [];
  const structured = db.storyStates.parseStructured(story);
  const world = structured.worldKnowledge as Record<string, unknown> | undefined;
  if (!world || typeof world !== 'object') return [];

  const entries: { key: string; value: string }[] = [];
  for (const [key, value] of Object.entries(world)) {
    if (value == null) continue;
    const chapter =
      typeof value === 'object' && 'chapter' in value
        ? Number((value as { chapter?: number }).chapter)
        : null;
    if (chapter != null && chapter > anchorChapter) continue;
    entries.push({ key, value: typeof value === 'string' ? value : JSON.stringify(value) });
  }
  return entries;
}

/**
 * Phase 1 retrieval: FTS5 supplement + exact/alias matching + temporal filter + recency.
 */
export function scanRelevantKnowledge(
  db: DatabaseManager,
  input: KnowledgeScanInput,
  preferredNameByCharacter: Map<string, string | null>,
): ScannedKnowledge {
  const { projectId, batchText, anchorChapter } = input;
  const scopeCtx = resolveKnowledgeScopeContext(db, projectId);
  const priorProjectIds = listPriorSeriesProjectIds(db, projectId, scopeCtx.seriesId);

  const allCharacters = filterTemporalCharacters(
    db.characters.listByProject(projectId),
    anchorChapter,
  );
  // Prior volumes in same series: continuity for names/aliases (relevance-filtered later).
  for (const priorId of priorProjectIds) {
    for (const character of db.characters.listByProject(priorId)) {
      allCharacters.push(character);
      if (!preferredNameByCharacter.has(character.id)) {
        preferredNameByCharacter.set(character.id, character.translated_name);
      }
    }
  }

  const aliasesByCharacter = new Map<string, string[]>();
  for (const character of allCharacters) {
    aliasesByCharacter.set(
      character.id,
      db.characters.listAliases(character.id).map((a) => a.alias),
    );
  }

  const allRelationships = [
    ...db.relationships.listActiveAtChapter(projectId, anchorChapter),
    ...priorProjectIds.flatMap((priorId) => db.relationships.listByProject(priorId)),
  ];
  const recentEvents = filterTemporalMemory(
    db.memoryEvents.listByProject(projectId),
    anchorChapter,
  );

  const relevant = filterRelevantEntities({
    batchText,
    characters: allCharacters,
    aliasesByCharacter,
    preferredNameByCharacter,
    relationships: allRelationships,
    memoryEvents: recentEvents,
  });

  const ftsQuery = ftsQueryFromText(batchText);
  const ftsTermIds = new Set<string>();
  const ftsCharacterIds = new Set<string>();

  if (ftsQuery && typeof db.terms.searchFts === 'function') {
    for (const hit of db.terms.searchFts(ftsQuery, 30)) {
      ftsTermIds.add(hit.term_id);
    }
  }
  if (ftsQuery && typeof db.characters.searchFts === 'function') {
    for (const hit of db.characters.searchFts(ftsQuery, 20)) {
      ftsCharacterIds.add(hit.character_id);
    }
  }

  const semantic = getSemanticRetriever();
  if (semantic.enabled) {
    // Semantic retrieval is async — skipped in sync Phase 1 path.
    // Future: await semantic.retrieve(...) when enabled in production.
  }

  const ftsCharacters = allCharacters.filter(
    (c) => ftsCharacterIds.has(c.id) && !relevant.activeCharacterIds.has(c.id),
  );
  const mergedCharacters = [...relevant.activeCharacters, ...ftsCharacters];

  const project = db.projects.getById(projectId);
  const editionRow = input.editionId
    ? db.translationEditions.getById(input.editionId)
    : null;
  const termRows = filterTemporalTerms(
    db.terms.listForMatching({
      projectId,
      seriesId: scopeCtx.seriesId,
      genre: scopeCtx.genre,
      sourceLanguage: input.sourceLanguage ?? project?.source_language,
      targetLanguage:
        input.targetLanguage ?? editionRow?.target_language ?? project?.target_language,
    }),
    anchorChapter,
  );

  const termIndex = buildTermMatchIndex(termRows, {
    sourceLanguage: project?.source_language,
  });
  const termMatches = matchKnownTermsInText(batchText, termIndex, termRows, {
    projectId,
    seriesId: scopeCtx.seriesId,
    genre: scopeCtx.genre,
    sourceLanguage: input.sourceLanguage ?? project?.source_language,
    targetLanguage: editionRow?.target_language ?? project?.target_language,
  });

  const matchedTermIds = new Set(termMatches.map((m) => m.term.id));
  for (const termId of ftsTermIds) {
    if (matchedTermIds.has(termId)) continue;
    const term = db.terms.getById(termId);
    const source = term?.source_text ?? term?.source_simplified ?? '';
    if (term && source && batchText.includes(source)) {
      termMatches.push({
        term,
        sourceText: source,
        scope: term.scope as TermScope,
        effectivePriority: 0,
        startIndex: batchText.indexOf(source),
        endIndex: batchText.indexOf(source) + source.length,
        contextSnippet: source,
      });
    }
  }

  // Series world facts first (traceable series: prefix), then project — still text-gated.
  const worldKnowledge = [
    ...parseSeriesWorldKnowledge(db, scopeCtx.seriesId, anchorChapter),
    ...parseWorldKnowledge(db, projectId, anchorChapter),
  ].filter((entry) => {
    const bareKey = entry.key.startsWith('series:')
      ? entry.key.slice('series:'.length)
      : entry.key;
    return (
      batchText.includes(bareKey) ||
      batchText.includes(entry.key) ||
      (entry.value.length > 0 && batchText.includes(entry.value.slice(0, 20)))
    );
  });

  return {
    termRows,
    termMatches,
    characters: mergedCharacters,
    aliasesByCharacter,
    preferredNameByCharacter,
    relationships: relevant.activeRelationships,
    memoryEvents: relevant.activeMemoryEvents,
    worldKnowledge,
  };
}
