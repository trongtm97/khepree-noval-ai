import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';

export interface StoryStateRow {
  id: string;
  project_id: string;
  current_chapter_number: number | null;
  state_json: string | null;
  summary_text: string | null;
  cultivation_state: string | null;
  location_state: string | null;
  important_items: string | null;
  unresolved_plot_points: string | null;
  world_knowledge_json: string | null;
  locked: number;
  created_at: string;
  updated_at: string;
}

export interface StructuredStoryState {
  summaryText?: string | null;
  cultivationState?: Record<string, unknown>;
  locationState?: Record<string, unknown>;
  importantItems?: Record<string, unknown>[];
  unresolvedPlotPoints?: string[];
  currentChapterNumber?: number | null;
  worldKnowledge?: Record<string, unknown> | null;
}

export class StoryStateRepository extends BaseRepository {
  getByProject(projectId: string): StoryStateRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM story_states WHERE project_id = ?`)
        .get(projectId) as StoryStateRow | undefined) ?? null
    );
  }

  ensure(projectId: string): StoryStateRow {
    const existing = this.getByProject(projectId);
    if (existing) return existing;
    const id = newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO story_states (
          id, project_id, current_chapter_number, state_json, summary_text,
          cultivation_state, location_state, important_items, unresolved_plot_points,
          world_knowledge_json, locked, created_at, updated_at
        ) VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, ?, ?)`,
      )
      .run(id, projectId, ts.created_at, ts.updated_at);
    return this.assertRow(this.getByProject(projectId), 'story_state', id);
  }

  patch(projectId: string, patch: StructuredStoryState): StoryStateRow {
    const row = this.ensure(projectId);
    if (row.locked === 1) {
      throw new Error('STORY_STATE_LOCKED');
    }

    const summary = patch.summaryText !== undefined ? patch.summaryText : row.summary_text;
    const cultivation =
      patch.cultivationState !== undefined
        ? JSON.stringify(patch.cultivationState)
        : row.cultivation_state;
    const location =
      patch.locationState !== undefined
        ? JSON.stringify(patch.locationState)
        : row.location_state;
    const items =
      patch.importantItems !== undefined
        ? JSON.stringify(patch.importantItems)
        : row.important_items;
    const plots =
      patch.unresolvedPlotPoints !== undefined
        ? JSON.stringify(patch.unresolvedPlotPoints)
        : row.unresolved_plot_points;
    const chapter =
      patch.currentChapterNumber !== undefined
        ? patch.currentChapterNumber
        : row.current_chapter_number;
    const world =
      patch.worldKnowledge !== undefined
        ? patch.worldKnowledge
          ? JSON.stringify(patch.worldKnowledge)
          : null
        : row.world_knowledge_json;

    this.db
      .prepare(
        `UPDATE story_states SET
          summary_text = ?,
          cultivation_state = ?,
          location_state = ?,
          important_items = ?,
          unresolved_plot_points = ?,
          current_chapter_number = ?,
          world_knowledge_json = ?,
          updated_at = ?
        WHERE project_id = ?`,
      )
      .run(
        summary,
        cultivation,
        location,
        items,
        plots,
        chapter,
        world,
        utcNow(),
        projectId,
      );

    return this.assertRow(this.getByProject(projectId), 'story_state', row.id);
  }

  parseStructured(row: StoryStateRow): StructuredStoryState {
    return {
      summaryText: row.summary_text,
      cultivationState: parseJson(row.cultivation_state),
      locationState: parseJson(row.location_state),
      importantItems: parseJsonArray(row.important_items),
      unresolvedPlotPoints: parseJsonStringArray(row.unresolved_plot_points),
      currentChapterNumber: row.current_chapter_number,
      worldKnowledge: parseJson(row.world_knowledge_json) ?? null,
    };
  }

  lock(projectId: string, locked = true): StoryStateRow {
    this.ensure(projectId);
    this.db
      .prepare(`UPDATE story_states SET locked = ?, updated_at = ? WHERE project_id = ?`)
      .run(locked ? 1 : 0, utcNow(), projectId);
    return this.assertRow(this.getByProject(projectId), 'story_state', projectId);
  }
}

function parseJson(raw: string | null): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function parseJsonArray(raw: string | null): Record<string, unknown>[] | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Record<string, unknown>[];
  } catch {
    return undefined;
  }
}

function parseJsonStringArray(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return undefined;
  }
}
