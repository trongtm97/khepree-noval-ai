import type { CharacterWorkbookSheet } from '@shared/constants/character-tabular';
import {
  CHARACTER_LEGACY_HEADERS,
  CHARACTER_TABULAR_COLUMNS,
} from '@shared/constants/character-tabular';
import type { TabularCommitContext, TabularDataTypeHandler, TabularUndoEntry } from '../types';
import {
  isLegacyCharacterHeaders,
  isWorkbookCharacterHeaders,
  parseDelimitedList,
  pick,
} from './character-tabular-utils';
import { commitWorkbookRow, validateWorkbookRow } from './character-workbook-handler';

const LEGACY_REQUIRED = 'canonical_name';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/** Legacy flat import (v1 CSV / single sheet). */
function validateLegacyRow(
  row: Record<string, string>,
  _rowIndex: number,
  ctx: TabularCommitContext,
) {
  const messages: string[] = [];
  const canonicalName = pick(row, 'canonical_name', 'name');
  if (!canonicalName) {
    return { status: 'error' as const, messages: ['canonical_name is required'], normalized: {} };
  }
  if (!ctx.projectId) messages.push('projectId required for character import');
  if (!ctx.editionId) messages.push('editionId required for character import');

  const normalized: Record<string, string> = {
    _sheet: 'CHARACTERS',
    _legacy: '1',
    id: pick(row, 'id'),
    canonical_name: canonicalName,
    preferred_name: pick(row, 'preferred_name', 'translated_name'),
    gender: pick(row, 'gender'),
    role: pick(row, 'role'),
    description: pick(row, 'description'),
    aliases: pick(row, 'aliases'),
    status: (pick(row, 'status') || 'active').toLowerCase(),
    locked: pick(row, 'locked') === '1' || pick(row, 'locked').toLowerCase() === 'true' ? '1' : '0',
    notes: pick(row, 'notes'),
  };

  if (normalized.id && !isUuid(normalized.id)) {
    messages.push(`Invalid id UUID: ${normalized.id}`);
  }

  const status: 'error' | 'warning' | 'valid' =
    messages.some((m) => m.includes('required') || m.startsWith('Invalid'))
      ? 'error'
      : messages.length > 0
        ? 'warning'
        : 'valid';
  return { status, messages, normalized };
}

function commitLegacyRow(row: Record<string, string>, ctx: TabularCommitContext) {
  const db = ctx.db;
  const projectId = ctx.projectId!;
  const editionId = ctx.editionId!;
  const edition = db.translationEditions.getById(editionId);
  if (!edition) throw new Error(`Edition not found: ${editionId}`);

  let character = row.id ? db.characters.getById(row.id) : null;
  if (!character) {
    character = db.characters.getByName(projectId, row.canonical_name);
  }
  if (character?.locked === 1 && row.locked !== '1') {
    return { action: 'skip' as const };
  }

  if (character) {
    const priorChar: Record<string, unknown> = { ...character };
    const priorTr = db.characterTranslations.getByCharacterAndEdition(character.id, editionId);
    db.characters.update(character.id, {
      canonical_name: row.canonical_name,
      gender: row.gender || null,
      role: row.role || null,
      description: row.description || null,
      status: row.status as 'active' | 'inactive' | 'deceased',
      locked: row.locked === '1',
    });
    if (row.preferred_name || row.aliases || row.notes) {
      const aliases = parseDelimitedList(row.aliases);
      db.characterTranslations.upsert({
        character_id: character.id,
        edition_id: editionId,
        target_language: edition.target_language,
        preferred_name: row.preferred_name || null,
        aliases_json: aliases.length > 0 ? JSON.stringify(aliases) : null,
        notes: row.notes || null,
        locked: row.locked === '1',
        source: 'tabular_import',
      });
    }
    const undo: TabularUndoEntry = {
      entityType: 'character',
      entityId: character.id,
      action: 'update',
      prior: { character: priorChar, translation: priorTr },
    };
    return { action: 'update' as const, undo };
  }

  const created = db.characters.create({
    project_id: projectId,
    canonical_name: row.canonical_name,
    gender: row.gender || null,
    role: row.role || null,
    description: row.description || null,
    status: row.status as 'active' | 'inactive' | 'deceased',
    locked: row.locked === '1',
  });
  const aliases = parseDelimitedList(row.aliases);
  for (const alias of aliases) {
    db.characters.addAlias(created.id, alias);
  }
  if (row.preferred_name || aliases.length > 0 || row.notes) {
    db.characterTranslations.upsert({
      character_id: created.id,
      edition_id: editionId,
      target_language: edition.target_language,
      preferred_name: row.preferred_name || null,
      aliases_json: aliases.length > 0 ? JSON.stringify(aliases) : null,
      notes: row.notes || null,
      locked: row.locked === '1',
      source: 'tabular_import',
    });
  }
  return {
    action: 'insert' as const,
    undo: {
      entityType: 'character',
      entityId: created.id,
      action: 'insert' as const,
      prior: null,
    },
  };
}

export const charactersTabularHandler: TabularDataTypeHandler = {
  dataType: 'characters',
  sheetName: 'CHARACTERS',
  columns: CHARACTER_TABULAR_COLUMNS.map((key) => ({
    key,
    header: key,
    required: key === 'canonical_source_name',
  })),

  detectFromHeaders(headers) {
    return isWorkbookCharacterHeaders(headers) || isLegacyCharacterHeaders(headers);
  },

  validateRow(row, rowIndex, ctx) {
    if (row._legacy === '1' || pick(row, 'canonical_name')) {
      return validateLegacyRow(row, rowIndex, ctx);
    }
    const sheet = (row._sheet as CharacterWorkbookSheet | undefined) ?? 'CHARACTERS';
    return validateWorkbookRow(sheet, row, rowIndex, ctx);
  },

  naturalKey(row, ctx) {
    const name = pick(row, 'canonical_source_name', 'canonical_name', 'name');
    const id = pick(row, 'character_id', 'id');
    const sheet = row._sheet ?? 'CHARACTERS';
    return `${sheet}|${ctx.projectId ?? ''}|${id || name}`;
  },

  exportRows(ctx) {
    if (!ctx.projectId) return [];
    return ctx.db.characters.listByProject(ctx.projectId).map((ch) => ({
      character_id: ch.id,
      canonical_source_name: ch.canonical_name,
      role: ch.role ?? '',
      gender: ch.gender ?? '',
      first_seen_chapter: ch.first_chapter != null ? String(ch.first_chapter) : '',
      description: ch.description ?? '',
      source_aliases: '',
      locked_facts: '',
    }));
  },

  commitRow(row, ctx) {
    if (row._legacy === '1' || row.canonical_name) {
      return commitLegacyRow(row, ctx);
    }
    const sheet = (row._sheet as CharacterWorkbookSheet | undefined) ?? 'CHARACTERS';
    return commitWorkbookRow(sheet, row, ctx);
  },
};

export { CHARACTER_LEGACY_HEADERS, LEGACY_REQUIRED };
