import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import { SourceFolderService } from '@main/source-folder/source-folder-service';
import { classifyWatchEvents } from '@main/source-folder/watch-event-classifier';
import { isQuietHoursNow } from '@main/source-folder/watch-folder-policy';
import { WATCH_POLICY_META_KEYS } from '@shared/constants/source-folder';

describe('smart watch folder', () => {
  let tempRoot: string;
  let service: SourceFolderService;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-watch-'));
    pathsService.initializeAt(tempRoot);
    initializeDatabase({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });
    service = new SourceFolderService();
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  async function seedFolderProject(chapterBodies: Record<number, string>): Promise<{
    projectId: string;
    dir: string;
  }> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-novel-watch-'));
    for (const [num, body] of Object.entries(chapterBodies)) {
      fs.writeFileSync(path.join(dir, `${num}.txt`), body, 'utf8');
    }
    const preview = await service.createFolderPreview({ folderPath: dir });
    const created = await service.commitFolderImport({
      previewId: preview.previewId,
      projectTitle: 'Watch Novel',
    });
    const db = getDatabase();
    db.projects.updateSourceFolderSettings(created.project.id, {
      auto_import_new_chapters: true,
      watch_folder_enabled: true,
    });
    return { projectId: created.project.id, dir };
  }

  it('coalesces burst saves into one modified revision', async () => {
    const { projectId, dir } = await seedFolderProject({ 1: '第1章\nBody A' });
    const filePath = path.join(dir, '1.txt');
    fs.writeFileSync(filePath, '第1章\nBody B', 'utf8');

    await service.processWatchEvents(projectId, [
      { kind: 'change', filePath, projectId },
      { kind: 'change', filePath, projectId },
      { kind: 'change', filePath, projectId },
    ]);

    const chapter = getDatabase().chapters.getByProjectAndNumber(projectId, 1);
    expect(chapter?.source_text).toContain('Body B');
    expect(chapter?.source_status).toBe('SOURCE_READY');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('detects cross-path chapter rename', () => {
    const db = getDatabase();
    const projectId = db.projects.create({ title: 'Rename test' }).id;
    const oldPath = path.join(tempRoot, 'old-1.txt');
    const newPath = path.join(tempRoot, 'renamed-1.txt');
    const chapter = db.chapters.create({
      project_id: projectId,
      chapter_number: 1,
      sequence_order: 1,
      chapter_title: 'Ch 1',
      source_text: '第1章\nHello',
      status: 'translated',
      source_file_path: oldPath,
      source_content_hash: 'hash-old',
    });

    const classified = classifyWatchEvents({
      events: [
        { kind: 'unlink', filePath: oldPath, projectId },
        { kind: 'add', filePath: newPath, projectId },
      ],
      getChapterByPath: (pid, fp) =>
        db.chapters.listByProject(pid).find((c) => c.source_file_path === fp) ?? null,
      getChapterByNumber: (pid, num) => db.chapters.getByProjectAndNumber(pid, num),
      readDetected: (fp) =>
        fp === newPath
          ? {
              chapterNumber: 1,
              chapterTitle: 'Ch 1',
              normalizedText: '第1章\nHello',
              sourceFilePath: newPath,
              sourceFileName: path.basename(newPath),
              sourceFileSize: 20,
              fileModifiedAt: new Date().toISOString(),
              sourceFileHash: 'f1',
              contentHash: 'hash-old',
              encoding: 'utf-8',
              confidence: 1,
              detectionSource: 'filename',
            }
          : null,
    });

    expect(classified.some((e) => e.kind === 'renamed' && e.filePath === newPath)).toBe(true);
    expect(chapter.id).toBeTruthy();
  });

  it('marks missing file without deleting chapter and opens attention item', async () => {
    const { projectId, dir } = await seedFolderProject({ 1: '第1章\nKeep me' });
    const filePath = path.join(dir, '1.txt');
    const chapterId = getDatabase().chapters.getByProjectAndNumber(projectId, 1)!.id;

    service.handleFileMissing(projectId, filePath);

    const db = getDatabase();
    const chapter = db.chapters.getById(chapterId);
    expect(chapter?.source_status).toBe('SOURCE_MISSING');
    expect(chapter?.source_text).toContain('Keep me');

    const inbox = db.attentionInbox.listOpen(20);
    expect(inbox.some((i) => i.type === 'SOURCE_MISSING' && i.chapter_id === chapterId)).toBe(
      true,
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('defers revision while chapter job is active', async () => {
    const { projectId, dir } = await seedFolderProject({ 1: '第1章\nV1' });
    const db = getDatabase();
    const chapter = db.chapters.getByProjectAndNumber(projectId, 1)!;
    db.jobs.create({
      project_id: projectId,
      type: 'TRANSLATE',
      state: 'RUNNING',
      chapter_from: 1,
      chapter_to: 1,
      config: '{}',
    });

    const filePath = path.join(dir, '1.txt');
    fs.writeFileSync(filePath, '第1章\nV2', 'utf8');
    await service.processWatchEvents(projectId, [{ kind: 'change', filePath, projectId }]);

    expect(db.sourcePendingRevisions.hasPendingForChapter(projectId, chapter.id)).toBe(true);
    expect(db.chapters.getById(chapter.id)?.source_text).toContain('V1');

    db.jobs.updateState(
      db.jobs.listByProject(projectId)[0]!.id,
      'COMPLETED',
    );
    const applied = await service.flushPendingRevisionsForProject(projectId);
    expect(applied).toBe(1);
    expect(db.chapters.getById(chapter.id)?.source_text).toContain('V2');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does not enqueue duplicate jobs on restart reconcile', async () => {
    const { projectId, dir } = await seedFolderProject({ 1: '第1章\nDup' });
    const db = getDatabase();
    db.projects.updateSourceFolderSettings(projectId, {
      auto_queue_new_chapters: true,
    });

    const j1 = db.jobs.create({
      project_id: projectId,
      type: 'TRANSLATE',
      state: 'QUEUED',
      chapter_from: 1,
      chapter_to: 1,
      config: '{}',
    });
    const j2 = db.jobs.create({
      project_id: projectId,
      type: 'TRANSLATE',
      state: 'QUEUED',
      chapter_from: 1,
      chapter_to: 1,
      config: '{}',
    });
    db.getConnection()
      .prepare(`UPDATE jobs SET created_at = ? WHERE id = ?`)
      .run('2030-01-02T00:00:00.000Z', j2.id);

    const cancelled = db.jobs.reconcileDuplicateQueued(projectId);
    expect(cancelled).toBe(1);
    const queued = db.jobs
      .listByProject(projectId)
      .filter((j) => j.state === 'QUEUED' && j.chapter_from === 1);
    expect(queued.length).toBe(1);
    expect(queued[0]?.id).toBe(j1.id);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('respects quiet hours policy', () => {
    const db = getDatabase();
    db.appMeta.set(WATCH_POLICY_META_KEYS.quietHoursEnabled, '1');
    db.appMeta.set(WATCH_POLICY_META_KEYS.quietHoursStart, '00:00');
    db.appMeta.set(WATCH_POLICY_META_KEYS.quietHoursEnd, '23:59');
    expect(isQuietHoursNow(db.appMeta)).toBe(true);
  });

  it('binds multi-project watch root by subpath', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-campaign-root-'));
    const volA = path.join(rootDir, 'vol-a');
    const volB = path.join(rootDir, 'vol-b');
    fs.mkdirSync(volA);
    fs.mkdirSync(volB);
    fs.writeFileSync(path.join(volA, '1.txt'), '第1章\nA', 'utf8');
    fs.writeFileSync(path.join(volB, '1.txt'), '第1章\nB', 'utf8');

    const db = getDatabase();
    const projectA = db.projects.create({ title: 'Vol A' }).id;
    const projectB = db.projects.create({ title: 'Vol B' }).id;

    const { watchRootId } = service.registerWatchRoot({
      rootPath: rootDir,
      label: 'Campaign root',
      bindings: [
        { projectId: projectA, relativeSubpath: 'vol-a' },
        { projectId: projectB, relativeSubpath: 'vol-b' },
      ],
    });

    expect(
      db.watchRoots.resolveProjectForFile(rootDir, path.join(volA, '1.txt')),
    ).toBe(projectA);
    expect(
      db.watchRoots.resolveProjectForFile(rootDir, path.join(volB, '1.txt')),
    ).toBe(projectB);
    expect(watchRootId).toBeTruthy();

    fs.rmSync(rootDir, { recursive: true, force: true });
  });
});
