import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { PROJECT_DATA_WARNINGS } from '@shared/constants/project-data-tabular';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { ensureDefaultEdition } from '@main/services/edition-service';
import { importPreviewService } from '@main/tabular/import-preview-service';
import { importCommitService } from '@main/tabular/import-commit-service';
import { tabularExportService } from '@main/tabular/tabular-export-service';
import { validateProjectDataRow } from '@main/tabular/handlers/project-data-workbook-handler';

describe('project data workbook', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-pd-wb-'));
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

  it('exports and imports PROJECT + RULES sheets', async () => {
    const db = getDatabase();
    const project = db.projects.create({
      title: 'Novel',
      source_language: 'zh-Hans',
      target_language: 'vi',
      genre: 'xianxia',
      description: 'desc',
    });
    db.projects.updateMetadata(project.id, {
      official_summary: 'summary',
      author_name: 'Author',
    });
    const edition = ensureDefaultEdition(db, project.id);
    db.projects.setStyleConfig(
      project.id,
      JSON.stringify({
        rules: ['rule one'],
        criticalRules: [],
        workbookRules: [
          {
            rule_id: 'r1',
            priority: 1,
            category: 'general',
            rule_text: 'rule one',
            enabled: true,
            locked: false,
          },
        ],
      }),
    );

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-pd-xlsx-'));
    const xlsxPath = path.join(tempDir, 'project-data.xlsx');
    await tabularExportService.export({
      dataType: 'project_data',
      format: 'xlsx',
      outputPath: xlsxPath,
      projectId: project.id,
      editionId: edition.id,
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(xlsxPath);
    expect(workbook.getWorksheet('PROJECT')).toBeTruthy();
    expect(workbook.getWorksheet('RULES')).toBeTruthy();

    const preview = await importPreviewService.preview({
      filePath: xlsxPath,
      projectId: project.id,
      editionId: edition.id,
      dataTypeHint: 'project_data',
    });
    expect(preview.validCount + preview.warningCount).toBeGreaterThan(0);

    const commit = importCommitService.commit({
      previewId: preview.previewId,
      mode: 'IMPORT_VALID_ONLY',
      projectId: project.id,
      editionId: edition.id,
    });
    expect(commit.updated + commit.inserted).toBeGreaterThanOrEqual(1);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('warns STORY_FACTS_ADVANCED on story facts rows', () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'Mem', source_language: 'zh-Hans', target_language: 'vi' });
    const edition = ensureDefaultEdition(db, project.id);
    const result = validateProjectDataRow(
      'STORY_FACTS',
      { category: 'plot', key: 'twist', value: 'hidden' },
      2,
      { db, projectId: project.id, editionId: edition.id },
    );
    expect(result.messages).toContain(PROJECT_DATA_WARNINGS.STORY_FACTS_ADVANCED);
    expect(result.status).toBe('warning');
  });
});
