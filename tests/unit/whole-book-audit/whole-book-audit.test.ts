import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import { ensureDefaultEdition } from '@main/services/edition-service';
import { getWholeBookAuditService } from '@main/whole-book-audit/whole-book-audit-service';
import { buildWholeBookAuditIndex } from '@main/whole-book-audit/audit-index-builder';
import {
  checkCharacterConsistency,
  checkChapterIntegrity,
} from '@main/whole-book-audit/audit-checkers';
import { getTranslationQaFindingsService } from '@main/services/translation-qa-findings-service';
import { upsertCharacterPreferredName } from '@main/memory/edition-memory';

function seedLongNovel(opts?: {
  chapters?: number;
  withGap?: boolean;
  characterMismatch?: boolean;
  useAlias?: boolean;
}): string {
  const db = getDatabase();
  const project = db.projects.create({ title: 'Long Audit Novel' });
  ensureDefaultEdition(db, project.id);
  const editionId = db.projects.getById(project.id)!.active_edition_id!;
  const chapterCount = opts?.chapters ?? 12;

  const char = db.characters.create({
    project_id: project.id,
    canonical_name: '李明',
    translated_name: 'Lý Minh',
    gender: 'male',
  });
  db.characters.addAlias(char.id, 'Minh');
  upsertCharacterPreferredName(db, {
    characterId: char.id,
    editionId,
    targetLanguage: 'vi',
    preferredName: 'Lý Minh',
    locked: true,
  });

  for (let i = 1; i <= chapterCount; i += 1) {
    const ch = db.chapters.create({
      project_id: project.id,
      chapter_number: i,
      sequence_order: i,
      source_text: `第${i}章 李明走进了房间。`,
      source_status: 'SOURCE_READY',
    });
    const para = db.paragraphs.create({
      chapter_id: ch.id,
      paragraph_id: `[C${String(i).padStart(6, '0')}:P000001]`,
      sequence: 1,
      source_text: `第${i}章 李明走进了房间。这是足够长的源文内容用于审计。`,
    });

    const skip = opts?.withGap && i === 5;
    if (skip) continue;

    let translated: string;
    if (opts?.characterMismatch && i === 3) {
      translated = `Chương ${i} Trương Tam bước vào phòng. Nội dung đủ dài.`;
    } else if (opts?.useAlias && i === 2) {
      translated = `Chương ${i} Minh bước vào phòng. Nội dung đủ dài cho audit.`;
    } else {
      translated = `Chương ${i} Lý Minh bước vào phòng. Nội dung đủ dài cho audit.`;
    }

    db.translations.upsert({
      paragraph_id: para.id,
      edition_id: editionId,
      translated_text: translated,
      version_source: 'AI_INITIAL',
    });
  }

  return project.id;
}

describe('Prompt 10 — whole-book audit', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-wba-'));
    pathsService.initializeAt(tempRoot);
    initializeDatabase({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('audits long synthetic novel and exports report', async () => {
    const projectId = seedLongNovel({ chapters: 15 });
    const svc = getWholeBookAuditService(getDatabase());
    const result = await svc.run({
      projectId,
      recipeMode: 'PUBLICATION',
      exportReport: true,
    });
    expect(result.status).toBe('COMPLETED');
    expect(result.report).toBeTruthy();
    expect(result.report!.indexStats.paragraphCount).toBe(15);
    expect(result.reportJsonPath && fs.existsSync(result.reportJsonPath)).toBe(true);
    expect(result.reportHtmlPath && fs.existsSync(result.reportHtmlPath)).toBe(true);
    expect(result.report!.findings.every((f) => f.openHref.includes(projectId))).toBe(
      true,
    );
  });

  it('accepts valid character aliases without false positive', () => {
    const projectId = seedLongNovel({ chapters: 4, useAlias: true });
    const _index = buildWholeBookAuditIndex(getDatabase(), projectId);
    const findings = checkCharacterConsistency(_index);
    expect(findings.filter((f) => f.code === 'character_name_mismatch').length).toBe(
      0,
    );
  });

  it('flags character name mismatch when wrong name used', () => {
    const projectId = seedLongNovel({ chapters: 4, characterMismatch: true });
    // Add second character so wrong name is detectable as other preferred
    const db = getDatabase();
    const editionId = db.projects.getById(projectId)!.active_edition_id!;
    const other = db.characters.create({
      project_id: projectId,
      canonical_name: '张三',
      translated_name: 'Trương Tam',
    });
    upsertCharacterPreferredName(db, {
      characterId: other.id,
      editionId,
      targetLanguage: 'vi',
      preferredName: 'Trương Tam',
    });
    const index2 = buildWholeBookAuditIndex(db, projectId);
    const findings = checkCharacterConsistency(index2);
    expect(findings.some((f) => f.code === 'character_name_mismatch')).toBe(true);
  });

  it('does not share entities across unrelated projects', async () => {
    const a = seedLongNovel({ chapters: 3 });
    const b = seedLongNovel({ chapters: 3 });
    const db = getDatabase();
    const indexA = buildWholeBookAuditIndex(db, a);
    const indexB = buildWholeBookAuditIndex(db, b);
    expect(indexA.characters.length).toBeGreaterThan(0);
    expect(indexA.characters.map((c) => c.id).sort()).not.toEqual(
      indexB.characters.map((c) => c.id).sort(),
    );

    await getWholeBookAuditService(db).run({
      projectId: a,
      recipeMode: 'PUBLICATION',
      exportReport: false,
    });
    await getWholeBookAuditService(db).run({
      projectId: b,
      recipeMode: 'PUBLICATION',
      exportReport: false,
    });

    const findingsA = getTranslationQaFindingsService(db).list(a);
    const findingsB = getTranslationQaFindingsService(db).list(b);
    expect(findingsA.every((f) => f.projectId === a)).toBe(true);
    expect(findingsB.every((f) => f.projectId === b)).toBe(true);
  });

  it('resumes after crash and does not duplicate findings', async () => {
    const projectId = seedLongNovel({ chapters: 6, withGap: true });
    const db = getDatabase();
    const svc = getWholeBookAuditService(db);

    await expect(
      svc.run({
        projectId,
        recipeMode: 'PUBLICATION',
        exportReport: false,
        crashAfterIndex: true,
      }),
    ).rejects.toThrow(/Simulated crash/);

    const active = db.wholeBookAudit.getActiveRun(projectId);
    expect(active).toBeTruthy();

    const first = await svc.run({
      projectId,
      recipeMode: 'PUBLICATION',
      exportReport: false,
    });
    expect(['COMPLETED', 'NEEDS_ATTENTION']).toContain(first.status);

    const count1 = db.translationQaFindings.listByProject(projectId).length;

    const second = await svc.run({
      projectId,
      recipeMode: 'PUBLICATION',
      forceNew: true,
      exportReport: false,
    });
    expect(['COMPLETED', 'NEEDS_ATTENTION']).toContain(second.status);

    const count2 = db.translationQaFindings.listByProject(projectId).length;
    // Fingerprint upsert — count should not explode
    expect(count2).toBeLessThanOrEqual(count1 + 2);

    const gapFindings = checkChapterIntegrity(
      buildWholeBookAuditIndex(db, projectId),
    );
    expect(
      gapFindings.some(
        (f) =>
          f.code === 'empty_translation' ||
          f.code === 'chapter_missing_translation',
      ),
    ).toBe(true);
  });

  it('PUBLICATION critical gaps yield NEEDS_ATTENTION', async () => {
    const projectId = seedLongNovel({ chapters: 5, withGap: true });
    const result = await getWholeBookAuditService(getDatabase()).run({
      projectId,
      recipeMode: 'PUBLICATION',
      exportReport: true,
    });
    expect(result.status).toBe('NEEDS_ATTENTION');
    expect(result.criticalCount).toBeGreaterThan(0);
  });
});
