import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveAppPaths } from '@main/services/paths-service';
import { initializeDatabase, closeDatabase } from '@main/db/connection';
import type { DatabaseManager } from '@main/db/database-manager';
import { runLearningPipeline } from '@main/learning/learning-pipeline';
import { TranslationPackService } from '@main/services/translation-pack-service';
import { getProjectKnowledgeVersion } from '@main/knowledge/knowledge-version';
import type { ParsedBatchResult } from '@shared/schemas/output-protocol';

function emptyParsed(overrides?: Partial<ParsedBatchResult>): ParsedBatchResult {
  return {
    status: 'ok',
    translations: [],
    termDeltas: [],
    memoryDeltas: [],
    warnings: [],
    recoveryUsed: false,
    protocolVersion: 1,
    ...overrides,
  };
}

function termSectionContains(pack: { sections: { activeProjectTerms: string } }, text: string): boolean {
  return pack.sections.activeProjectTerms.includes(text);
}

describe('inter-chapter local learning loop (Phase 7)', () => {
  let tempRoot: string;
  let db: DatabaseManager;
  let projectId: string;
  let ch100Id: string;
  let ch101Id: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-learn-loop-'));
    const paths = resolveAppPaths(tempRoot);
    closeDatabase();
    db = initializeDatabase({ dataDir: paths.data, backupsDir: paths.backups });
    projectId = db.projects.create({
      title: 'Learning Loop Novel',
      source_language: 'zh',
      target_language: 'vi',
    }).id;

    const ch100 = db.chapters.create({
      project_id: projectId,
      chapter_number: 100,
      sequence_order: 100,
      source_text: '他找到了玄铁剑。',
    });
    ch100Id = ch100.id;
    db.paragraphs.create({
      chapter_id: ch100Id,
      paragraph_id: '[C000100:P000001]',
      sequence: 1,
      source_text: '他找到了玄铁剑。',
    });

    const ch101 = db.chapters.create({
      project_id: projectId,
      chapter_number: 101,
      sequence_order: 101,
      source_text: '玄铁剑在手中发光。',
    });
    ch101Id = ch101.id;
    db.paragraphs.create({
      chapter_id: ch101Id,
      paragraph_id: '[C000101:P000001]',
      sequence: 1,
      source_text: '玄铁剑在手中发光。',
    });
  });

  afterEach(() => {
    db.close();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('chapter 100 learns X→Y; chapter 101 pack contains Y; survives restart', async () => {
    const versionBefore = getProjectKnowledgeVersion(db, projectId);

    const job100 = db.jobs.create({
      project_id: projectId,
      type: 'translate_batch',
      state: 'RUNNING',
      chapter_from: 100,
      chapter_to: 100,
    });
    db.jobs.setKnowledgeVersionAtStart(job100.id, versionBefore);

    const learning = await runLearningPipeline(db, {
      projectId,
      jobId: job100.id,
      parsed: emptyParsed({
        termDeltas: [
          { action: 'discover', source: '玄铁剑', target: 'OldName', category: 'item' },
          { action: 'confirm', source: '玄铁剑', target: 'Huyền Thiết Kiếm' },
        ],
      }),
      chapterFrom: 100,
      chapterTo: 100,
    });

    db.jobs.setKnowledgeVersionAtCommit(job100.id, learning.knowledgeVersionAtCommit);

    expect(learning.knowledgeVersionAtCommit).toBeGreaterThan(versionBefore);
    expect(db.jobs.getById(job100.id)?.knowledge_version_at_commit).toBe(
      learning.knowledgeVersionAtCommit,
    );

    const term = db.terms.findBySource('玄铁剑', projectId);
    expect(term?.status).toBe('PROJECT_VERIFIED');

    const packService = new TranslationPackService();
    const pack101 = packService.build({
      projectId,
      chapterIds: [ch101Id],
    });

    expect(termSectionContains(pack101, '玄铁剑')).toBe(true);
    expect(termSectionContains(pack101, 'Huyền Thiết Kiếm')).toBe(true);

    const job101 = db.jobs.create({
      project_id: projectId,
      type: 'translate_batch',
      state: 'QUEUED',
      chapter_from: 101,
      chapter_to: 101,
    });
    db.jobs.setKnowledgeVersionAtStart(job101.id, learning.knowledgeVersionAtCommit);
    expect(db.jobs.getById(job101.id)?.knowledge_version_at_start).toBe(
      learning.knowledgeVersionAtCommit,
    );

    db.close();
    closeDatabase();

    const paths = resolveAppPaths(tempRoot);
    const db2 = initializeDatabase({ dataDir: paths.data, backupsDir: paths.backups });
    const packAfterRestart = new TranslationPackService().build({
      projectId,
      chapterIds: [ch101Id],
    });
    expect(termSectionContains(packAfterRestart, 'Huyền Thiết Kiếm')).toBe(true);
    db2.close();
    closeDatabase();
  });
});
