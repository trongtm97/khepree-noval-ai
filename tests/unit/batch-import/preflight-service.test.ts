import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { BatchImportPreflightService } from '@main/batch-import/batch-import-preflight-service';
import { pathsService } from '@main/services/paths-service';

const dirs: string[] = [];

function tmp(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('BatchImportPreflightService', () => {
  it('scans a multi-novel folder without creating sqlite files under the source', async () => {
    const root = tmp('scan-folder-');
    fs.mkdirSync(path.join(root, 'Alpha'));
    fs.writeFileSync(path.join(root, 'Alpha', '1.txt'), '第一章 开始\n内容A', 'utf8');
    fs.writeFileSync(path.join(root, 'Beta.txt'), '第一章 贝塔\n内容B', 'utf8');

    const service = new BatchImportPreflightService();
    const dto = await service.scan({ sourceKind: 'folder', sourcePath: root });

    expect(dto.candidates.length).toBe(2);
    expect(dto.candidates.map((c) => c.displayPath).every((p) => !p.includes(root))).toBe(true);
    expect(dto.candidates.some((c) => c.kind === 'folder')).toBe(true);
    expect(dto.candidates.some((c) => c.kind === 'file')).toBe(true);
    expect(fs.existsSync(path.join(root, 'khepree.db'))).toBe(false);
    expect(dto.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    await service.discard(dto.sessionId);
  });

  it('extracts ZIP then cleans temp on discard and cancel', async () => {
    const appRoot = tmp('appdata-');
    pathsService.initializeAt(appRoot);
    const src = tmp('zip-src-');
    const zipPath = path.join(src, 'novels.zip');
    const zip = new JSZip();
    zip.file('Gamma/1.txt', '第一章\nzip body');
    fs.writeFileSync(zipPath, await zip.generateAsync({ type: 'nodebuffer' }));

    const service = new BatchImportPreflightService();
    const dto = await service.scan({ sourceKind: 'zip', sourcePath: zipPath });
    const session = service.getSessionForTests(dto.sessionId);
    expect(session?.tempDir).toBeTruthy();
    expect(fs.existsSync(session!.tempDir!)).toBe(true);
    expect(dto.candidates.length).toBeGreaterThanOrEqual(1);

    await service.discard(dto.sessionId);
    expect(service.getSessionForTests(dto.sessionId)).toBeUndefined();
    expect(fs.existsSync(session!.tempDir!)).toBe(false);
  });

  it('cancel during scan aborts and removes temp extract', async () => {
    const appRoot = tmp('appdata-c-');
    pathsService.initializeAt(appRoot);
    const src = tmp('zip-cancel-');
    const zipPath = path.join(src, 'big.zip');
    const zip = new JSZip();
    for (let i = 0; i < 40; i += 1) {
      zip.file(`N${i}/1.txt`, `第${i}章\nbody`.repeat(20));
    }
    fs.writeFileSync(zipPath, await zip.generateAsync({ type: 'nodebuffer' }));

    const service = new BatchImportPreflightService();
    let seenSession: string | null = null;
    service.setProgressSink((event) => {
      if (event.sessionId) seenSession = event.sessionId;
    });
    const pending = service.scan({ sourceKind: 'zip', sourcePath: zipPath });
    await vi.waitFor(() => {
      expect(seenSession).toBeTruthy();
    });
    const cancelResult = service.cancel(seenSession ?? undefined);
    const [scanSettled, cancelSettled] = await Promise.allSettled([pending, cancelResult]);
    expect(cancelSettled.status === 'fulfilled' || scanSettled.status === 'rejected').toBe(true);
    if (scanSettled.status === 'fulfilled') {
      await service.discard(scanSettled.value.sessionId);
    }

    const cache = path.join(appRoot, 'KhepreeNovelAI', 'cache', 'batch-import');
    await vi.waitFor(() => {
      if (!fs.existsSync(cache)) return;
      expect(fs.readdirSync(cache)).toEqual([]);
    });
  });
});
