import type { DatabaseManager } from '../db/database-manager';
import {
  preferredTargetOf,
  type BootstrapAnalysisOutput,
} from '@shared/schemas/bootstrap';
import {
  DEFAULT_SOURCE_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
} from '@shared/constants/language-profile';
import { normalizeTermType } from '@shared/constants/term';
import { utcNow } from '../db/utils/timestamps';
import { ensureDefaultEdition } from '../services/edition-service';
import {
  upsertCharacterPreferredName,
  upsertRelationshipAddressTerms,
} from '../memory/edition-memory';

export interface BootstrapPersistResult {
  charactersUpserted: number;
  relationshipsUpserted: number;
  termCandidatesCreated: number;
  worldFacts: number;
  storyPatched: boolean;
  recentEvents: number;
}

/**
 * Persist bootstrap AI output into SQLite (SoT) before knowledge rebuild.
 * Does not overwrite locked characters/terms/story.
 * When temporalProvenance=true (FULL), writes first_seen / discovered_from /
 * valid_from / future_sensitive.
 */
export function persistBootstrapAnalysis(
  db: DatabaseManager,
  projectId: string,
  output: BootstrapAnalysisOutput,
  throughChapter: number | null,
  options?: { temporalProvenance?: boolean },
): BootstrapPersistResult {
  const result: BootstrapPersistResult = {
    charactersUpserted: 0,
    relationshipsUpserted: 0,
    termCandidatesCreated: 0,
    worldFacts: 0,
    storyPatched: false,
    recentEvents: 0,
  };

  const nameToId = new Map<string, string>();
  const edition = ensureDefaultEdition(db, projectId);

  for (const ch of output.characters) {
    const existing = db.characters.getByName(projectId, ch.source_name);
    if (existing?.locked === 1) {
      nameToId.set(ch.source_name, existing.id);
      continue;
    }
    if (existing) {
      db.characters.update(existing.id, {
        gender: ch.gender ?? existing.gender,
        role: ch.role ?? existing.role,
        first_chapter: ch.first_seen_chapter ?? existing.first_chapter,
      });
      const preferred = preferredTargetOf(ch);
      if (preferred) {
        upsertCharacterPreferredName(db, {
          characterId: existing.id,
          editionId: edition.id,
          targetLanguage: edition.target_language,
          preferredName: preferred,
          source: 'bootstrap',
        });
      }
      nameToId.set(ch.source_name, existing.id);
      result.charactersUpserted += 1;
    } else {
      const row = db.characters.create({
        project_id: projectId,
        canonical_name: ch.source_name,
        gender: ch.gender ?? null,
        role: ch.role ?? null,
        first_chapter: ch.first_seen_chapter ?? null,
        status: 'active',
      });
      const preferred = preferredTargetOf(ch);
      if (preferred) {
        upsertCharacterPreferredName(db, {
          characterId: row.id,
          editionId: edition.id,
          targetLanguage: edition.target_language,
          preferredName: preferred,
          source: 'bootstrap',
        });
      }
      nameToId.set(ch.source_name, row.id);
      result.charactersUpserted += 1;
    }
    for (const alias of ch.aliases) {
      const id = nameToId.get(ch.source_name);
      if (id && alias.trim()) {
        try {
          db.characters.addAlias(id, alias.trim());
        } catch {
          // duplicate alias ok
        }
      }
    }
  }

  for (const rel of output.relationships) {
    let fromId = nameToId.get(rel.character_a);
    let toId = nameToId.get(rel.character_b);
    fromId ??= db.characters.getByName(projectId, rel.character_a)?.id;
    toId ??= db.characters.getByName(projectId, rel.character_b)?.id;
    if (!fromId || !toId) continue;
    const existingRels = db.relationships.listByProject(projectId);
    const dup = existingRels.find(
      (r) =>
        r.from_character_id === fromId &&
        r.to_character_id === toId &&
        r.relationship_type === rel.relationship_type,
    );
    if (dup?.locked === 1) continue;
    if (dup) {
      db.relationships.update(dup.id, {
        valid_from_chapter: rel.valid_from_chapter ?? dup.valid_from_chapter,
        confidence: rel.confidence ?? dup.confidence,
      });
      upsertRelationshipAddressTerms(db, {
        relationshipId: dup.id,
        editionId: edition.id,
        targetLanguage: edition.target_language,
        aCallsB: rel.a_calls_b ?? undefined,
        bCallsA: rel.b_calls_a ?? undefined,
        source: 'bootstrap',
      });
    } else {
      const created = db.relationships.create({
        project_id: projectId,
        from_character_id: fromId,
        to_character_id: toId,
        relationship_type: rel.relationship_type,
        valid_from_chapter: rel.valid_from_chapter ?? null,
        confidence: rel.confidence ?? null,
      });
      upsertRelationshipAddressTerms(db, {
        relationshipId: created.id,
        editionId: edition.id,
        targetLanguage: edition.target_language,
        aCallsB: rel.a_calls_b ?? null,
        bCallsA: rel.b_calls_a ?? null,
        source: 'bootstrap',
      });
    }
    result.relationshipsUpserted += 1;
  }

  const projectForTerms = db.projects.getById(projectId);
  const termPair = {
    sourceLanguage: projectForTerms?.source_language ?? DEFAULT_SOURCE_LANGUAGE,
    targetLanguage: projectForTerms?.target_language ?? DEFAULT_TARGET_LANGUAGE,
  };

  for (const term of output.terms) {
    const existing = db.terms.findBySource(term.source, projectId, termPair);
    if (existing && (existing.locked === 1 || existing.status === 'GLOBAL_VERIFIED')) {
      continue;
    }
    if (existing) continue;
    db.termCandidates.upsertCandidate({
      project_id: projectId,
      chapter_id: null,
      source_text: term.source,
      suggested_translation: preferredTargetOf(term) ?? term.source,
      suggested_type: term.category ? normalizeTermType(term.category) : 'OTHER',
      confidence: term.confidence ?? 0.6,
      frequency: 1,
      heuristic_tags: ['bootstrap', 'ai_candidate'],
      context_snippet: null,
      notes: 'Bootstrap AI candidate',
      first_seen_chapter: term.first_seen_chapter ?? null,
      discovered_from_chapter: term.first_seen_chapter ?? throughChapter,
    });
    result.termCandidatesCreated += 1;
  }

  const world = output.world_knowledge;
  const worldBuckets: [string, string[]][] = [
    ['cultivation_system', world.cultivation_system],
    ['sects', world.sects],
    ['locations', world.locations],
    ['organizations', world.organizations],
    ['items', world.items],
    ['rules', world.rules],
  ];
  for (const [bucket, values] of worldBuckets) {
    for (const value of values) {
      if (!value.trim()) continue;
      db.memoryEvents.upsert({
        project_id: projectId,
        category: 'world',
        event_key: `${bucket}:${value.slice(0, 80)}`,
        event_value: value,
        source: 'bootstrap',
        chapter_number: throughChapter,
      });
      result.worldFacts += 1;
    }
  }

  const story = output.story_state;
  const storyRow = db.storyStates.getByProject(projectId);
  if (storyRow?.locked !== 1) {
    db.storyStates.patch(projectId, {
      summaryText: story.summary || 'Chưa bắt đầu dịch.',
      unresolvedPlotPoints: story.open_plot_threads,
      locationState: {
        current_locations: story.current_locations,
        current_goals: story.current_goals,
        current_conflicts: story.current_conflicts,
      },
      currentChapterNumber: story.through_chapter ?? throughChapter,
      worldKnowledge: { ...world },
    });
    result.storyPatched = true;
  }

  for (const event of output.recent_context.important_events) {
    if (!event.trim()) continue;
    db.memoryEvents.upsert({
      project_id: projectId,
      category: 'plot',
      event_key: `bootstrap_event:${event.slice(0, 60)}`,
      event_value: event,
      source: 'bootstrap',
      chapter_number: output.recent_context.through_chapter ?? throughChapter,
    });
    result.recentEvents += 1;
  }

  if (options?.temporalProvenance) {
    applyFullTemporalProvenance(db, projectId, output, throughChapter);
  }

  return result;
}

function applyFullTemporalProvenance(
  db: DatabaseManager,
  projectId: string,
  output: BootstrapAnalysisOutput,
  throughChapter: number | null,
): void {
  const conn = db.getConnection();
  const now = utcNow();

  for (const ch of output.characters) {
    const row = db.characters.getByName(projectId, ch.source_name);
    if (!row || row.locked === 1) continue;
    const first = ch.first_seen_chapter ?? row.first_chapter;
    const discovered = ch.discovered_from_chapter ?? throughChapter;
    const future =
      ch.future_sensitive ||
      (first != null && throughChapter != null && first > throughChapter)
        ? 1
        : 0;
    conn
      .prepare(
        `UPDATE characters SET
          first_chapter = COALESCE(?, first_chapter),
          discovered_from_chapter = COALESCE(?, discovered_from_chapter),
          future_sensitive = ?,
          updated_at = ?
         WHERE id = ?`,
      )
      .run(first, discovered, future, now, row.id);
  }

  for (const rel of output.relationships) {
    const from = db.characters.getByName(projectId, rel.character_a);
    const to = db.characters.getByName(projectId, rel.character_b);
    if (!from || !to) continue;
    const existing = db.relationships
      .listByProject(projectId)
      .find(
        (r) =>
          r.from_character_id === from.id &&
          r.to_character_id === to.id &&
          r.relationship_type === rel.relationship_type,
      );
    if (!existing || existing.locked === 1) continue;
    const validFrom = rel.valid_from_chapter ?? existing.valid_from_chapter;
    const future = rel.future_sensitive ? 1 : 0;
    conn
      .prepare(
        `UPDATE character_relationships SET
          valid_from_chapter = COALESCE(?, valid_from_chapter),
          future_sensitive = ?,
          updated_at = ?
         WHERE id = ?`,
      )
      .run(validFrom, future, now, existing.id);
  }

  for (const term of output.terms) {
    const existing = db.terms.findBySource(term.source, projectId, {
      sourceLanguage:
        db.projects.getById(projectId)?.source_language ?? DEFAULT_SOURCE_LANGUAGE,
      targetLanguage:
        db.projects.getById(projectId)?.target_language ?? DEFAULT_TARGET_LANGUAGE,
    });
    if (!existing || existing.locked === 1) continue;
    const first = term.first_seen_chapter ?? existing.first_seen_chapter;
    const discovered =
      term.discovered_from_chapter ?? existing.discovered_from_chapter ?? throughChapter;
    const future =
      term.future_sensitive ||
      (first != null && throughChapter != null && first > throughChapter)
        ? 1
        : 0;
    conn
      .prepare(
        `UPDATE terms SET
          first_seen_chapter = COALESCE(?, first_seen_chapter),
          discovered_from_chapter = COALESCE(?, discovered_from_chapter),
          future_sensitive = ?,
          updated_at = ?
         WHERE id = ?`,
      )
      .run(first, discovered, future, now, existing.id);
  }
}
