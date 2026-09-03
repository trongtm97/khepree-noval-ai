import ExcelJS from 'exceljs';
import { APP_NAME } from '@shared/constants/app';
import fs from 'node:fs';
import path from 'node:path';
import { TABULAR_META_SHEET } from '@shared/constants/tabular';
import {
  PROJECT_DATA_TABULAR_COLUMNS,
  PROJECT_DATA_WORKBOOK_SHEETS,
  RULES_TABULAR_COLUMNS,
  STORY_FACTS_TABULAR_COLUMNS,
  WORLD_KNOWLEDGE_TABULAR_COLUMNS,
} from '@shared/constants/project-data-tabular';
import type { TabularMeta } from '@shared/schemas/tabular';
import type { DatabaseManager } from '../db/database-manager';
import { buildMetaSheetRows, cellToString } from './tabular-file-parser';
import { loadWorkbookRules, loadWorldFacts } from './handlers/project-data-tabular-utils';

export interface ProjectDataWorkbookExportData {
  project: Record<string, string>[];
  rules: Record<string, string>[];
  worldKnowledge: Record<string, string>[];
  storyFacts: Record<string, string>[];
}

export function buildProjectDataWorkbookExportData(
  db: DatabaseManager,
  projectId: string,
  editionId?: string,
): ProjectDataWorkbookExportData {
  const project = db.projects.getById(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const edition = editionId ? db.translationEditions.getById(editionId) : null;

  const projectRow = {
    project_id: project.id,
    source_title: project.source_title ?? project.title_cn ?? '',
    edition_title: edition?.name ?? project.target_title ?? project.title_vi ?? '',
    source_language: project.source_language,
    target_language: edition?.target_language ?? project.target_language,
    author: project.author_name ?? '',
    genre: project.genre ?? '',
    status: project.status,
    description: project.description ?? '',
    official_summary: project.official_summary ?? '',
  };

  const rules = loadWorkbookRules(db, projectId).map((r) => ({
    rule_id: r.rule_id,
    priority: String(r.priority),
    category: r.category,
    rule_text: r.rule_text,
    enabled: r.enabled ? '1' : '0',
    locked: r.locked ? '1' : '0',
  }));

  const worldKnowledge = loadWorldFacts(db, projectId).map((f) => ({
    fact_id: f.fact_id,
    category: f.category,
    source_key: f.source_key,
    target_label: f.target_label,
    description: f.description,
    first_seen_chapter: f.first_seen_chapter != null ? String(f.first_seen_chapter) : '',
    valid_from_chapter: f.valid_from_chapter != null ? String(f.valid_from_chapter) : '',
    confidence: f.confidence != null ? String(f.confidence) : '',
    locked: f.locked ? '1' : '0',
  }));

  const storyFacts = db.memoryEvents.listByProject(projectId).map((ev) => {
    let value = ev.event_value ?? '';
    let validFrom = '';
    let validTo = '';
    try {
      const parsed = JSON.parse(ev.event_value ?? '{}') as {
        value?: string;
        valid_from?: number;
        valid_to?: number;
      };
      if (typeof parsed.value === 'string') value = parsed.value;
      if (parsed.valid_from != null) validFrom = String(parsed.valid_from);
      if (parsed.valid_to != null) validTo = String(parsed.valid_to);
    } catch {
      /* plain string value */
    }
    return {
      memory_id: ev.id,
      category: ev.category,
      key: ev.event_key,
      value,
      chapter: ev.chapter_number != null ? String(ev.chapter_number) : '',
      valid_from: validFrom,
      valid_to: validTo,
    };
  });

  return {
    project: [projectRow],
    rules,
    worldKnowledge,
    storyFacts,
  };
}

export async function writeProjectDataWorkbookXlsx(input: {
  outputPath: string;
  meta: TabularMeta;
  data: ProjectDataWorkbookExportData;
}): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_NAME;
  workbook.created = new Date();

  const metaSheet = workbook.addWorksheet(TABULAR_META_SHEET);
  for (const [key, value] of buildMetaSheetRows(input.meta)) {
    metaSheet.addRow([key, value]);
  }

  const defs = [
    { name: 'PROJECT', headers: PROJECT_DATA_TABULAR_COLUMNS, rows: input.data.project },
    { name: 'RULES', headers: RULES_TABULAR_COLUMNS, rows: input.data.rules },
    {
      name: 'WORLD_KNOWLEDGE',
      headers: WORLD_KNOWLEDGE_TABULAR_COLUMNS,
      rows: input.data.worldKnowledge,
    },
    { name: 'STORY_FACTS', headers: STORY_FACTS_TABULAR_COLUMNS, rows: input.data.storyFacts },
  ];

  for (const def of defs) {
    const sheet = workbook.addWorksheet(def.name);
    sheet.addRow([...def.headers]);
    for (const row of def.rows) {
      sheet.addRow(def.headers.map((h) => row[h] ?? ''));
    }
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, def.rows.length + 1), column: def.headers.length },
    };
    sheet.getRow(1).font = { bold: true };
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.eachCell((cell) => {
        cell.value = cellToString(cell);
      });
    });
  }

  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true });
  await workbook.xlsx.writeFile(input.outputPath);
}

export function isProjectDataWorkbookFile(
  sheets: Map<string, { headers: string[]; rows: Record<string, string>[] }>,
): boolean {
  for (const name of PROJECT_DATA_WORKBOOK_SHEETS) {
    const sheet = sheets.get(name);
    if (sheet && (sheet.rows.length > 0 || name === 'PROJECT')) return true;
  }
  return false;
}
