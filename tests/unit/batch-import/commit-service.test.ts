import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BatchImportPreflightService } from '@main/batch-import/batch-import-preflight-service';
import { BatchImportCommitService } from '@main/batch-import/batch-import-commit-service';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import { applyChapterSourceUpdateRespectingLocks } from '@main/batch-import/chapter-source-update';
import { sha256Text } from '@main/import/hash';

const dirs: string[] = [];

function tmp(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

describe('BatchImportCommitService', () => {
  let appRoot: string;
  let preflight: BatchImportPreflightService;
  let commit: BatchImportCommitService;

  beforeEach(() => {
    appRoot = tmp('batch-commit-app-');
    pathsService.initializeAt(appRoot);
    initializeDatabase({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });
    preflight = new BatchImportPreflightService();
    commit = new BatchImportCommitService(preflight);
  });

  afterEach(() => {
    closeDatabase();
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('imports folder novels then skips duplicates on re-import', async () => {
    const root = tmp('novels-');
    fs.mkdirSync(path.join(root, 'Alpha'));
    fs.writeFileSync(path.join(root, 'Alpha', '1.txt'), '第一章 开始\nNội dung A đủ dài.', 'utf8');
    fs.mkdirSync(path.join(root, 'Beta'));
    fs.writeFileSync(path.join(root, 'Beta', '1.txt'), '第一章 贝塔\nNội dung B đủ dài.', 'utf8');

    const dto = await preflight.scan({ sourceKind: 'folder', sourcePath: root });
    for (const c of dto.candidates) {
      if (c.proposedAction === 'NEEDS_ATTENTION') {
        preflight.updateCandidate({
          sessionId: dto.sessionId,
          candidateId: c.candidateId,
          proposedAction: 'CREATE',
          selected: true,
        });
      }
    }

    const first = await commit.commitFromPreflight(dto.sessionId);
    expect(first.summary.created).toBeGreaterThanOrEqual(2);
    expect(first.summary.failed).toBe(0);

    const db = getDatabase();
    const projectsAfterFirst = db.projects.list();
    expect(projectsAfterFirst.length).toBe(first.summary.created);

    const dto2 = await preflight.scan({ sourceKind: 'folder', sourcePath: root });
    for (const c of dto2.candidates) {
      if (c.proposedAction === 'NEEDS_ATTENTION') {
        preflight.updateCandidate({
          sessionId: dto2.sessionId,
          candidateId: c.candidateId,
          proposedAction: 'CREATE',
          selected: true,
        });
      }
    }
    const second = await commit.commitFromPreflight(dto2.sessionId);
    expect(second.summary.skippedDuplicate + second.summary.updated).toBeGreaterThanOrEqual(2);
    expect(second.summary.created).toBe(0);
    expect(db.projects.list().length).toBe(projectsAfterFirst.length);
  });

  it('one failed candidate does not roll back others', async () => {
    const root = tmp('iso-');
    fs.mkdirSync(path.join(root, 'Good'));
    fs.writeFileSync(path.join(root, 'Good', '1.txt'), '第一章\nGood body text.', 'utf8');
    fs.mkdirSync(path.join(root, 'Bad'));
    fs.writeFileSync(path.join(root, 'Bad', '1.txt'), '第一章\nBad body text.', 'utf8');

    const dto = await preflight.scan({ sourceKind: 'folder', sourcePath: root });
    for (const c of dto.candidates) {
      preflight.updateCandidate({
        sessionId: dto.sessionId,
        candidateId: c.candidateId,
        proposedAction: 'CREATE',
        selected: true,
      });
    }

    const mem = preflight.getSessionForCommit(dto.sessionId)!;
    const bad = mem.candidates.find((c) => c.displayPath.includes('Bad'))!;
    // Break path so Bad fails after persist
    bad.analyzed.absolutePath = path.join(root, 'does-not-exist-Bad');

    const result = await commit.commitFromPreflight(dto.sessionId);
    expect(result.summary.created).toBeGreaterThanOrEqual(1);
    expect(result.summary.failed).toBeGreaterThanOrEqual(1);
    expect(getDatabase().projects.list().some((p) => p.title.includes('Good') || p.title === 'Good')).toBe(
      true,
    );
  });

  it('retry is idempotent for already-created candidates', async () => {
    const root = tmp('retry-');
    fs.mkdirSync(path.join(root, 'Solo'));
    fs.writeFileSync(path.join(root, 'Solo', '1.txt'), '第一章\nSolo body.', 'utf8');

    const dto = await preflight.scan({ sourceKind: 'folder', sourcePath: root });
    for (const c of dto.candidates) {
      preflight.updateCandidate({
        sessionId: dto.sessionId,
        candidateId: c.candidateId,
        proposedAction: 'CREATE',
        selected: true,
      });
    }
    const first = await commit.commitFromPreflight(dto.sessionId);
    const created = first.candidates.find((c) => c.status === 'CREATED')!;
    const again = await commit.retryCandidate(first.sessionId, created.candidateId);
    expect(again.candidates.find((c) => c.candidateId === created.candidateId)?.status).toBe(
      'CREATED',
    );
    expect(getDatabase().projects.list().length).toBe(1);
  });

  it('update preserves human_locked translation text', async () => {
    const root = tmp('lock-');
    const novel = path.join(root, 'Locked');
    fs.mkdirSync(novel);
    fs.writeFileSync(path.join(novel, '1.txt'), '第一章\nParagraph one.\n\nParagraph two.', 'utf8');

    const dto = await preflight.scan({ sourceKind: 'folder', sourcePath: root });
    for (const c of dto.candidates) {
      preflight.updateCandidate({
        sessionId: dto.sessionId,
        candidateId: c.candidateId,
        proposedAction: 'CREATE',
        selected: true,
        predictedTitle: 'Locked Novel',
      });
    }
    const created = await commit.commitFromPreflight(dto.sessionId);
    const projectId = created.candidates.find((c) => c.status === 'CREATED')!.projectId!;
    const db = getDatabase();
    const chapter = db.chapters.getByProjectAndNumber(projectId, 1)!;
    const paras = db.paragraphs.listByChapter(chapter.id);
    expect(paras.length).toBeGreaterThanOrEqual(1);
    const locked = db.translations.create({
      paragraph_id: paras[0].id,
      translated_text: 'HUMAN LOCKED VI',
      status: 'translated',
      human_locked: true,
      version_source: 'HUMAN_EDIT',
    });

    fs.writeFileSync(
      path.join(novel, '1.txt'),
      '第一章\nParagraph one CHANGED.\n\nParagraph two CHANGED.',
      'utf8',
    );

    const dto2 = await preflight.scan({ sourceKind: 'folder', sourcePath: root });
    for (const c of dto2.candidates) {
      preflight.updateCandidate({
        sessionId: dto2.sessionId,
        candidateId: c.candidateId,
        proposedAction: 'UPDATE_EXISTING',
        targetProjectId: projectId,
        selected: true,
      });
    }
    const updated = await commit.commitFromPreflight(dto2.sessionId);
    expect(updated.summary.updated + updated.summary.skippedDuplicate).toBeGreaterThanOrEqual(1);

    const tr = db.translations.getById(locked.id)!;
    expect(tr.translated_text).toBe('HUMAN LOCKED VI');
    expect(tr.human_locked).toBe(1);

    // Direct unit path for lock helper
    const outcome = applyChapterSourceUpdateRespectingLocks({
      projectId,
      chapterNumber: 1,
      detected: {
        chapterTitle: '第一章',
        normalizedText: '第一章\nAgain changed.',
        sourceFilePath: path.join(novel, '1.txt'),
        sourceFileName: '1.txt',
        sourceFileSize: 10,
        fileModifiedAt: new Date().toISOString(),
        sourceFileHash: '1:1',
        contentHash: sha256Text('Again changed.'),
        encoding: 'utf-8',
      },
    });
    expect(outcome.preservedLockedParagraphs).toBeGreaterThanOrEqual(1);
    expect(db.translations.getById(locked.id)!.translated_text).toBe('HUMAN LOCKED VI');
  });

  it('ZIP materializes durable copy before temp cleanup', async () => {
    const JSZip = (await import('jszip')).default;
    const src = tmp('zip-src-');
    const zipPath = path.join(src, 'pack.zip');
    const zip = new JSZip();
    zip.file('Gamma/1.txt', '第一章\nzip durable body');
    fs.writeFileSync(zipPath, await zip.generateAsync({ type: 'nodebuffer' }));

    const dto = await preflight.scan({ sourceKind: 'zip', sourcePath: zipPath });
    const mem = preflight.getSessionForCommit(dto.sessionId)!;
    expect(mem.tempDir).toBeTruthy();
    for (const c of dto.candidates) {
      preflight.updateCandidate({
        sessionId: dto.sessionId,
        candidateId: c.candidateId,
        proposedAction: 'CREATE',
        selected: true,
      });
    }

    const result = await commit.commitFromPreflight(dto.sessionId);
    expect(result.summary.created).toBeGreaterThanOrEqual(1);
    expect(preflight.getSessionForCommit(dto.sessionId)).toBeUndefined();

    const session = getDatabase().batchImport.getSession(dto.sessionId)!;
    expect(session.durable_root).toBeTruthy();
    expect(fs.existsSync(session.durable_root!)).toBe(true);
    const project = getDatabase().projects.getById(
      result.candidates.find((c) => c.projectId)!.projectId!,
    )!;
    expect(project.source_folder_path?.includes('imported-sources')).toBe(true);
    expect(fs.existsSync(project.source_folder_path!)).toBe(true);
  });
});
