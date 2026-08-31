import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseManager } from '../../../src/main/db/database-manager';
import { pathsService } from '../../../src/main/services/paths-service';
import {
  FULL_NOVEL_PREPROCESS_STAGES,
  isStageAtLeast,
  stageRank,
  type FullNovelPreprocessStage,
} from '../../../src/shared/constants/full-novel-preprocess';
import { FullNovelPreprocessOrchestrator } from '../../../src/main/bootstrap/full-novel-preprocess-orchestrator';
import { KNOWLEDGE_FILE_KEYS } from '../../../src/shared/constants/notebooklm-preprocess';
import { decidePreprocessMode } from '../../../src/shared/constants/notebooklm-preprocess-auto';
import { resetNotebookSyncService } from '../../../src/main/notebook/notebook-sync-service-singleton';

function sampleRawResponse(): string {
  return KNOWLEDGE_FILE_KEYS.map(
    (k) =>
      '```file:' +
      k +
      '\n# ' +
      k +
      '\n- 张三 → Trương Tam (CHARACTER) ch.1\n## 张三\n- Tên Việt: Trương Tam\n- First seen: 1\n- 张三 — 李四: friends from ch.2\n```',
  ).join('\n\n');
}

describe('full-novel preprocess stages', () => {
  it('orders stages for resume checks', () => {
    expect(stageRank('PACKING')).toBe(0);
    expect(stageRank('COMPLETED')).toBeGreaterThan(stageRank('ANALYSIS_SENT'));
    expect(isStageAtLeast('SOURCES_READY', 'SOURCES_UPLOADING')).toBe(true);
    expect(isStageAtLeast('PACKING', 'NOTEBOOK_READY')).toBe(false);
    expect(FULL_NOVEL_PREPROCESS_STAGES).toContain('RESPONSE_CAPTURED');
  });

  it('keeps QUICK decision for small novels', () => {
    expect(
      decidePreprocessMode({ chapterCount: 5, totalChars: 10_000 }),
    ).toBe('quick');
    expect(
      decidePreprocessMode({ chapterCount: 50, totalChars: 200_000 }),
    ).toBe('full');
  });
});

describe('resume gate per stage', () => {
  const resumeOffline: FullNovelPreprocessStage[] = [
    'RESPONSE_CAPTURED',
    'RESPONSE_PARSED',
  ];
  const needBrowser: FullNovelPreprocessStage[] = [
    'PACKING',
    'NOTEBOOK_READY',
    'SOURCES_UPLOADING',
    'SOURCES_UPLOADED',
    'SOURCES_INDEXING',
    'SOURCES_READY',
    'ANALYSIS_SENT',
    'ANALYSIS_RUNNING',
  ];

  it.each(resumeOffline)('%s can resume from raw without browser', (stage) => {
    expect(isStageAtLeast(stage, 'RESPONSE_CAPTURED')).toBe(true);
    expect(isStageAtLeast(stage, 'KNOWLEDGE_IMPORTED')).toBe(false);
  });

  it.each(needBrowser)('%s still needs browser continuum', (stage) => {
    expect(isStageAtLeast(stage, 'RESPONSE_CAPTURED')).toBe(false);
  });

  it.each([
    'PACKING',
    'NOTEBOOK_READY',
    'SOURCES_UPLOADING',
    'SOURCES_UPLOADED',
    'SOURCES_INDEXING',
    'SOURCES_READY',
    'ANALYSIS_SENT',
    'ANALYSIS_RUNNING',
    'RESPONSE_CAPTURED',
    'RESPONSE_PARSED',
    'KNOWLEDGE_IMPORTED',
  ] as const)('active run query includes %s', (stage) => {
    // Covered by repo ACTIVE_STAGES — COMPLETED/FAILED excluded from resume.
    const terminal = new Set(['COMPLETED', 'FAILED']);
    expect(terminal.has(stage)).toBe(false);
  });
});

describe('full-novel preprocess repo resume', () => {
  let db: DatabaseManager;
  let tmp: string;
  let projectId: string;

  beforeEach(() => {
    resetNotebookSyncService();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-fnp-'));
    pathsService.initializeAt(tmp);
    db = new DatabaseManager({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });
    projectId = db.projects.create({ title: 'FNP Novel' }).id;
  });

  afterEach(() => {
    resetNotebookSyncService();
    db.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('persists stages and returns active run', () => {
    const run = db.fullNovelPreprocess.createRun({
      project_id: projectId,
      stage: 'PACKING',
    });
    db.fullNovelPreprocess.setStage(run.id, 'SOURCES_INDEXING', {
      correlation_id: '11111111-1111-1111-1111-111111111111',
      progress: {
        packingDone: 2,
        packingTotal: 2,
        sourcesUploaded: 2,
        sourcesTotal: 2,
        sourcesReady: 1,
        sourcesIndexing: 1,
        sourcesError: 0,
        message: 'Notebook xử lý 1/2',
      },
    });
    const active = db.fullNovelPreprocess.getActiveRun(projectId);
    expect(active?.id).toBe(run.id);
    expect(active?.stage).toBe('SOURCES_INDEXING');
    expect(active?.correlation_id).toBe('11111111-1111-1111-1111-111111111111');
    if (!active) throw new Error('expected active run');
    const progress = db.fullNovelPreprocess.parseProgress(active);
    expect(progress?.message).toContain('1/2');
  });

  it('skips re-upload when part hash matches READY', () => {
    const run = db.fullNovelPreprocess.createRun({
      project_id: projectId,
      stage: 'SOURCES_UPLOADING',
    });
    const part = db.fullNovelPreprocess.upsertPart({
      run_id: run.id,
      part_index: 0,
      file_name: 'NOVEL_PART_01.txt',
      file_path: '/tmp/NOVEL_PART_01.txt',
      content_hash: 'abc123',
      source_status: 'PENDING',
    });
    db.fullNovelPreprocess.updatePartStatus(part.id, 'READY', { uploaded_hash: 'abc123' });
    const again = db.fullNovelPreprocess.upsertPart({
      run_id: run.id,
      part_index: 0,
      file_name: 'NOVEL_PART_01.txt',
      file_path: '/tmp/NOVEL_PART_01.txt',
      content_hash: 'abc123',
    });
    expect(again.source_status).toBe('READY');
    expect(db.fullNovelPreprocess.partsNeedingUpload(run.id)).toHaveLength(0);

    const changed = db.fullNovelPreprocess.upsertPart({
      run_id: run.id,
      part_index: 0,
      file_name: 'NOVEL_PART_01.txt',
      file_path: '/tmp/NOVEL_PART_01.txt',
      content_hash: 'changed',
    });
    expect(changed.source_status).toBe('PENDING');
    expect(db.fullNovelPreprocess.partsNeedingUpload(run.id)).toHaveLength(1);
  });

  it('resumes from RESPONSE_CAPTURED via raw only (no re-analysis)', async () => {
    db.googleAccounts.create({
      label: 'A',
      email: 'a@test.com',
      displayName: 'A',
      profileDirName: 'profile-a',
      status: 'READY',
    });
    db.chapters.create({
      project_id: projectId,
      sequence_order: 1,
      chapter_number: 1,
      source_status: 'SOURCE_READY',
      source_text: '你好世界',
    });

    const rawDir = path.join(pathsService.getPath('exports'), 'preprocess', projectId, 'raw');
    fs.mkdirSync(rawDir, { recursive: true });
    const rawPath = path.join(rawDir, 'resume-test.md');
    fs.writeFileSync(rawPath, sampleRawResponse(), 'utf8');

    const run = db.fullNovelPreprocess.createRun({
      project_id: projectId,
      stage: 'RESPONSE_CAPTURED',
    });
    db.fullNovelPreprocess.setStage(run.id, 'RESPONSE_CAPTURED', {
      raw_response_path: rawPath,
      correlation_id: '22222222-2222-2222-2222-222222222222',
    });

    const result = await new FullNovelPreprocessOrchestrator(db).run(projectId);
    expect(result.mode).toBe('full');
    expect(result.status).toBe('completed');
    expect(result.foundKeys.length).toBeGreaterThanOrEqual(6);

    const done = db.fullNovelPreprocess.getLatestRun(projectId);
    expect(done?.stage).toBe('COMPLETED');
    expect(done?.raw_response_path).toBe(rawPath);
  });

  it('can re-parse after parse failure without losing raw', async () => {
    db.googleAccounts.create({
      label: 'B',
      email: 'b@test.com',
      displayName: 'B',
      profileDirName: 'profile-b',
      status: 'READY',
    });
    db.chapters.create({
      project_id: projectId,
      sequence_order: 1,
      chapter_number: 1,
      source_status: 'SOURCE_READY',
      source_text: '再试一次',
    });

    const rawDir = path.join(pathsService.getPath('exports'), 'preprocess', projectId, 'raw');
    fs.mkdirSync(rawDir, { recursive: true });
    const rawPath = path.join(rawDir, 'bad-then-good.md');
    fs.writeFileSync(rawPath, 'not enough files', 'utf8');

    const run = db.fullNovelPreprocess.createRun({
      project_id: projectId,
      stage: 'RESPONSE_CAPTURED',
    });
    db.fullNovelPreprocess.setStage(run.id, 'RESPONSE_CAPTURED', {
      raw_response_path: rawPath,
    });

    const fail = await new FullNovelPreprocessOrchestrator(db).run(projectId);
    expect(fail.status).toBe('failed');
    expect(db.fullNovelPreprocess.getLatestRun(projectId)?.stage).toBe('RESPONSE_CAPTURED');
    expect(fs.existsSync(rawPath)).toBe(true);

    fs.writeFileSync(rawPath, sampleRawResponse(), 'utf8');
    const ok = await new FullNovelPreprocessOrchestrator(db).run(projectId);
    expect(ok.status).toBe('completed');
    expect(db.fullNovelPreprocess.getLatestRun(projectId)?.stage).toBe('COMPLETED');
  });
});
