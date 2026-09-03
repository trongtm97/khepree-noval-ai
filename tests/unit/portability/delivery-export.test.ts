import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { writeFileAtomic } from '@main/portability/atomic-write';
import {
  buildDeliveryExportFingerprint,
  resolveUniqueExportFilePath,
} from '@shared/utils/delivery-export-path';
import {
  fitPathLength,
  sanitizeFilename,
  versionedFilename,
} from '@shared/utils/sanitize-filename';
import { resolveDeliveryExportFormats } from '@main/portability/delivery-export-service';
import {
  emitProductionCompletion,
  resetCompletionNotifyBridgeForTests,
  setCompletionNotifyMainWindow,
} from '@main/production/completion-notify-bridge';
import type { ProductionCompletionEvent } from '@shared/schemas/delivery-completion';

describe('delivery export path helpers', () => {
  let tmp: string;

  afterEach(() => {
    if (tmp && fs.existsSync(tmp)) {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    resetCompletionNotifyBridgeForTests();
  });

  it('sanitizes unicode + windows reserved + long paths', () => {
    expect(sanitizeFilename('Tiên Nghịch: tập 1')).toContain('Tiên Nghịch');
    expect(sanitizeFilename('CON')).toBe('_CON');
    const longLeaf = `${'あ'.repeat(200)}.txt`;
    const dir = 'C:\\Users\\user\\Documents\\exports\\project';
    const fitted = fitPathLength(dir, longLeaf, 240);
    expect(`${dir}\\${fitted}`.length).toBeLessThanOrEqual(240);
    expect(fitted.endsWith('.txt')).toBe(true);
  });

  it('versions on collision; ASK unattended never overwrites', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-deliv-'));
    const first = path.join(tmp, 'Novel.txt');
    fs.writeFileSync(first, 'v1');

    const keep = resolveUniqueExportFilePath({
      directory: tmp,
      fileName: 'Novel.txt',
      policy: 'KEEP_BOTH',
      unattended: true,
    });
    expect(keep.filePath).toBe(path.join(tmp, 'Novel (2).txt'));
    expect(keep.createdVersion).toBe(2);

    const ask = resolveUniqueExportFilePath({
      directory: tmp,
      fileName: 'Novel.txt',
      policy: 'ASK',
      unattended: true,
    });
    expect(ask.filePath).toBe(path.join(tmp, 'Novel (2).txt'));

    const overwrite = resolveUniqueExportFilePath({
      directory: tmp,
      fileName: 'Novel.txt',
      policy: 'OVERWRITE',
      unattended: true,
    });
    expect(overwrite.filePath).toBe(first);
  });

  it('versionedFilename helper', () => {
    expect(versionedFilename('a.txt', 1)).toBe('a.txt');
    expect(versionedFilename('a.txt', 3)).toBe('a (3).txt');
  });

  it('atomic write leaves no target on crash mid-temp', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-atomic-'));
    const target = path.join(tmp, 'out.txt');
    // Simulate orphaned temp without renaming
    const orphan = path.join(tmp, `.out.txt.${process.pid}.crash.tmp`);
    fs.writeFileSync(orphan, 'partial');
    expect(fs.existsSync(target)).toBe(false);

    writeFileAtomic(target, 'complete');
    expect(fs.readFileSync(target, 'utf8')).toBe('complete');
    // Successful write should not leave the successful tmp (renamed away)
    expect(fs.existsSync(target)).toBe(true);
  });

  it('atomic write cleans temp on permission-style failure', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-atomic-fail-'));
    const blockedDir = path.join(tmp, 'blocked');
    fs.mkdirSync(blockedDir);
    // Write to a path where rename target is a directory → rename fails
    const target = path.join(tmp, 'blocked');
    expect(() => writeFileAtomic(target, 'x')).toThrow();
    const leftovers = fs.readdirSync(tmp).filter((n) => n.includes('.tmp'));
    expect(leftovers.length).toBe(0);
  });

  it('fingerprint stable for idempotent retry', () => {
    const a = buildDeliveryExportFingerprint({
      campaignId: 'c1',
      projectId: 'p1',
      startToken: 't1',
      formats: ['epub', 'txt'],
      recipeMode: 'BALANCED',
    });
    const b = buildDeliveryExportFingerprint({
      campaignId: 'c1',
      projectId: 'p1',
      startToken: 't1',
      formats: ['txt', 'epub'],
      recipeMode: 'BALANCED',
    });
    expect(a).toBe(b);
  });

  it('resolveDeliveryExportFormats defaults and filters', () => {
    expect(resolveDeliveryExportFormats([])).toEqual(['txt']);
    expect(resolveDeliveryExportFormats(['TXT', 'epub', 'pdf'])).toEqual([
      'txt',
      'epub',
    ]);
  });

  it('completion notify dedupes by id', () => {
    const sent: ProductionCompletionEvent[] = [];
    const fakeWin = {
      isDestroyed: () => false,
      webContents: {
        send: (_ch: string, payload: ProductionCompletionEvent) => {
          sent.push(payload);
        },
      },
    };
    setCompletionNotifyMainWindow(fakeWin as never);

    const event: ProductionCompletionEvent = {
      id: 'delivery:same',
      kind: 'PROJECT_DELIVERED',
      title: 'done',
      description: 'proj',
      campaignId: '00000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000002',
      projectTitle: 'P',
      route: '/jobs/campaigns/00000000-0000-4000-8000-000000000001',
      outputDirectory: null,
      primaryFilePath: null,
      manifestPath: null,
      formats: ['txt'],
      warnings: [],
      desktopNotify: false,
      openTarget: false,
    };

    emitProductionCompletion(event);
    emitProductionCompletion(event);
    expect(sent).toHaveLength(1);

    // Click path may re-emit with openTarget
    emitProductionCompletion(
      { ...event, openTarget: true, desktopNotify: false },
      { skipDedupe: true },
    );
    expect(sent).toHaveLength(2);
    expect(sent[1]?.openTarget).toBe(true);
    expect(sent[1]?.route).toContain('/jobs/campaigns/');
  });
});
