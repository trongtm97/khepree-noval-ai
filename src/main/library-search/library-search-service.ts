import { newId } from '../db/utils/uuid';
import { utcNow } from '../db/utils/timestamps';
import type { DatabaseManager } from '../db/database-manager';
import { logger } from '../logging/logger';
import {
  DEFAULT_INDEX_SOURCE_TEXT,
  DEFAULT_INDEX_TRANSLATION_TEXT,
  LIBRARY_SEARCH_DEFAULT_LIMIT,
  LIBRARY_SEARCH_DIRTY_BATCH_SIZE,
  LIBRARY_SEARCH_META_KEYS,
  LIBRARY_SEARCH_REINDEX_BATCH_SIZE,
  type LibrarySearchEntityType,
} from '@shared/constants/library-search';
import type {
  LibrarySearchIndexProgressDto,
  LibrarySearchQueryInput,
  LibrarySearchQueryResultDto,
  LibrarySearchResultItemDto,
  LibrarySearchSettingsDto,
} from '@shared/schemas/library-search';
import { parseEntityKey, prepareLibraryFtsQuery } from './fts-query';
import {
  buildIndexRow,
  buildLibrarySearchRoute,
  listAllIndexRefs,
  resolveResultRouteMeta,
  resolveResultTitle,
  type LibraryIndexEntityRef,
} from './index-builder';
import { emitLibrarySearchReindexProgress } from './library-search-event-bridge';
import { LIBRARY_SEARCH_FTS_VIRTUAL_TABLE_SQL } from './fts-schema';

export class LibrarySearchService {
  private activeQueryGeneration = 0;
  private reindexRunId: string | null = null;
  private reindexCancelled = false;
  private dirtyTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly db: DatabaseManager) {}

  startDirtyProcessor(): void {
    if (this.dirtyTimer) return;
    this.dirtyTimer = setInterval(() => {
      try {
        this.processDirtyBatch(LIBRARY_SEARCH_DIRTY_BATCH_SIZE);
      } catch (error) {
        logger.warn('library search dirty batch failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }, 8000);
  }

  stopDirtyProcessor(): void {
    if (this.dirtyTimer) {
      clearInterval(this.dirtyTimer);
      this.dirtyTimer = null;
    }
  }

  getSettings(): LibrarySearchSettingsDto {
    const meta = this.db.appMeta;
    return {
      indexSourceText:
        meta.get(LIBRARY_SEARCH_META_KEYS.indexSourceText) !== '0' &&
        (meta.get(LIBRARY_SEARCH_META_KEYS.indexSourceText) === '1' ||
          meta.get(LIBRARY_SEARCH_META_KEYS.indexSourceText) == null),
      indexTranslationText:
        meta.get(LIBRARY_SEARCH_META_KEYS.indexTranslationText) !== '0' &&
        (meta.get(LIBRARY_SEARCH_META_KEYS.indexTranslationText) === '1' ||
          meta.get(LIBRARY_SEARCH_META_KEYS.indexTranslationText) == null),
      lastFullReindexAt: meta.get(LIBRARY_SEARCH_META_KEYS.lastFullReindexAt),
    };
  }

  updateSettings(patch: Partial<LibrarySearchSettingsDto>): LibrarySearchSettingsDto {
    const meta = this.db.appMeta;
    if (patch.indexSourceText !== undefined) {
      meta.set(
        LIBRARY_SEARCH_META_KEYS.indexSourceText,
        patch.indexSourceText ? '1' : '0',
      );
    }
    if (patch.indexTranslationText !== undefined) {
      meta.set(
        LIBRARY_SEARCH_META_KEYS.indexTranslationText,
        patch.indexTranslationText ? '1' : '0',
      );
    }
    return this.getSettings();
  }

  private readIndexSettings(): { indexSourceText: boolean; indexTranslationText: boolean } {
    const s = this.getSettings();
    return {
      indexSourceText: s.indexSourceText ?? DEFAULT_INDEX_SOURCE_TEXT,
      indexTranslationText: s.indexTranslationText ?? DEFAULT_INDEX_TRANSLATION_TEXT,
    };
  }

  query(input: LibrarySearchQueryInput): LibrarySearchQueryResultDto {
    const generation = ++this.activeQueryGeneration;
    const requestId = input.requestId ?? newId();
    const limit = input.limit ?? LIBRARY_SEARCH_DEFAULT_LIMIT;
    const offset = input.offset ?? 0;
    const ftsQuery = prepareLibraryFtsQuery(input.query);

    if (!ftsQuery) {
      return { requestId, items: [], total: 0, limit, offset };
    }

    try {
      const { rows, total } = this.db.librarySearch.searchFts({
        ftsQuery,
        limit,
        offset,
        filters: {
          projectIds: input.projectIds,
          seriesIds: input.seriesIds,
          entityTypes: input.entityTypes,
          statuses: input.statuses,
          languages: input.languages,
        },
      });

      if (generation !== this.activeQueryGeneration) {
        return { requestId, items: [], total: 0, limit, offset, cancelled: true };
      }

      const items: LibrarySearchResultItemDto[] = rows.map((row) => {
        const parsed = parseEntityKey(row.entity_key);
        const entityType = row.entity_type as LibrarySearchEntityType;
        const entityId = parsed?.id ?? row.entity_key;
        const routeMeta = resolveResultRouteMeta(
          this.db,
          entityType,
          entityId,
          row.project_id,
        );
        const route = buildLibrarySearchRoute({
          entityType,
          entityId,
          projectId: row.project_id,
          chapterId: routeMeta.chapterId,
          stableParagraphId: routeMeta.stableParagraphId,
        });
        const projectTitle = row.project_id
          ? (this.db.projects.getById(row.project_id)?.title ?? null)
          : null;
        const seriesTitle = row.series_id
          ? (this.db.fictionSeries.getSeriesById(row.series_id)?.title ?? null)
          : null;

        return {
          entityKey: row.entity_key,
          entityType,
          entityId,
          projectId: row.project_id,
          seriesId: row.series_id,
          projectTitle,
          seriesTitle,
          title: resolveResultTitle(this.db, entityType, entityId),
          snippet: row.snippet ?? '',
          status: row.status,
          language: row.language,
          rank: row.rank,
          route,
        };
      });

      return { requestId, items, total, limit, offset };
    } catch (error) {
      logger.warn('library search query failed — attempting FTS rebuild', {
        message: error instanceof Error ? error.message : String(error),
      });
      try {
        this.recoverFtsCorruption();
      } catch (recoverError) {
        logger.warn('library search FTS recovery failed', {
          message:
            recoverError instanceof Error ? recoverError.message : String(recoverError),
        });
      }
      return { requestId, items: [], total: 0, limit, offset };
    }
  }

  cancelQuery(): void {
    this.activeQueryGeneration += 1;
  }

  getReindexProgress(): LibrarySearchIndexProgressDto | null {
    const run = this.db.librarySearch.getActiveIndexRun();
    if (!run) return null;
    return this.toProgressDto(run);
  }

  async startReindex(force = false): Promise<LibrarySearchIndexProgressDto> {
    const active = this.db.librarySearch.getActiveIndexRun();
    if (active && !force) {
      return this.toProgressDto(active);
    }
    if (active && force) {
      this.reindexCancelled = true;
      this.db.librarySearch.updateIndexRun(active.id, {
        status: 'CANCELLED',
        finishedAt: utcNow(),
      });
    }

    this.reindexCancelled = false;
    const run = this.db.librarySearch.createIndexRun();
    this.reindexRunId = run.id;

    this.db.librarySearch.updateIndexRun(run.id, {
      status: 'RUNNING',
      phase: 'preparing',
      entitiesTotal: 0,
      entitiesDone: 0,
    });
    this.emitProgress(run.id);

    // Collect refs asynchronously so startup IPC is not blocked on large libraries.
    void this.runReindexLoop(run.id, null, 0);

    return this.toProgressDto(this.db.librarySearch.getIndexRunById(run.id)!);
  }

  cancelReindex(): LibrarySearchIndexProgressDto | null {
    this.reindexCancelled = true;
    const run = this.db.librarySearch.getActiveIndexRun();
    if (!run) return null;
    const updated = this.db.librarySearch.updateIndexRun(run.id, {
      status: 'CANCELLED',
      phase: 'cancelled',
      finishedAt: utcNow(),
    });
    if (updated) this.emitProgress(updated.id);
    return updated ? this.toProgressDto(updated) : null;
  }

  processDirtyBatch(limit = LIBRARY_SEARCH_DIRTY_BATCH_SIZE): number {
    if (this.db.librarySearch.getActiveIndexRun()) return 0;
    const dirty = this.db.librarySearch.listDirty(limit);
    const settings = this.readIndexSettings();
    let processed = 0;

    for (const row of dirty) {
      const ref: LibraryIndexEntityRef = {
        entityType: row.entity_type as LibrarySearchEntityType,
        entityId: row.entity_id,
        projectId: row.project_id,
      };
      this.indexEntity(ref, settings);
      this.db.librarySearch.clearDirty(row.entity_type, row.entity_id);
      processed += 1;
    }
    return processed;
  }

  recoverFtsCorruption(): void {
    try {
      this.db.getConnection().exec('DROP TABLE IF EXISTS library_search_fts');
      this.db.getConnection().exec(LIBRARY_SEARCH_FTS_VIRTUAL_TABLE_SQL);
    } catch (error) {
      logger.warn('library search FTS table recreate failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    void this.startReindex(true);
  }

  private async runReindexLoop(
    runId: string,
    refs: LibraryIndexEntityRef[] | null,
    startIndex: number,
  ): Promise<void> {
    let resolvedRefs = refs;
    if (!resolvedRefs) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (this.reindexCancelled || this.reindexRunId !== runId) {
        return;
      }
      resolvedRefs = listAllIndexRefs(this.db);
      this.db.librarySearch.updateIndexRun(runId, {
        phase: 'indexing',
        entitiesTotal: resolvedRefs.length,
        entitiesDone: 0,
      });
      this.emitProgress(runId);
    }

    const settings = this.readIndexSettings();
    let done = startIndex;

    while (done < resolvedRefs.length) {
      if (this.reindexCancelled || this.reindexRunId !== runId) {
        return;
      }

      const batchEnd = Math.min(done + LIBRARY_SEARCH_REINDEX_BATCH_SIZE, resolvedRefs.length);
      for (let i = done; i < batchEnd; i += 1) {
        const ref = resolvedRefs[i]!;
        this.indexEntity(ref, settings);
      }
      done = batchEnd;

      this.db.librarySearch.updateIndexRun(runId, {
        entitiesDone: done,
        lastEntityKey: `${resolvedRefs[batchEnd - 1]?.entityType}:${resolvedRefs[batchEnd - 1]?.entityId}`,
        checkpointJson: JSON.stringify({ cursor: done }),
      });
      this.emitProgress(runId);

      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    this.db.librarySearch.clearAllDirty();
    this.db.appMeta.set(LIBRARY_SEARCH_META_KEYS.lastFullReindexAt, utcNow());
    this.db.librarySearch.updateIndexRun(runId, {
      status: 'COMPLETED',
      phase: 'completed',
      entitiesDone: resolvedRefs.length,
      finishedAt: utcNow(),
    });
    this.emitProgress(runId);
    if (this.reindexRunId === runId) {
      this.reindexRunId = null;
    }
  }

  private indexEntity(
    ref: LibraryIndexEntityRef,
    settings: { indexSourceText: boolean; indexTranslationText: boolean },
  ): void {
    const row = buildIndexRow(this.db, ref, settings);
    const key = `${ref.entityType}:${ref.entityId}`;
    if (!row || !row.body.trim()) {
      this.db.librarySearch.deleteFtsByEntityKey(key);
      return;
    }
    this.db.librarySearch.upsertFtsRow(row);
  }

  private emitProgress(runId: string): void {
    const run = this.db.librarySearch.getIndexRunById(runId);
    if (!run) return;
    emitLibrarySearchReindexProgress(this.toProgressDto(run));
  }

  private toProgressDto(
    run: NonNullable<ReturnType<DatabaseManager['librarySearch']['getIndexRunById']>>,
  ): LibrarySearchIndexProgressDto {
    return {
      runId: run.id,
      status: run.status as LibrarySearchIndexProgressDto['status'],
      phase: run.phase,
      entitiesDone: run.entities_done,
      entitiesTotal: run.entities_total,
      errorMessage: run.error_message,
    };
  }
}

let singleton: LibrarySearchService | null = null;

export function getLibrarySearchService(db: DatabaseManager): LibrarySearchService {
  singleton ??= new LibrarySearchService(db);
  return singleton;
}

export function resetLibrarySearchServiceForTests(): void {
  singleton?.stopDirtyProcessor();
  singleton = null;
}
