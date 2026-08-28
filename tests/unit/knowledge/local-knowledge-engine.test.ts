import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveAppPaths } from '@main/services/paths-service';
import { createDatabaseManager, closeDatabase } from '@main/db/connection';
import type { DatabaseManager } from '@main/db/database-manager';
import { buildMemoryContext } from '@main/memory/context-selector';
import { applyMemoryDelta } from '@main/memory/memory-delta-processor';
import { toCharacterDto, toRelationshipDto } from '@main/services/memory-dto';
import { resolveCharacterPreferredName } from '@main/memory/edition-memory';
import { ensureDefaultEdition } from '@main/services/edition-service';
import { DEFAULT_CONTEXT_TOKEN_BUDGET } from '@shared/constants/memory';
import { estimateTokens } from '@main/memory/budget-estimator';

describe('Local Knowledge Engine — Phase 3', () => {
  let tmp: string;
  let db: DatabaseManager;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-lke-'));
    const paths = resolveAppPaths(tmp);
    closeDatabase();
    db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
  });

  afterEach(() => {
    db?.close();
    closeDatabase();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function seedChapter(projectId: string, chapterNumber: number, sourceText: string) {
    const chapter = db.chapters.create({
      project_id: projectId,
      chapter_number: chapterNumber,
      sequence_order: chapterNumber,
      display_title: `Ch ${chapterNumber}`,
      chapter_type: 'NORMAL',
    });
    db.paragraphs.create({
      chapter_id: chapter.id,
      paragraph_id: `P${chapterNumber}-001`,
      sequence: 0,
      source_text: sourceText,
    });
    return chapter;
  }

  function buildCtx(projectId: string, chapterIds: string[], editionId: string) {
    return buildMemoryContext(
      db,
      { projectId, chapterIds, editionId, tokenBudget: DEFAULT_CONTEXT_TOKEN_BUDGET },
      (id) => {
        const row = db.characters.getById(id);
        if (!row) return null;
        return toCharacterDto(
          row,
          db.characters.listAliases(row.id).map((a) => a.alias),
          resolveCharacterPreferredName(db, row, editionId),
        );
      },
      (rel) => {
        const from = db.characters.getById(rel.from_character_id);
        const to = db.characters.getById(rel.to_character_id);
        return toRelationshipDto(rel, from?.canonical_name ?? '?', to?.canonical_name ?? '?');
      },
    );
  }

  it('memory update chapter 450 → translation chapter 451 sees new knowledge immediately', () => {
    const project = db.projects.create({ title: 'LKE Novel', genre: 'xianxia' });
    const editionId = ensureDefaultEdition(db, project.id).id;
    const hero = db.characters.create({
      project_id: project.id,
      canonical_name: '王林',
      translated_name: 'Vương Lâm',
      first_chapter: 1,
    });

    seedChapter(project.id, 450, '王林在山顶悟道。');
    seedChapter(project.id, 451, '王林继续修炼。');

    applyMemoryDelta(
      db,
      project.id,
      [
        {
          action: 'upsert',
          category: 'world',
          key: 'mountain_secret',
          value: 'Hidden cave on Spirit Peak',
        },
      ],
      450,
      editionId,
    );

    db.terms.create({
      source_text: '悟道',
      source_simplified: '悟道',
      source_language: 'zh-Hans',
      target_language: 'vi',
      scope: 'PROJECT',
      scope_ref: project.id,
      status: 'PROJECT_VERIFIED',
      meaning: 'Ngộ đạo',
    });

    const ch451 = db.chapters.listByProject(project.id).find((c) => c.chapter_number === 451)!;
    const ctx = buildCtx(project.id, [ch451.id], editionId);

    expect(ctx.fingerprint).toBeDefined();
    expect(ctx.fingerprint.contextHash.length).toBeGreaterThan(10);
    expect(ctx.recentMemory.some((m) => m.key === 'mountain_secret')).toBe(true);
    expect(ctx.activeCharacters.some((c) => c.id === hero.id)).toBe(true);
    expect(ctx.budget.estimated).toBeLessThanOrEqual(DEFAULT_CONTEXT_TOKEN_BUDGET * 2);
  });

  it('long novel simulation — pack size bounded, not linear with database size', () => {
    const project = db.projects.create({ title: 'Long Novel', genre: 'xianxia' });
    const editionId = ensureDefaultEdition(db, project.id).id;

    // Simulate large corpus (subset for test speed).
    for (let i = 1; i <= 200; i++) {
      db.characters.create({
        project_id: project.id,
        canonical_name: `角色${i}`,
        translated_name: `Nhan vat ${i}`,
        first_chapter: i,
      });
    }
    for (let i = 1; i <= 500; i++) {
      db.terms.create({
        source_text: `术语${i}`,
        source_simplified: `术语${i}`,
        source_language: 'zh-Hans',
        target_language: 'vi',
        scope: 'PROJECT',
        scope_ref: project.id,
        status: 'PROJECT_VERIFIED',
        meaning: `Term ${i}`,
      });
    }
    for (let i = 1; i <= 1000; i++) {
      db.memoryEvents.upsert({
        project_id: project.id,
        category: 'world',
        event_key: `fact_${i}`,
        event_value: `Value ${i}`,
        chapter_number: i,
      });
    }

    const ch2500 = seedChapter(
      project.id,
      2500,
      '角色150出现了，带着术语150和术语151。',
    );

    const ctxSmall = buildCtx(project.id, [ch2500.id], editionId);
    const tokensSmall = estimateTokens(JSON.stringify(ctxSmall));

    // Add more irrelevant data — context should not grow linearly.
    for (let i = 201; i <= 400; i++) {
      db.characters.create({
        project_id: project.id,
        canonical_name: `远角色${i}`,
        translated_name: `Far ${i}`,
        first_chapter: 3000,
      });
    }

    const ctxAfter = buildCtx(project.id, [ch2500.id], editionId);
    const tokensAfter = estimateTokens(JSON.stringify(ctxAfter));

    expect(ctxSmall.fingerprint).toBeDefined();
    expect(tokensSmall).toBeLessThan(DEFAULT_CONTEXT_TOKEN_BUDGET * 3);
    expect(tokensAfter).toBeLessThan(DEFAULT_CONTEXT_TOKEN_BUDGET * 3);
    expect(Math.abs(tokensAfter - tokensSmall)).toBeLessThan(500);
    expect(ctxSmall.activeCharacters.length).toBeLessThan(20);
    expect(ctxSmall.activeTerms.length).toBeLessThan(30);
  });
});
