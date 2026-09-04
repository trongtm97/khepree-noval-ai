import type { DatabaseManager } from '../db/database-manager';
import { getDatabase } from '../db/connection';
import type { FictionSeriesRow } from '../db/repositories/fiction-series-repository';
import type { TermScope, TermStatus, TermType } from '@shared/constants/term';

export interface FictionSeriesDto {
  id: string;
  title: string;
  description: string | null;
  genre: string | null;
  volumeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FictionSeriesVolumeDto {
  id: string;
  seriesId: string;
  projectId: string;
  projectTitle: string;
  volumeOrder: number;
  volumeLabel: string | null;
}

export interface SeriesMembershipConflict {
  sourceText: string;
  projectTranslation: string | null;
  seriesTranslation: string | null;
  projectTermId: string;
  seriesTermId: string;
  projectLocked: boolean;
  seriesLocked: boolean;
}

export interface SeriesMembershipConflictPreview {
  projectId: string;
  fromSeriesId: string | null;
  toSeriesId: string;
  conflicts: SeriesMembershipConflict[];
}

function toSeriesDto(db: DatabaseManager, row: FictionSeriesRow): FictionSeriesDto {
  const volumes = db.fictionSeries.listVolumes(row.id);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    genre: row.genre,
    volumeCount: volumes.length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function primaryTranslation(db: DatabaseManager, termId: string): string | null {
  return (
    db.terms.listTranslations(termId).find((t) => t.is_primary === 1)?.target_text ?? null
  );
}

export class FictionSeriesService {
  constructor(private readonly getDb: () => DatabaseManager) {}

  listSeries(): FictionSeriesDto[] {
    const db = this.getDb();
    return db.fictionSeries.listSeries().map((row) => toSeriesDto(db, row));
  }

  getSeries(seriesId: string): FictionSeriesDto | null {
    const db = this.getDb();
    const row = db.fictionSeries.getSeriesById(seriesId);
    return row ? toSeriesDto(db, row) : null;
  }

  createSeries(input: {
    title: string;
    description?: string | null;
    genre?: string | null;
  }): FictionSeriesDto {
    const db = this.getDb();
    const row = db.fictionSeries.createSeries(input);
    return toSeriesDto(db, row);
  }

  listVolumes(seriesId: string): FictionSeriesVolumeDto[] {
    const db = this.getDb();
    return db.fictionSeries.listVolumes(seriesId).map((v) => {
      const project = db.projects.getById(v.project_id);
      return {
        id: v.id,
        seriesId: v.series_id,
        projectId: v.project_id,
        projectTitle: project?.title ?? v.project_id,
        volumeOrder: v.volume_order,
        volumeLabel: v.volume_label,
      };
    });
  }

  addVolume(input: {
    seriesId: string;
    projectId: string;
    volumeOrder?: number;
    volumeLabel?: string | null;
  }): FictionSeriesVolumeDto {
    const db = this.getDb();
    const row = db.fictionSeries.addVolume(input);
    const project = db.projects.getById(row.project_id);
    return {
      id: row.id,
      seriesId: row.series_id,
      projectId: row.project_id,
      projectTitle: project?.title ?? row.project_id,
      volumeOrder: row.volume_order,
      volumeLabel: row.volume_label,
    };
  }

  removeVolume(seriesId: string, projectId: string): { ok: true } {
    const db = this.getDb();
    const removed = db.fictionSeries.removeVolumeMembership(seriesId, projectId);
    if (!removed) throw new Error('VOLUME_MEMBERSHIP_NOT_FOUND');
    return { ok: true };
  }

  reorderVolumes(seriesId: string, orderedProjectIds: string[]): { ok: true } {
    this.getDb().fictionSeries.reorderVolumes(seriesId, orderedProjectIds);
    return { ok: true };
  }

  previewMembershipChange(input: {
    projectId: string;
    toSeriesId: string;
  }): SeriesMembershipConflictPreview {
    const db = this.getDb();
    const membership = db.fictionSeries.getVolumeByProject(input.projectId);
    const fromSeriesId = membership?.series_id ?? null;

    const projectTerms = db.terms.listByScope('PROJECT', input.projectId);
    const seriesTerms = db.terms.listByScope('SERIES', input.toSeriesId);

    const conflicts: SeriesMembershipConflict[] = [];
    for (const pt of projectTerms) {
      const source = pt.source_text ?? pt.source_simplified;
      if (!source) continue;
      const match = seriesTerms.find(
        (st) => (st.source_text ?? st.source_simplified) === source,
      );
      if (!match) continue;
      const projectTranslation = primaryTranslation(db, pt.id);
      const seriesTranslation = primaryTranslation(db, match.id);
      if (projectTranslation === seriesTranslation) continue;
      conflicts.push({
        sourceText: source,
        projectTranslation,
        seriesTranslation,
        projectTermId: pt.id,
        seriesTermId: match.id,
        projectLocked: pt.locked === 1 || pt.status === 'LOCKED',
        seriesLocked: match.locked === 1 || match.status === 'LOCKED',
      });
    }

    return {
      projectId: input.projectId,
      fromSeriesId,
      toSeriesId: input.toSeriesId,
      conflicts,
    };
  }

  assignProjectToSeries(input: {
    projectId: string;
    seriesId: string;
    volumeLabel?: string | null;
    force?: boolean;
  }): FictionSeriesVolumeDto {
    const db = this.getDb();
    const preview = this.previewMembershipChange({
      projectId: input.projectId,
      toSeriesId: input.seriesId,
    });
    if (!input.force && preview.conflicts.some((c) => c.projectLocked || c.seriesLocked)) {
      throw new Error('SERIES_CONFLICT_LOCKED');
    }
    if (!input.force && preview.conflicts.length > 0) {
      throw new Error('SERIES_CONFLICT_PREVIEW_REQUIRED');
    }

    const existing = db.fictionSeries.getVolumeByProject(input.projectId);
    if (existing && existing.series_id !== input.seriesId) {
      db.fictionSeries.removeVolumeMembership(existing.series_id, input.projectId);
    }
    const volume = this.addVolume({
      seriesId: input.seriesId,
      projectId: input.projectId,
      volumeLabel: input.volumeLabel,
    });
    this.seedSharedSeriesKnowledge(input.seriesId, input.projectId);
    return volume;
  }

  /**
   * Intended series workflow: shared SERIES glossary + world state across volumes.
   * - Seed series world from project story world when series world empty.
   * - Copy unique PROJECT terms into SERIES scope (keep PROJECT rows as overrides).
   */
  private seedSharedSeriesKnowledge(seriesId: string, projectId: string): void {
    const db = this.getDb();

    const world = db.fictionSeries.getWorldState(seriesId);
    if (!world?.world_knowledge_json) {
      const story = db.storyStates.getByProject(projectId);
      if (story?.world_knowledge_json) {
        db.fictionSeries.setWorldKnowledgeJson(seriesId, story.world_knowledge_json);
      }
    }

    if (db.fictionSeries.listStyleRules(seriesId).length === 0) {
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
          let order = 0;
          for (const content of parsed.criticalRules ?? []) {
            if (!content?.trim()) continue;
            db.fictionSeries.upsertStyleRule({
              seriesId,
              ruleKind: 'critical',
              content: content.trim(),
              sortOrder: order++,
            });
          }
          for (const content of parsed.rules ?? []) {
            if (!content?.trim()) continue;
            db.fictionSeries.upsertStyleRule({
              seriesId,
              ruleKind: 'style',
              content: content.trim(),
              sortOrder: order++,
            });
          }
        } catch {
          if (styleRow.style_config.trim()) {
            db.fictionSeries.upsertStyleRule({
              seriesId,
              ruleKind: 'style',
              content: styleRow.style_config.trim(),
              sortOrder: 0,
            });
          }
        }
      }
    }

    const seriesTerms = db.terms.listByScope('SERIES', seriesId);
    const seriesSources = new Set(
      seriesTerms
        .map((t) => t.source_text ?? t.source_simplified)
        .filter((s): s is string => Boolean(s)),
    );

    for (const pt of db.terms.listByScope('PROJECT', projectId)) {
      const source = pt.source_text ?? pt.source_simplified;
      if (!source || seriesSources.has(source)) continue;
      const preferred = primaryTranslation(db, pt.id);
      db.terms.create({
        source_text: source,
        source_simplified: pt.source_simplified,
        source_traditional: pt.source_traditional,
        pinyin: pt.pinyin,
        transliteration: pt.transliteration,
        term_type: pt.term_type as TermType,
        genre: pt.genre,
        scope: 'SERIES',
        scope_ref: seriesId,
        status:
          pt.status === 'LOCKED' ? 'PROJECT_VERIFIED' : (pt.status as TermStatus),
        preferred_translation: preferred ?? undefined,
        meaning: pt.meaning,
        notes: pt.notes,
        source_language: pt.source_language,
        target_language: pt.target_language,
      });
      seriesSources.add(source);
    }
  }

  exportSeriesKnowledge(seriesId: string): {
    schemaVersion: 1;
    kind: 'khepree-series-knowledge';
    series: FictionSeriesDto;
    volumes: FictionSeriesVolumeDto[];
    terms: Array<{
      id: string;
      scope: TermScope;
      sourceText: string;
      translations: string[];
      termType: string;
      locked: boolean;
    }>;
    styleRules: Array<{ kind: string; content: string }>;
    worldKnowledge: Record<string, unknown> | null;
  } {
    const db = this.getDb();
    const series = this.getSeries(seriesId);
    if (!series) throw new Error('SERIES_NOT_FOUND');
    const volumes = this.listVolumes(seriesId);
    const terms = db.terms.listByScope('SERIES', seriesId).map((t) => ({
      id: t.id,
      scope: t.scope as TermScope,
      sourceText: t.source_text ?? t.source_simplified,
      translations: db.terms.listTranslations(t.id).map((tr) => tr.target_text),
      termType: t.term_type,
      locked: t.locked === 1 || t.status === 'LOCKED',
    }));
    const styleRules = db.fictionSeries.listStyleRules(seriesId).map((r) => ({
      kind: r.rule_kind,
      content: r.content,
    }));
    const world = db.fictionSeries.getWorldState(seriesId);
    let worldKnowledge: Record<string, unknown> | null = null;
    if (world?.world_knowledge_json) {
      try {
        worldKnowledge = JSON.parse(world.world_knowledge_json) as Record<string, unknown>;
      } catch {
        worldKnowledge = null;
      }
    }
    return {
      schemaVersion: 1,
      kind: 'khepree-series-knowledge',
      series,
      volumes,
      terms,
      styleRules,
      worldKnowledge,
    };
  }
}

let singleton: FictionSeriesService | null = null;

export function getFictionSeriesService(): FictionSeriesService {
  if (!singleton) {
    singleton = new FictionSeriesService(() => getDatabase());
  }
  return singleton;
}

export function resetFictionSeriesServiceForTests(): void {
  singleton = null;
}
