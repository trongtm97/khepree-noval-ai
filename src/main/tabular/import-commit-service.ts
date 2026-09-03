import type { TabularImportMode } from '@shared/constants/tabular';
import type {
  TermTabularDefaultStatus,
  TermTabularDuplicateStrategy,
} from '@shared/constants/term-tabular';
import type { TermScope, TermStatus } from '@shared/constants/term';
import { normalizeTermType } from '@shared/constants/term';
import type { TranslationSpreadsheetConflictStrategy } from '@shared/constants/translation-spreadsheet';
import type { SourceWorkbookImportMode } from '@shared/constants/source-workbook-tabular';
import { CHARACTER_WORKBOOK_COMMIT_ORDER } from '@shared/constants/character-tabular';
import { PROJECT_DATA_COMMIT_ORDER } from '@shared/constants/project-data-tabular';
import { SOURCE_WORKBOOK_COMMIT_ORDER } from '@shared/constants/source-workbook-tabular';
import type { TabularCommitResponse } from '@shared/schemas/tabular';
import { getDatabase, withTransaction } from '../db/connection';
import type { TermRow } from '../db/repositories/term-repository';
import type { TranslationVersionSource } from '@shared/constants/translation-editor';
import type { CharacterRow } from '../db/repositories/character-repository';
import type { TranslationRow } from '../db/repositories/translation-repository';
import type { CharacterStatus } from '@shared/constants/memory';
import type { CharacterTranslationRow } from '../db/repositories/character-translation-repository';
import type { RelationshipRow } from '../db/repositories/relationship-repository';
import type { RelationshipTranslationRow } from '../db/repositories/relationship-translation-repository';
import { tabularSchemaRegistry } from './tabular-schema-registry';
import { importPreviewService } from './import-preview-service';
import type { TabularUndoEntry, TabularPreviewSession } from './types';
import { markTabularImportDirty } from './tabular-notebook-dirty';
import { saveWorkbookRules, type WorkbookRuleRow } from './handlers/project-data-tabular-utils';
import { mergeWorldFactsIntoJson, type WorldFactRow } from './handlers/project-data-tabular-utils';
import type { ProjectRow } from '../db/repositories/project-repository';
import type { MemoryEventRow } from '../db/repositories/memory-event-repository';
import type { ChapterRow } from '../db/repositories/chapter-repository';
import type { ParagraphRow } from '../db/repositories/paragraph-repository';
import { rebuildChapterSourceText } from './handlers/source-workbook-utils';

export class ImportCommitService {
  commit(input: {
    previewId: string;
    mode: TabularImportMode;
    projectId?: string;
    editionId?: string;
    duplicateStrategy?: TermTabularDuplicateStrategy;
    defaultImportStatus?: TermTabularDefaultStatus;
    allowElevatedStatus?: boolean;
    conflictStrategy?: TranslationSpreadsheetConflictStrategy;
    sourceImportMode?: SourceWorkbookImportMode;
  }): TabularCommitResponse {
    const session = importPreviewService.getSession(input.previewId);
    if (!session) {
      throw new Error('Import preview expired or not found. Re-select the file.');
    }

    const handler = tabularSchemaRegistry.getHandler(session.dataType);
    const db = getDatabase();
    const projectId = input.projectId ?? session.projectId;
    const editionId = input.editionId ?? session.editionId;

    const termImport =
      session.dataType === 'terms'
        ? {
            duplicateStrategy:
              input.duplicateStrategy ??
              session.termImport?.duplicateStrategy ??
              'SKIP',
            defaultImportStatus:
              input.defaultImportStatus ??
              session.termImport?.defaultImportStatus ??
              'CANDIDATE',
            allowElevatedStatus:
              input.allowElevatedStatus ??
              session.termImport?.allowElevatedStatus ??
              false,
          }
        : session.termImport;

    const translationImport =
      session.dataType === 'translations'
        ? {
            conflictStrategy:
              input.conflictStrategy ??
              session.translationImport?.conflictStrategy ??
              'USE_EXCEL',
          }
        : session.translationImport;

    const sourceImport =
      session.dataType === 'source_workbook'
        ? {
            mode:
              input.sourceImportMode ??
              session.sourceImport?.mode ??
              'METADATA_ONLY',
          }
        : session.sourceImport;

    if (input.mode === 'REQUIRE_ALL_VALID' && session.stats.error > 0) {
      return {
        importId: '',
        inserted: 0,
        updated: 0,
        skipped: session.stats.total,
        errors: session.stats.error,
        rolledBack: false,
        message: 'Import blocked: file has validation errors (REQUIRE_ALL_VALID).',
      };
    }

    const rowsToCommit = this.sortCommitRows(
      session,
      session.rows.filter((r) => r.status !== 'error'),
    );
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const undoEntries: TabularUndoEntry[] = [];
    const committedSheets = new Set<string>();

    try {
      withTransaction(db.getConnection(), () => {
        for (const row of rowsToCommit) {
          try {
            const result = handler.commitRow(row.data, {
              db,
              projectId,
              editionId,
              meta: session.meta,
              termImport,
              translationImport,
              sourceImport,
            });
            if (row.data._sheet) committedSheets.add(row.data._sheet);
            if (result.action === 'insert') inserted += 1;
            else if (result.action === 'update') updated += 1;
            else skipped += 1;
            if (result.undo) undoEntries.push(result.undo);
          } catch (err) {
            errors += 1;
            if (input.mode === 'REQUIRE_ALL_VALID') {
              throw err;
            }
          }
        }
        if (input.mode === 'REQUIRE_ALL_VALID' && errors > 0) {
          throw new Error('Import failed with row errors');
        }
      });
    } catch (err) {
      importPreviewService.discard(input.previewId);
      return {
        importId: '',
        inserted: 0,
        updated: 0,
        skipped: rowsToCommit.length,
        errors: errors || 1,
        rolledBack: true,
        message: err instanceof Error ? err.message : 'Import rolled back',
      };
    }

    skipped += session.stats.error;

    const history = db.importHistory.create({
      project_id: projectId ?? null,
      edition_id: editionId ?? null,
      data_type: session.dataType,
      file_name: session.fileName,
      file_format: session.format,
      row_count: session.stats.total,
      inserted_count: inserted,
      updated_count: updated,
      skipped_count: skipped,
      error_count: session.stats.error + errors,
      undo_entries: undoEntries,
    });

    importPreviewService.discard(input.previewId);

    if ((inserted > 0 || updated > 0) && projectId) {
      markTabularImportDirty(db, {
        dataType: session.dataType,
        projectId,
        committedSheets: committedSheets.size > 0 ? committedSheets : undefined,
      });
    }

    const message =
      session.dataType === 'terms'
        ? `terms:${inserted}:${updated}:${skipped}`
        : session.dataType === 'translations'
          ? `translations:${inserted}:${updated}:${skipped}`
          : session.dataType === 'characters'
            ? `characters:${inserted}:${updated}:${skipped}`
            : session.dataType === 'project_data'
              ? `project_data:${inserted}:${updated}:${skipped}`
              : session.dataType === 'source_workbook'
                ? `source_workbook:${inserted}:${updated}:${skipped}`
                : `Imported ${inserted + updated} rows (${inserted} new, ${updated} updated).`;

    return {
      importId: history.id,
      inserted,
      updated,
      skipped,
      errors: session.stats.error + errors,
      rolledBack: false,
      message,
    };
  }

  undoLast(projectId?: string): { undone: boolean; importId: string | null; message: string } {
    const db = getDatabase();
    const latest = db.importHistory.getLatest(projectId);
    if (latest?.status !== 'committed') {
      return { undone: false, importId: null, message: 'No import to undo.' };
    }

    const entries = db.importHistory.parseUndoEntries(latest);
    if (entries.length === 0) {
      return {
        undone: false,
        importId: latest.id,
        message: 'Last import has no undo snapshot.',
      };
    }

    try {
      withTransaction(db.getConnection(), () => {
        for (const entry of [...entries].reverse()) {
          this.applyUndoEntry(entry, db);
        }
        db.importHistory.markUndone(latest.id);
      });
    } catch (err) {
      return {
        undone: false,
        importId: latest.id,
        message: err instanceof Error ? err.message : 'Undo failed',
      };
    }

    return {
      undone: true,
      importId: latest.id,
      message: `Undid import ${latest.file_name} (${latest.inserted_count} inserts, ${latest.updated_count} updates).`,
    };
  }

  private sortCommitRows(
    session: TabularPreviewSession,
    rows: TabularPreviewSession['rows'],
  ): TabularPreviewSession['rows'] {
    const orderList = session.sourceWorkbook
      ? SOURCE_WORKBOOK_COMMIT_ORDER
      : session.projectDataWorkbook
        ? PROJECT_DATA_COMMIT_ORDER
        : CHARACTER_WORKBOOK_COMMIT_ORDER;
    const order = new Map<string, number>(orderList.map((s, i) => [s, i]));
    return [...rows].sort((a, b) => {
      const sheetA = a.data._sheet;
      const sheetB = b.data._sheet;
      return (order.get(sheetA) ?? 99) - (order.get(sheetB) ?? 99);
    });
  }

  private applyUndoEntry(
    entry: TabularUndoEntry,
    db: ReturnType<typeof getDatabase>,
  ): void {
    if (entry.entityType === 'term') {
      if (entry.action === 'insert') {
        db.terms.softDelete(entry.entityId);
        return;
      }
      const prior = entry.prior as TermRow | null;
      if (!prior) return;
      db.terms.update(entry.entityId, {
        source_text: prior.source_text ?? prior.source_simplified,
        source_simplified: prior.source_simplified,
        source_traditional: prior.source_traditional,
        pinyin: prior.pinyin,
        source_language: prior.source_language,
        target_language: prior.target_language,
        term_type: normalizeTermType(prior.term_type),
        meaning: prior.meaning,
        scope: prior.scope as TermScope,
        scope_ref: prior.scope_ref,
        genre: prior.genre,
        status: prior.status as TermStatus,
        notes: prior.notes,
        locked: prior.locked === 1,
      });
      return;
    }

    if (entry.entityType === 'translation') {
      if (entry.action === 'insert') {
        db.translations.delete(entry.entityId);
        return;
      }
      const prior = entry.prior as TranslationRow | null;
      if (!prior) return;
      db.translations.appendVersion(entry.entityId, {
        translated_text: prior.translated_text,
        status: prior.status,
        version_source: prior.version_source as TranslationVersionSource,
        human_locked: prior.human_locked === 1,
        editor_note: 'Undo spreadsheet import',
      });
      return;
    }

    if (entry.entityType === 'character') {
      if (entry.action === 'insert') {
        db.characters.delete(entry.entityId);
        return;
      }
      const prior = entry.prior as {
        character: CharacterRow;
        translation: CharacterTranslationRow | null;
      } | null;
      if (!prior?.character) return;
      db.characters.update(entry.entityId, {
        canonical_name: prior.character.canonical_name,
        gender: prior.character.gender,
        role: prior.character.role,
        description: prior.character.description,
        status: prior.character.status as CharacterStatus,
        locked: prior.character.locked === 1,
      });
      if (prior.translation) {
        db.characterTranslations.upsert({
          character_id: prior.translation.character_id,
          edition_id: prior.translation.edition_id,
          target_language: prior.translation.target_language,
          preferred_name: prior.translation.preferred_name,
          aliases_json: prior.translation.aliases_json,
          notes: prior.translation.notes,
          locked: prior.translation.locked === 1,
          source: prior.translation.source,
        });
      }
      return;
    }

    if (entry.entityType === 'character_base') {
      if (entry.action === 'insert') {
        db.characters.delete(entry.entityId);
        return;
      }
      const prior = entry.prior as {
        character: CharacterRow;
        aliases: import('../db/repositories/character-repository').CharacterAliasRow[];
      } | null;
      if (!prior?.character) return;
      db.characters.update(entry.entityId, {
        canonical_name: prior.character.canonical_name,
        gender: prior.character.gender,
        role: prior.character.role,
        description: prior.character.description,
        first_chapter: prior.character.first_chapter,
        locked: prior.character.locked === 1,
      });
      return;
    }

    if (entry.entityType === 'character_translation') {
      if (entry.action === 'insert') {
        const prior = entry.prior as { translation: CharacterTranslationRow } | null;
        if (prior?.translation) {
          db.characterTranslations.deleteByCharacterAndEdition(
            prior.translation.character_id,
            prior.translation.edition_id,
          );
        }
        return;
      }
      const prior = entry.prior as { translation: CharacterTranslationRow } | null;
      if (!prior?.translation) return;
      db.characterTranslations.upsert({
        character_id: prior.translation.character_id,
        edition_id: prior.translation.edition_id,
        target_language: prior.translation.target_language,
        preferred_name: prior.translation.preferred_name,
        aliases_json: prior.translation.aliases_json,
        notes: prior.translation.notes,
        locked: prior.translation.locked === 1,
        source: prior.translation.source,
      });
      return;
    }

    if (entry.entityType === 'relationship') {
      if (entry.action === 'insert') {
        db.relationships.delete(entry.entityId);
        return;
      }
      const prior = entry.prior as { relationship: RelationshipRow } | null;
      if (!prior?.relationship) return;
      db.relationships.update(entry.entityId, {
        relationship_type: prior.relationship.relationship_type,
        description: prior.relationship.description,
        valid_from_chapter: prior.relationship.valid_from_chapter,
        valid_to_chapter: prior.relationship.valid_to_chapter,
        source: prior.relationship.source,
        locked: prior.relationship.locked === 1,
      });
      return;
    }

    if (entry.entityType === 'relationship_translation') {
      if (entry.action === 'insert') {
        const prior = entry.prior as { translation: RelationshipTranslationRow } | null;
        if (prior?.translation) {
          db.getConnection()
            .prepare(`DELETE FROM relationship_translations WHERE id = ?`)
            .run(prior.translation.id);
        }
        return;
      }
      const prior = entry.prior as { translation: RelationshipTranslationRow } | null;
      if (!prior?.translation) return;
      db.relationshipTranslations.upsert({
        relationship_id: prior.translation.relationship_id,
        edition_id: prior.translation.edition_id,
        target_language: prior.translation.target_language,
        a_calls_b: prior.translation.a_calls_b,
        b_calls_a: prior.translation.b_calls_a,
        notes: prior.translation.notes,
        locked: prior.translation.locked === 1,
        source: prior.translation.source,
      });
      return;
    }

    if (entry.entityType === 'project_metadata') {
      const prior = entry.prior as { project: ProjectRow } | null;
      if (!prior?.project) return;
      db.projects.updateMetadata(entry.entityId, {
        source_title: prior.project.source_title,
        target_title: prior.project.target_title,
        title_cn: prior.project.title_cn,
        title_vi: prior.project.title_vi,
        author_name: prior.project.author_name,
        genre: prior.project.genre,
        description: prior.project.description,
        official_summary: prior.project.official_summary,
      });
      return;
    }

    if (entry.entityType === 'project_rules') {
      const prior = entry.prior as { rules: WorkbookRuleRow[] } | null;
      if (!prior) return;
      saveWorkbookRules(db, entry.entityId, prior.rules);
      return;
    }

    if (entry.entityType === 'world_knowledge') {
      const prior = entry.prior as {
        world_knowledge_json: string | null;
        facts: WorldFactRow[];
      } | null;
      if (!prior) return;
      const merged = mergeWorldFactsIntoJson(prior.world_knowledge_json, prior.facts);
      db.storyStates.patch(entry.entityId, {
        worldKnowledge: JSON.parse(merged) as Record<string, unknown>,
      });
      return;
    }

    if (entry.entityType === 'memory_event') {
      if (entry.action === 'insert') {
        db.memoryEvents.deleteByIds([entry.entityId]);
        return;
      }
      const prior = entry.prior as { event: MemoryEventRow } | null;
      if (!prior?.event) return;
      db.memoryEvents.upsert({
        project_id: prior.event.project_id,
        category: prior.event.category as import('@shared/constants/memory').MemoryEventCategory,
        event_key: prior.event.event_key,
        event_value: prior.event.event_value,
        source: prior.event.source as import('@shared/constants/memory').MemorySource,
        chapter_number: prior.event.chapter_number,
        locked: prior.event.locked === 1,
      });
      return;
    }

    if (entry.entityType === 'source_chapter') {
      const prior = entry.prior as { chapter: ChapterRow } | null;
      if (!prior?.chapter) return;
      db.chapters.update(entry.entityId, {
        chapter_number: prior.chapter.chapter_number,
        chapter_type: prior.chapter.chapter_type,
        display_title: prior.chapter.display_title,
        chapter_title: prior.chapter.chapter_title,
        sequence_order: prior.chapter.sequence_order,
      });
      return;
    }

    if (entry.entityType === 'source_paragraph') {
      const prior = entry.prior as { paragraph: ParagraphRow } | null;
      if (!prior?.paragraph) return;
      db.paragraphs.update(entry.entityId, prior.paragraph.source_text);
      rebuildChapterSourceText(db, prior.paragraph.chapter_id);
    }
  }
}

export const importCommitService = new ImportCommitService();
