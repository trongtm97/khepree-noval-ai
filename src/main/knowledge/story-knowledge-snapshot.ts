/**
 * Canonical story knowledge projection.
 *
 * Single source for Series/World + project story facts used by:
 * - translation context retrieval
 * - Notebook knowledge materialization
 */
import type { DatabaseManager } from '../db/database-manager';
import { resolveKnowledgeScopeContext } from './scope-context';

export type WorldKnowledgeValue = unknown;

export interface WorldKnowledgeEntry {
  key: string;
  rawKey: string;
  value: WorldKnowledgeValue;
  source: 'series' | 'story';
  chapter: number | null;
}

export interface StoryKnowledgeSnapshot {
  projectId: string;
  seriesId: string | null;
  seriesTitle: string | null;
  worldKnowledge: Record<string, WorldKnowledgeValue>;
  worldEntries: WorldKnowledgeEntry[];
  styleRules: { kind: string; content: string; source: 'series' | 'project' }[];
}

function parseWorldObject(json: string | null | undefined): Record<string, unknown> {
  if (!json?.trim()) return {};
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function entryChapter(value: unknown): number | null {
  if (value != null && typeof value === 'object' && 'chapter' in value) {
    const n = Number((value as { chapter?: number }).chapter);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Series world + story world merge.
 * Story wins on same raw key. Series-only keys use `series:` prefix.
 */
export function buildMergedWorldKnowledge(
  db: DatabaseManager,
  projectId: string,
  options?: { anchorChapter?: number | null },
): {
  worldKnowledge: Record<string, WorldKnowledgeValue>;
  worldEntries: WorldKnowledgeEntry[];
  seriesId: string | null;
} {
  const scope = resolveKnowledgeScopeContext(db, projectId);
  const anchor = options?.anchorChapter ?? null;
  const seriesEntries: WorldKnowledgeEntry[] = [];
  const storyEntries: WorldKnowledgeEntry[] = [];
  const storyRawKeys = new Set<string>();

  const storyRow = db.storyStates.getByProject(projectId);
  const structured = storyRow ? db.storyStates.parseStructured(storyRow) : {};
  const storyWorld =
    structured.worldKnowledge && typeof structured.worldKnowledge === 'object'
      ? structured.worldKnowledge
      : {};
  for (const [rawKey, value] of Object.entries(storyWorld)) {
    if (value == null) continue;
    const chapter = entryChapter(value);
    if (anchor != null && chapter != null && chapter > anchor) continue;
    storyRawKeys.add(rawKey);
    storyEntries.push({ key: rawKey, rawKey, value, source: 'story', chapter });
  }

  if (scope.seriesId) {
    const row = db.fictionSeries.getWorldState(scope.seriesId);
    const seriesWorld = parseWorldObject(row?.world_knowledge_json);
    for (const [rawKey, value] of Object.entries(seriesWorld)) {
      if (value == null) continue;
      if (storyRawKeys.has(rawKey)) continue; // story wins
      const chapter = entryChapter(value);
      if (anchor != null && chapter != null && chapter > anchor) continue;
      const key = `series:${rawKey}`;
      seriesEntries.push({ key, rawKey, value, source: 'series', chapter });
    }
  }

  const worldEntries = [...seriesEntries, ...storyEntries];
  const worldKnowledge: Record<string, WorldKnowledgeValue> = {};
  for (const entry of worldEntries) {
    worldKnowledge[entry.key] = entry.value;
  }

  return { worldKnowledge, worldEntries, seriesId: scope.seriesId };
}

export function buildStoryKnowledgeSnapshot(
  db: DatabaseManager,
  projectId: string,
  options?: { anchorChapter?: number | null },
): StoryKnowledgeSnapshot {
  const scope = resolveKnowledgeScopeContext(db, projectId);
  const merged = buildMergedWorldKnowledge(db, projectId, options);

  const styleRules: StoryKnowledgeSnapshot['styleRules'] = [];
  if (scope.seriesId) {
    for (const row of db.fictionSeries.listStyleRules(scope.seriesId)) {
      styleRules.push({
        kind: row.rule_kind || 'style',
        content: row.content,
        source: 'series',
      });
    }
  }

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
      for (const content of parsed.criticalRules ?? []) {
        if (content.trim()) {
          styleRules.push({ kind: 'critical', content: content.trim(), source: 'project' });
        }
      }
      for (const content of parsed.rules ?? []) {
        if (content.trim()) {
          styleRules.push({ kind: 'style', content: content.trim(), source: 'project' });
        }
      }
    } catch {
      if (styleRow.style_config.trim()) {
        styleRules.push({
          kind: 'style',
          content: styleRow.style_config.trim(),
          source: 'project',
        });
      }
    }
  }

  const seriesTitle = scope.seriesId
    ? (db.fictionSeries.getSeriesById(scope.seriesId)?.title ?? null)
    : null;

  return {
    projectId,
    seriesId: merged.seriesId,
    seriesTitle,
    worldKnowledge: merged.worldKnowledge,
    worldEntries: merged.worldEntries,
    styleRules,
  };
}

export function worldEntriesForTranslation(
  db: DatabaseManager,
  projectId: string,
  anchorChapter: number,
): { key: string; value: string }[] {
  const { worldEntries } = buildMergedWorldKnowledge(db, projectId, { anchorChapter });
  return worldEntries.map((e) => ({
    key: e.key,
    value: typeof e.value === 'string' ? e.value : JSON.stringify(e.value),
  }));
}
