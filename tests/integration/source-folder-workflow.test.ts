import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, initializeDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import { SourceFolderService } from '@main/source-folder/source-folder-service';

describe('source folder workflow integration', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-sf-int-'));
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

  it('creates project from folder, detects new chapter on rescan', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-novel-'));
    for (let i = 1; i <= 3; i += 1) {
      fs.writeFileSync(path.join(dir, `${i}.txt`), `第${i}章\nBody ${i}`, 'utf8');
    }

    const service = new SourceFolderService();
    const preview = await service.createFolderPreview({ folderPath: dir });
    const created = await service.commitFolderImport({
      previewId: preview.previewId,
      projectTitle: 'Integration Novel',
    });
    expect(created.chapterCount).toBe(3);

    fs.writeFileSync(path.join(dir, '4.txt'), '第4章\nBody 4', 'utf8');
    const scan = await service.scanProject(created.project.id);
    expect(scan.newChapters.some((c) => c.chapterNumber === 4)).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
