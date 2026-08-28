import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { TABULAR_META_SHEET } from '@shared/constants/tabular';
import {
  CHARACTER_TABULAR_COLUMNS,
  CHARACTER_TRANSLATION_TABULAR_COLUMNS,
  CHARACTER_WORKBOOK_SHEETS,
  RELATIONSHIP_RENDERING_TABULAR_COLUMNS,
  RELATIONSHIP_TABULAR_COLUMNS,
} from '@shared/constants/character-tabular';
import type { TabularMeta } from '@shared/schemas/tabular';
import type { DatabaseManager } from '../db/database-manager';
import { buildMetaSheetRows, cellToString } from './tabular-file-parser';
import {
  parseLockedFacts,
  serializeDelimitedList,
} from './handlers/character-tabular-utils';

const COLUMN_WIDTHS: Record<string, number> = {
  character_id: 36,
  canonical_source_name: 28,
  role: 16,
  gender: 12,
  first_seen_chapter: 16,
  description: 40,
  source_aliases: 32,
  locked_facts: 32,
  edition_id: 36,
  target_language: 14,
  preferred_name: 24,
  target_aliases: 32,
  locked: 10,
  notes: 32,
  relationship_id: 36,
  character_a_id: 36,
  character_a_source: 24,
  character_b_id: 36,
  character_b_source: 24,
  relationship_type: 18,
  valid_from: 12,
  valid_to: 12,
  a_calls_b: 20,
  b_calls_a: 20,
};

export interface CharacterWorkbookExportData {
  characters: Record<string, string>[];
  characterTranslations: Record<string, string>[];
  relationships: Record<string, string>[];
  relationshipRendering: Record<string, string>[];
}

export function buildCharacterWorkbookExportData(
  db: DatabaseManager,
  projectId: string,
  editionId: string,
): CharacterWorkbookExportData {
  const characters = db.characters.listByProject(projectId).map((ch) => ({
    character_id: ch.id,
    canonical_source_name: ch.canonical_name,
    role: ch.role ?? '',
    gender: ch.gender ?? '',
    first_seen_chapter: ch.first_chapter != null ? String(ch.first_chapter) : '',
    description: ch.description ?? '',
    source_aliases: serializeDelimitedList(
      db.characters.listAliases(ch.id).map((a) => a.alias),
    ),
    locked_facts: parseLockedFacts(ch.metadata),
  }));

  const characterTranslations = db.characterTranslations
    .listByProjectAndEdition(projectId, editionId)
    .map((tr) => {
      let targetAliases = '';
      if (tr.aliases_json) {
        try {
          const parsed = JSON.parse(tr.aliases_json) as string[];
          targetAliases = Array.isArray(parsed) ? serializeDelimitedList(parsed) : '';
        } catch {
          targetAliases = '';
        }
      }
      return {
        character_id: tr.character_id,
        edition_id: tr.edition_id,
        target_language: tr.target_language,
        preferred_name: tr.preferred_name ?? '',
        target_aliases: targetAliases,
        locked: tr.locked === 1 ? '1' : '0',
        notes: tr.notes ?? '',
      };
    });

  const charNameById = new Map(
    db.characters.listByProject(projectId).map((c) => [c.id, c.canonical_name]),
  );

  const relationships = db.relationships.listByProject(projectId).map((rel) => ({
    relationship_id: rel.id,
    character_a_id: rel.from_character_id,
    character_a_source: charNameById.get(rel.from_character_id) ?? '',
    character_b_id: rel.to_character_id,
    character_b_source: charNameById.get(rel.to_character_id) ?? '',
    relationship_type: rel.relationship_type,
    valid_from: rel.valid_from_chapter != null ? String(rel.valid_from_chapter) : '',
    valid_to: rel.valid_to_chapter != null ? String(rel.valid_to_chapter) : '',
    description: rel.description ?? '',
  }));

  const relationshipRendering = db.relationshipTranslations
    .listByEdition(editionId)
    .map((rt) => ({
      edition_id: rt.edition_id,
      relationship_id: rt.relationship_id,
      a_calls_b: rt.a_calls_b ?? '',
      b_calls_a: rt.b_calls_a ?? '',
      notes: rt.notes ?? '',
    }));

  return {
    characters,
    characterTranslations,
    relationships,
    relationshipRendering,
  };
}

export async function writeCharacterWorkbookXlsx(input: {
  outputPath: string;
  meta: TabularMeta;
  data: CharacterWorkbookExportData;
}): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'NovelTrans Studio';
  workbook.created = new Date();

  const metaSheet = workbook.addWorksheet(TABULAR_META_SHEET);
  for (const [key, value] of buildMetaSheetRows(input.meta)) {
    metaSheet.addRow([key, value]);
  }

  const sheetDefs: Array<{ name: string; headers: readonly string[]; rows: Record<string, string>[] }> = [
    { name: 'CHARACTERS', headers: CHARACTER_TABULAR_COLUMNS, rows: input.data.characters },
    {
      name: 'CHARACTER_TRANSLATIONS',
      headers: CHARACTER_TRANSLATION_TABULAR_COLUMNS,
      rows: input.data.characterTranslations,
    },
    { name: 'RELATIONSHIPS', headers: RELATIONSHIP_TABULAR_COLUMNS, rows: input.data.relationships },
    {
      name: 'RELATIONSHIP_RENDERING',
      headers: RELATIONSHIP_RENDERING_TABULAR_COLUMNS,
      rows: input.data.relationshipRendering,
    },
  ];

  for (const def of sheetDefs) {
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
    def.headers.forEach((header, idx) => {
      const col = sheet.getColumn(idx + 1);
      col.width = COLUMN_WIDTHS[header] ?? 18;
      if (['description', 'source_aliases', 'target_aliases', 'locked_facts', 'notes'].includes(header)) {
        col.alignment = { wrapText: true, vertical: 'top' };
      }
    });
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

export function isCharacterWorkbookFile(
  sheets: Map<string, { headers: string[]; rows: Record<string, string>[] }>,
): boolean {
  for (const name of CHARACTER_WORKBOOK_SHEETS) {
    const sheet = sheets.get(name) ?? sheets.get(name.toLowerCase());
    if (sheet && sheet.rows.length > 0) return true;
  }
  const characters = sheets.get('CHARACTERS') ?? sheets.get('characters');
  if (characters?.headers.some((h) => h === 'canonical_source_name' || h === 'character_id')) {
    return true;
  }
  return false;
}
