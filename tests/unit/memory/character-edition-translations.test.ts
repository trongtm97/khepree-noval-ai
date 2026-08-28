import { afterAll, describe, expect, it } from 'vitest';
import { createDatabaseManager } from '@main/db/database-manager';
import { ensureDefaultEdition, createEdition } from '@main/services/edition-service';
import {
  resolveCharacterPreferredName,
  upsertCharacterPreferredName,
} from '@main/memory/edition-memory';
import { applyMemoryDelta } from '@main/memory/memory-delta-processor';
import { toCharacterDto } from '@main/services/memory-dto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('character_translations edition isolation', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-char-tr-'));
  const backupsDir = path.join(dataDir, 'backups');
  const db = createDatabaseManager({ dataDir, backupsDir });

  const project = db.projects.create({
    title: 'Wang Lin Novel',
    source_language: 'zh-Hans',
    target_language: 'vi',
  });
  const viEdition = ensureDefaultEdition(db, project.id);
  const { edition: enEdition } = createEdition(db, {
    projectId: project.id,
    targetLanguage: 'en',
    name: 'English Edition',
    activate: false,
  });
  const { edition: esEdition } = createEdition(db, {
    projectId: project.id,
    targetLanguage: 'es',
    name: 'Spanish Edition',
    activate: false,
  });

  const character = db.characters.create({
    project_id: project.id,
    canonical_name: '王林',
    status: 'active',
    first_chapter: 1,
  });

  upsertCharacterPreferredName(db, {
    characterId: character.id,
    editionId: viEdition.id,
    targetLanguage: 'vi',
    preferredName: 'Vương Lâm',
    source: 'test',
  });
  upsertCharacterPreferredName(db, {
    characterId: character.id,
    editionId: enEdition.id,
    targetLanguage: 'en',
    preferredName: 'Wang Lin',
    source: 'test',
  });
  upsertCharacterPreferredName(db, {
    characterId: character.id,
    editionId: esEdition.id,
    targetLanguage: 'es',
    preferredName: 'Wang Lin',
    source: 'test',
  });

  afterAll(() => {
    db.close();
  });

  it('resolves preferred names per edition without cross-leak', () => {
    expect(resolveCharacterPreferredName(db, character, viEdition.id)).toBe('Vương Lâm');
    expect(resolveCharacterPreferredName(db, character, enEdition.id)).toBe('Wang Lin');
    expect(resolveCharacterPreferredName(db, character, esEdition.id)).toBe('Wang Lin');
  });

  it('listCharacters DTO is edition-scoped via toCharacterDto overlay', () => {
    const viDto = toCharacterDto(
      character,
      [],
      resolveCharacterPreferredName(db, character, viEdition.id),
    );
    const enDto = toCharacterDto(
      character,
      [],
      resolveCharacterPreferredName(db, character, enEdition.id),
    );
    expect(viDto.translatedName).toBe('Vương Lâm');
    expect(enDto.translatedName).toBe('Wang Lin');
    expect(enDto.translatedName).not.toBe('Vương Lâm');
  });

  it('locking VI translation does not block EN update', () => {
    db.characterTranslations.upsert({
      character_id: character.id,
      edition_id: viEdition.id,
      target_language: 'vi',
      preferred_name: 'Vương Lâm',
      locked: true,
      source: 'manual',
    });

    upsertCharacterPreferredName(db, {
      characterId: character.id,
      editionId: enEdition.id,
      targetLanguage: 'en',
      preferredName: 'Wang Lin (alt)',
      source: 'manual',
    });

    expect(resolveCharacterPreferredName(db, character, enEdition.id)).toBe('Wang Lin (alt)');
    expect(resolveCharacterPreferredName(db, character, viEdition.id)).toBe('Vương Lâm');
  });

  it('MEMORY_DELTA translatedName writes to active edition only', () => {
    const other = db.characters.create({
      project_id: project.id,
      canonical_name: '李慕婉',
      status: 'active',
    });

    applyMemoryDelta(
      db,
      project.id,
      [
        {
          action: 'upsert',
          category: 'character',
          key: '李慕婉',
          value: { translatedName: 'Li Muwan' },
        },
      ],
      1,
      enEdition.id,
    );

    expect(resolveCharacterPreferredName(db, other, enEdition.id)).toBe('Li Muwan');
    expect(resolveCharacterPreferredName(db, other, viEdition.id)).toBeNull();
  });
});
