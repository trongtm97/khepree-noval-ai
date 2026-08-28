import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { CHARACTER_TABULAR_WARNINGS } from '@shared/constants/character-tabular';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { ensureDefaultEdition } from '@main/services/edition-service';
import { importPreviewService } from '@main/tabular/import-preview-service';
import { importCommitService } from '@main/tabular/import-commit-service';
import { tabularExportService } from '@main/tabular/tabular-export-service';
import { validateWorkbookRow } from '@main/tabular/handlers/character-workbook-handler';

describe('character workbook tabular', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-char-wb-'));
    closeDatabase();
    initializeDatabase({
      dataDir: path.join(tempRoot, 'data'),
      backupsDir: path.join(tempRoot, 'backups'),
    });
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function seedCharacter(canonicalName: string, preferredName?: string) {
    const db = getDatabase();
    const project = db.projects.create({
      title: 'Cast Novel',
      source_language: 'zh-Hans',
      target_language: 'vi',
    });
    const edition = ensureDefaultEdition(db, project.id);
    const ch = db.characters.create({
      project_id: project.id,
      canonical_name: canonicalName,
      role: 'protagonist',
    });
    if (preferredName) {
      db.characterTranslations.upsert({
        character_id: ch.id,
        edition_id: edition.id,
        target_language: edition.target_language,
        preferred_name: preferredName,
        source: 'test',
      });
    }
    return { projectId: project.id, editionId: edition.id, characterId: ch.id };
  }

  it('exports and imports multi-sheet workbook with stable character_id', async () => {
    const { projectId, editionId, characterId } = seedCharacter('李逍遥', 'Lý Tiêu Dao');

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-char-xlsx-'));
    const xlsxPath = path.join(tempDir, 'characters.xlsx');
    await tabularExportService.export({
      dataType: 'characters',
      format: 'xlsx',
      outputPath: xlsxPath,
      projectId,
      editionId,
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(xlsxPath);
    const chars = workbook.getWorksheet('CHARACTERS');
    expect(chars).toBeTruthy();
    const row = chars!.getRow(2);
    expect(String(row.getCell(1).value)).toBe(characterId);
    expect(String(row.getCell(2).value)).toBe('李逍遥');

    const preview = await importPreviewService.preview({
      filePath: xlsxPath,
      projectId,
      editionId,
      dataTypeHint: 'characters',
    });
    expect(preview.validCount + preview.warningCount).toBeGreaterThan(0);

    const commit = importCommitService.commit({
      previewId: preview.previewId,
      mode: 'IMPORT_VALID_ONLY',
      projectId,
      editionId,
    });
    expect(commit.updated + commit.inserted).toBeGreaterThanOrEqual(1);

    const db = getDatabase();
    expect(db.characters.getById(characterId)?.canonical_name).toBe('李逍遥');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('warns DISPLAY_NAME_COLLISION without merging characters', () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'Dup', source_language: 'zh-Hans', target_language: 'vi' });
    const edition = ensureDefaultEdition(db, project.id);
    const a = db.characters.create({ project_id: project.id, canonical_name: '甲' });
    const b = db.characters.create({ project_id: project.id, canonical_name: '乙' });
    db.characterTranslations.upsert({
      character_id: a.id,
      edition_id: edition.id,
      target_language: 'vi',
      preferred_name: 'Anh A',
      source: 'test',
    });

    const result = validateWorkbookRow(
      'CHARACTER_TRANSLATIONS',
      {
        character_id: b.id,
        edition_id: edition.id,
        target_language: 'vi',
        preferred_name: 'Anh A',
      },
      2,
      { db, projectId: project.id, editionId: edition.id },
    );
    expect(result.messages).toContain(CHARACTER_TABULAR_WARNINGS.DISPLAY_NAME_COLLISION);
    expect(db.characters.listByProject(project.id)).toHaveLength(2);
  });

  it('errors on ambiguous canonical source name match', () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'Amb', source_language: 'zh-Hans', target_language: 'vi' });
    const edition = ensureDefaultEdition(db, project.id);
    const ts = new Date().toISOString();
    db.getConnection()
      .prepare(
        `INSERT INTO characters (id, project_id, canonical_name, status, locked, created_at, updated_at)
         VALUES (?, ?, ?, 'active', 0, ?, ?)`,
      )
      .run(randomUUID(), project.id, '同名', ts, ts);
    db.getConnection()
      .prepare(
        `INSERT INTO characters (id, project_id, canonical_name, status, locked, created_at, updated_at)
         VALUES (?, ?, ?, 'active', 0, ?, ?)`,
      )
      .run(randomUUID(), project.id, '同名', ts, ts);

    const result = validateWorkbookRow(
      'CHARACTERS',
      { canonical_source_name: '同名' },
      2,
      { db, projectId: project.id, editionId: edition.id },
    );
    expect(result.status).toBe('error');
    expect(result.messages).toContain(CHARACTER_TABULAR_WARNINGS.AMBIGUOUS_CHARACTER);
  });
});
