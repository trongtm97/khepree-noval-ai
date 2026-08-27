import type { DatabaseManager } from '../db/database-manager';
import type { CharacterRow } from '../db/repositories/character-repository';
import type { RelationshipRow } from '../db/repositories/relationship-repository';
import type { TermRow } from '../db/repositories/term-repository';
import { listKnowledgeSyncMappings } from './notebook-resolver';

export interface HotMemoryBuildOptions {
  /** Current translation batch anchor — exclude future-sensitive facts after this chapter. */
  anchorChapter?: number | null;
  /** Max bullet lines (keeps pack slim). */
  maxLines?: number;
  /** Hybrid pack: build delta even when dirty/stale flags lag. */
  force?: boolean;
}

interface HotTermFact {
  source: string;
  preferred: string | null;
  status: string;
  locked: boolean;
  firstSeenChapter: number | null;
  futureSensitive: boolean;
  updatedAt: string;
}

interface HotCharacterFact {
  source: string;
  name: string | null;
  cultivation: string | null;
  role: string | null;
  firstChapter: number | null;
  futureSensitive: boolean;
  updatedAt: string;
}

interface HotRelationshipFact {
  a: string;
  b: string;
  relation: string;
  aCallsB: string | null;
  bCallsA: string | null;
  validFromChapter: number | null;
  futureSensitive: boolean;
  updatedAt: string;
}

interface HotStoryFact {
  currentLocation: string | null;
  currentGoal: string | null;
  openPlot: string | null;
  cultivation: string | null;
  currentChapter: number | null;
  updatedAt: string;
}

interface HotMemoryEventFact {
  category: 'world' | 'location' | 'cultivation';
  key: string;
  value: string;
  firstSeenChapter: number | null;
  updatedAt: string;
}

/**
 * Last Notebook knowledge verification watermark.
 * Hot Memory = SQLite facts updated after this instant (approach B).
 */
export function getNotebookVerifiedWatermark(
  db: DatabaseManager,
  projectId: string,
): string | null {
  const fromMappings = listKnowledgeSyncMappings(db, projectId)
    .map((m) => m.last_verified_at)
    .filter((v): v is string => Boolean(v));
  if (fromMappings.length > 0) {
    // Newest verification watermark — Hot Memory = facts after last CONTENT_CURRENT prove.
    return fromMappings.sort().at(-1) ?? null;
  }

  const fromFiles = db.knowledgeFiles
    .listByProject(projectId)
    .map((f) => f.last_verified_at)
    .filter((v): v is string => Boolean(v));
  if (fromFiles.length > 0) {
    return fromFiles.sort().at(-1) ?? null;
  }
  return null;
}

function isTemporallySafe(
  anchorChapter: number | null | undefined,
  opts: {
    validFrom?: number | null;
    firstSeen?: number | null;
    futureSensitive?: boolean | number | null;
  },
): boolean {
  if (anchorChapter == null) return true;
  const from = opts.validFrom ?? opts.firstSeen ?? null;
  if (from != null && from > anchorChapter) return false;
  const future = opts.futureSensitive === true || opts.futureSensitive === 1;
  if (future && from != null && from > anchorChapter) return false;
  if (future && from == null) return false;
  return true;
}

function compactJsonValue(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'string') return parsed.trim() || null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      const preferred =
        record.name ??
        record.label ??
        record.current ??
        record.value ??
        record.realm ??
        record.stage;
      if (typeof preferred === 'string' && preferred.trim()) return preferred.trim();
      return JSON.stringify(parsed);
    }
    if (Array.isArray(parsed)) {
      return parsed
        .map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))
        .filter(Boolean)
        .slice(0, 3)
        .join('; ');
    }
  } catch {
    return raw.trim() || null;
  }
  return raw.trim() || null;
}

function listHotTerms(
  db: DatabaseManager,
  projectId: string,
  since: string,
): HotTermFact[] {
  const rows = db
    .getConnection()
    .prepare(
      `SELECT t.*
       FROM terms t
       INNER JOIN project_terms pt ON pt.term_id = t.id
       WHERE pt.project_id = ?
         AND t.deleted_at IS NULL
         AND t.updated_at >= ?
       ORDER BY t.locked DESC, t.updated_at DESC
       LIMIT 80`,
    )
    .all(projectId, since) as TermRow[];

  return rows.map((t) => {
    const preferred =
      db.terms.listTranslations(t.id).find((x) => x.is_primary === 1)?.target_text ?? null;
    return {
      source: t.source_simplified,
      preferred,
      status: t.status === 'LOCKED' || t.locked === 1 ? 'LOCKED' : t.status,
      locked: t.locked === 1 || t.status === 'LOCKED',
      firstSeenChapter: t.first_seen_chapter,
      futureSensitive: t.future_sensitive === 1,
      updatedAt: t.updated_at,
    };
  });
}

function listHotCharacters(
  db: DatabaseManager,
  projectId: string,
  since: string,
): HotCharacterFact[] {
  const rows = db
    .getConnection()
    .prepare(
      `SELECT * FROM characters
       WHERE project_id = ? AND updated_at >= ?
       ORDER BY updated_at DESC LIMIT 40`,
    )
    .all(projectId, since) as CharacterRow[];

  return rows.map((c) => {
    let cultivation: string | null = null;
    if (c.metadata) {
      try {
        const meta = JSON.parse(c.metadata) as Record<string, unknown>;
        const raw = meta.cultivation ?? meta.cultivationState ?? meta.realm;
        cultivation = typeof raw === 'string' ? raw : raw ? JSON.stringify(raw) : null;
      } catch {
        cultivation = null;
      }
    }
    return {
      source: c.canonical_name,
      name: c.translated_name,
      cultivation,
      role: c.role,
      firstChapter: c.first_chapter ?? c.discovered_from_chapter,
      futureSensitive: c.future_sensitive === 1,
      updatedAt: c.updated_at,
    };
  });
}

function listHotRelationships(
  db: DatabaseManager,
  projectId: string,
  since: string,
): HotRelationshipFact[] {
  const rows = db
    .getConnection()
    .prepare(
      `SELECT * FROM character_relationships
       WHERE project_id = ? AND updated_at >= ?
       ORDER BY updated_at DESC LIMIT 40`,
    )
    .all(projectId, since) as RelationshipRow[];

  return rows.map((r) => {
    const from = db.characters.getById(r.from_character_id);
    const to = db.characters.getById(r.to_character_id);
    return {
      a: from?.canonical_name ?? r.from_character_id,
      b: to?.canonical_name ?? r.to_character_id,
      relation: r.relationship_type,
      aCallsB: r.a_calls_b,
      bCallsA: r.b_calls_a,
      validFromChapter: r.valid_from_chapter,
      futureSensitive: r.future_sensitive === 1,
      updatedAt: r.updated_at,
    };
  });
}

function listHotStory(
  db: DatabaseManager,
  projectId: string,
  since: string,
): HotStoryFact | null {
  const row = db.storyStates.getByProject(projectId);
  if (!row) return null;
  if (row.updated_at < since) return null;

  const openPlots = compactJsonValue(row.unresolved_plot_points);
  return {
    currentLocation: compactJsonValue(row.location_state),
    currentGoal: row.summary_text?.trim() ?? null,
    openPlot: openPlots,
    cultivation: compactJsonValue(row.cultivation_state),
    currentChapter: row.current_chapter_number,
    updatedAt: row.updated_at,
  };
}

function temporalMeta(opts: {
  validFrom?: number | null;
  firstSeen?: number | null;
  futureSensitive?: boolean;
}): string {
  const parts: string[] = [];
  if (opts.validFrom != null) parts.push(`valid_from_chapter=${opts.validFrom}`);
  if (opts.firstSeen != null) parts.push(`first_seen_chapter=${opts.firstSeen}`);
  if (opts.futureSensitive) parts.push('future_sensitive=true');
  return parts.length ? `; ${parts.join('; ')}` : '';
}

function formatTermLine(f: HotTermFact): string {
  const preferred = f.preferred ? ` → ${f.preferred}` : '';
  const locked = f.locked || f.status === 'LOCKED' ? ' [LOCKED]' : '';
  return (
    `- TERM ${f.source}${preferred}${locked}` +
    temporalMeta({
      firstSeen: f.firstSeenChapter,
      validFrom: f.firstSeenChapter,
      futureSensitive: f.futureSensitive,
    })
  );
}

function formatCharacterLine(f: HotCharacterFact): string {
  const name = f.name ? ` → ${f.name}` : '';
  const meta: string[] = [];
  if (f.role) meta.push(`role=${f.role}`);
  return (
    `- CHARACTER ${f.source}${name}` +
    (meta.length ? `; ${meta.join('; ')}` : '') +
    temporalMeta({
      firstSeen: f.firstChapter,
      validFrom: f.firstChapter,
      futureSensitive: f.futureSensitive,
    })
  );
}

function formatRelationshipLine(f: HotRelationshipFact): string {
  const meta: string[] = [];
  if (f.aCallsB) meta.push(`a_calls_b=${f.aCallsB}`);
  if (f.bCallsA) meta.push(`b_calls_a=${f.bCallsA}`);
  return (
    `- RELATIONSHIP ${f.a} ↔ ${f.b} (${f.relation})` +
    (meta.length ? `; ${meta.join('; ')}` : '') +
    temporalMeta({
      validFrom: f.validFromChapter,
      firstSeen: f.validFromChapter,
      futureSensitive: f.futureSensitive,
    })
  );
}

function formatStoryLine(f: HotStoryFact): string {
  const meta: string[] = [];
  if (f.currentGoal) meta.push(`goal=${f.currentGoal}`);
  if (f.openPlot) meta.push(`open_plot=${f.openPlot}`);
  if (f.currentChapter != null) meta.push(`chapter=${f.currentChapter}`);
  if (meta.length === 0) return '';
  return (
    `- STORY ${meta.join('; ')}` +
    temporalMeta({
      validFrom: f.currentChapter,
      firstSeen: f.currentChapter,
    })
  );
}

function formatLocationLine(value: string, chapter: number | null): string {
  return (
    `- LOCATION ${value}` + temporalMeta({ validFrom: chapter, firstSeen: chapter })
  );
}

function formatCultivationLine(value: string, chapter: number | null): string {
  return (
    `- CULTIVATION ${value}` + temporalMeta({ validFrom: chapter, firstSeen: chapter })
  );
}

function formatWorldEventLine(f: HotMemoryEventFact): string {
  return (
    `- WORLD ${f.key}=${f.value}` +
    temporalMeta({ validFrom: f.firstSeenChapter, firstSeen: f.firstSeenChapter })
  );
}

function listHotMemoryEvents(
  db: DatabaseManager,
  projectId: string,
  since: string,
  categories: HotMemoryEventFact['category'][],
): HotMemoryEventFact[] {
  const placeholders = categories.map(() => '?').join(',');
  const rows = db
    .getConnection()
    .prepare(
      `SELECT category, event_key, event_value, chapter_number, updated_at
       FROM memory_events
       WHERE project_id = ?
         AND updated_at >= ?
         AND category IN (${placeholders})
         AND event_value IS NOT NULL
         AND TRIM(event_value) != ''
       ORDER BY updated_at DESC
       LIMIT 40`,
    )
    .all(projectId, since, ...categories) as {
    category: string;
    event_key: string;
    event_value: string | null;
    chapter_number: number | null;
    updated_at: string;
  }[];

  const facts: HotMemoryEventFact[] = [];
  for (const r of rows) {
    if (!categories.includes(r.category as HotMemoryEventFact['category'])) continue;
    const value = compactJsonValue(r.event_value) ?? r.event_value?.trim() ?? '';
    if (!value) continue;
    facts.push({
      category: r.category as HotMemoryEventFact['category'],
      key: r.event_key,
      value,
      firstSeenChapter: r.chapter_number,
      updatedAt: r.updated_at,
    });
  }
  return facts;
}

/**
 * AI-readable Hot Memory from actual SQLite changes since Notebook verified.
 * Typed facts only: TERM / CHARACTER / RELATIONSHIP / STORY / WORLD / LOCATION / CULTIVATION.
 * Never status strings like "Character delta after job…".
 */
export function buildActiveHotMemoryText(
  db: DatabaseManager,
  projectId: string,
  options: HotMemoryBuildOptions = {},
): string {
  const dirty = db.knowledgeFiles.anyDirty(projectId);
  const mappings = listKnowledgeSyncMappings(db, projectId);
  const stale = mappings.some(
    (m) => m.status === 'stale' || m.status === 'sync_pending',
  );
  const drive = db.driveSyncState.ensure(projectId);
  const contentCurrent =
    drive.version_probe_status === 'verified' &&
    drive.verified_knowledge_version === drive.pending_knowledge_version &&
    Boolean(drive.verified_sync_nonce) &&
    drive.verified_sync_nonce === drive.pending_sync_nonce &&
    !dirty;
  // CONTENT_CURRENT + clean SQLite → Notebook cold knowledge authoritative.
  if (contentCurrent || (!dirty && !stale && !options.force)) {
    return '';
  }

  const since = getNotebookVerifiedWatermark(db, projectId);
  if (!since) {
    // Never verified — no delta-vs-Notebook; fat pack / cold knowledge owns context.
    return '';
  }

  const anchor = options.anchorChapter;
  const maxLines = options.maxLines ?? 36;

  const terms = listHotTerms(db, projectId, since).filter((f) =>
    isTemporallySafe(anchor, {
      firstSeen: f.firstSeenChapter,
      futureSensitive: f.futureSensitive,
    }),
  );
  const characters = listHotCharacters(db, projectId, since).filter((f) =>
    isTemporallySafe(anchor, {
      firstSeen: f.firstChapter,
      futureSensitive: f.futureSensitive,
    }),
  );
  const relationships = listHotRelationships(db, projectId, since).filter((f) =>
    isTemporallySafe(anchor, {
      validFrom: f.validFromChapter,
      futureSensitive: f.futureSensitive,
    }),
  );
  const story = listHotStory(db, projectId, since);
  const memoryEvents = listHotMemoryEvents(db, projectId, since, [
    'world',
    'location',
    'cultivation',
  ]).filter((f) =>
    isTemporallySafe(anchor, {
      firstSeen: f.firstSeenChapter,
      validFrom: f.firstSeenChapter,
    }),
  );

  const lines: string[] = ['## HOT MEMORY — overrides stale Notebook'];
  const push = (line: string): boolean => {
    if (!line || lines.length - 1 >= maxLines) return false;
    lines.push(line);
    return true;
  };

  for (const t of terms) {
    if (!push(formatTermLine(t))) break;
  }
  for (const c of characters) {
    if (!push(formatCharacterLine(c))) break;
    if (c.cultivation) {
      if (
        !push(
          formatCultivationLine(
            `${c.source}: ${c.cultivation}`,
            c.firstChapter,
          ),
        )
      ) {
        break;
      }
    }
  }
  for (const r of relationships) {
    if (!push(formatRelationshipLine(r))) break;
  }
  if (story) {
    push(formatStoryLine(story));
    if (story.currentLocation) {
      push(formatLocationLine(story.currentLocation, story.currentChapter));
    }
    if (story.cultivation) {
      push(formatCultivationLine(story.cultivation, story.currentChapter));
    }
  }
  for (const ev of memoryEvents) {
    if (ev.category === 'world') {
      if (!push(formatWorldEventLine(ev))) break;
    } else if (ev.category === 'location') {
      if (!push(formatLocationLine(`${ev.key}=${ev.value}`, ev.firstSeenChapter)))
        break;
    } else {
      if (!push(formatCultivationLine(`${ev.key}=${ev.value}`, ev.firstSeenChapter)))
        break;
    }
  }

  if (lines.length === 1) return '';
  return lines.join('\n');
}
