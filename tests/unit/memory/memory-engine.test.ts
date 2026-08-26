import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveAppPaths } from '@main/services/paths-service';
import { createDatabaseManager, closeDatabase } from '@main/db/connection';
import type { DatabaseManager } from '@main/db/database-manager';
import { applyMemoryDelta } from '@main/memory/memory-delta-processor';
import { filterRelevantEntities } from '@main/memory/relevant-memory';
import { estimateTokens, trimToTokenBudget } from '@main/memory/budget-estimator';

describe('memory engine', () => {
  let tempRoot: string;
  let dataDir: string;
  let backupsDir: string;
  let db: DatabaseManager | null = null;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'noveltrans-memory-'));
    const paths = resolveAppPaths(tempRoot);
    dataDir = paths.data;
    backupsDir = paths.backups;
    closeDatabase();
    db = null;
  });

  afterEach(() => {
    db?.close();
    db = null;
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function seedProject() {
    db = createDatabaseManager({ dataDir, backupsDir });
    const project = db.projects.create({ title: 'Memory Test', genre: 'xianxia' });
    const a = db.characters.create({
      project_id: project.id,
      canonical_name: '李逍遥',
      translated_name: 'Lý Tiêu Dao',
    });
    const b = db.characters.create({
      project_id: project.id,
      canonical_name: '赵灵儿',
      translated_name: 'Triệu Linh Nhi',
    });
    db.characters.addAlias(a.id, '逍遥');
    return { project, a, b };
  }

  it('filters relationships by chapter timeline', () => {
    const { project, a, b } = seedProject();
    if (!db) throw new Error('db missing');

    db.relationships.create({
      project_id: project.id,
      from_character_id: a.id,
      to_character_id: b.id,
      relationship_type: 'friend',
      valid_from_chapter: 1,
      valid_to_chapter: 5,
    });
    db.relationships.create({
      project_id: project.id,
      from_character_id: a.id,
      to_character_id: b.id,
      relationship_type: 'lover',
      valid_from_chapter: 6,
      valid_to_chapter: null,
    });

    const early = db.relationships.listActiveAtChapter(project.id, 3);
    const late = db.relationships.listActiveAtChapter(project.id, 8);

    expect(early).toHaveLength(1);
    expect(early[0]?.relationship_type).toBe('friend');
    expect(late).toHaveLength(1);
    expect(late[0]?.relationship_type).toBe('lover');
  });

  it('does not overwrite locked memory events', () => {
    const { project } = seedProject();
    if (!db) throw new Error('db missing');

    db.memoryEvents.upsert({
      project_id: project.id,
      category: 'plot',
      event_key: 'secret',
      event_value: 'locked truth',
      locked: true,
    });

    const result = applyMemoryDelta(db, project.id, [
      {
        action: 'upsert',
        category: 'plot',
        key: 'secret',
        value: 'new truth',
      },
    ]);

    expect(result.applied).toBe(0);
    expect(result.conflicts).toHaveLength(1);
    expect(db.memoryEvents.getByKey(project.id, 'plot', 'secret')?.event_value).toBe(
      'locked truth',
    );
  });

  it('creates conflict on contradictory unlocked delta', () => {
    const { project } = seedProject();
    if (!db) throw new Error('db missing');

    db.memoryEvents.upsert({
      project_id: project.id,
      category: 'world',
      event_key: 'sect',
      event_value: '青云门',
    });

    const result = applyMemoryDelta(db, project.id, [
      {
        action: 'upsert',
        category: 'world',
        key: 'sect',
        value: '天音寺',
      },
    ]);

    expect(result.applied).toBe(0);
    expect(result.conflicts).toHaveLength(1);
    expect(db.memoryEvents.getByKey(project.id, 'world', 'sect')?.event_value).toBe('青云门');
  });

  it('keeps only entities present in current batch text', () => {
    const { project, a, b } = seedProject();
    if (!db) throw new Error('db missing');

    const rel = db.relationships.create({
      project_id: project.id,
      from_character_id: a.id,
      to_character_id: b.id,
      relationship_type: 'friend',
    });
    const eventA = db.memoryEvents.upsert({
      project_id: project.id,
      category: 'character',
      event_key: '李逍遥',
      event_value: 'hero',
      chapter_number: 1,
    });
    const eventB = db.memoryEvents.upsert({
      project_id: project.id,
      category: 'character',
      event_key: '赵灵儿',
      event_value: 'heroine',
      chapter_number: 1,
    });

    const filtered = filterRelevantEntities({
      batchText: '李逍遥走进房间。',
      characters: db.characters.listByProject(project.id),
      aliasesByCharacter: new Map([
        [a.id, ['逍遥']],
        [b.id, []],
      ]),
      relationships: [rel],
      memoryEvents: [eventA, eventB],
    });

    expect(filtered.activeCharacters).toHaveLength(1);
    expect(filtered.activeCharacters[0]?.id).toBe(a.id);
    expect(filtered.activeRelationships).toHaveLength(0);
    expect(filtered.activeMemoryEvents.some((event) => event.event_key === '赵灵儿')).toBe(
      false,
    );
  });

  it('estimates tokens offline and trims to budget', () => {
    const chinese = '中文测试';
    expect(estimateTokens(chinese)).toBeGreaterThan(0);

    const trimmed = trimToTokenBudget(
      ['a'.repeat(100), 'b'.repeat(100), 'c'.repeat(100)],
      (item) => item,
      30,
    );
    expect(trimmed.items.length).toBeLessThan(3);
    expect(trimmed.dropped).toBeGreaterThan(0);
  });
});
