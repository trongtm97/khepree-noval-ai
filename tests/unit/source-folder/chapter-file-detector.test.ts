import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  detectChapterFromFilename,
  detectChapterFile,
} from '@main/source-folder/chapter-file-detector';
import { scanSourceFolder } from '@main/source-folder/folder-scanner';

describe('chapter-file-detector', () => {
  it('detects numeric filenames with natural order metadata', () => {
    expect(detectChapterFromFilename('1.txt')?.chapterNumber).toBe(1);
    expect(detectChapterFromFilename('10.txt')?.chapterNumber).toBe(10);
    expect(detectChapterFromFilename('000001.txt')?.chapterNumber).toBe(1);
    expect(detectChapterFromFilename('Chuong_501.txt')?.chapterNumber).toBe(501);
    expect(detectChapterFromFilename('Chapter 123.txt')?.chapterNumber).toBe(123);
    expect(detectChapterFromFilename('第501章 天地异变.txt')?.chapterNumber).toBe(501);
  });

  it('reads chapter body from txt file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-detect-'));
    const filePath = path.join(dir, '2.txt');
    fs.writeFileSync(filePath, '第二章 测试\n\n正文内容。', 'utf8');
    const stat = fs.statSync(filePath);
    const detected = detectChapterFile({
      filePath,
      buffer: fs.readFileSync(filePath),
      stat,
    });
    expect(detected.chapterNumber).toBe(2);
    expect(detected.normalizedText).toContain('正文内容');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('folder-scanner', () => {
  it('detects new, modified, missing, duplicate, and gaps', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-scan-'));
    fs.writeFileSync(path.join(dir, '1.txt'), '第一章\nA', 'utf8');
    fs.writeFileSync(path.join(dir, '2.txt'), '第二章\nB', 'utf8');
    fs.writeFileSync(path.join(dir, '4.txt'), '第四章\nD', 'utf8');

    const initial = await scanSourceFolder({ folderPath: dir });
    expect(initial.newChapters.map((c) => c.chapterNumber).sort((a, b) => a - b)).toEqual([
      1, 2, 4,
    ]);
    expect(initial.missingSequenceGaps).toContain(3);

    fs.writeFileSync(path.join(dir, '2.txt'), '第二章\nB changed', 'utf8');
    fs.writeFileSync(path.join(dir, 'Chapter_4.txt'), '第四章\nD', 'utf8');

    const rescan = await scanSourceFolder({
      folderPath: dir,
      existingChapters: initial.newChapters.map((c, idx) => ({
        id: `00000000-0000-0000-0000-${String(idx + 1).padStart(12, '0')}`,
        chapterNumber: c.chapterNumber,
        sequenceOrder: c.chapterNumber,
        chapterType: 'NORMAL' as const,
        sourceFilePath: c.sourceFilePath,
        sourceFileHash: null,
        sourceContentHash: c.contentHash,
        sourceStatus: 'SOURCE_READY',
        hasTranslation: false,
      })),
    });

    expect(rescan.modifiedChapters.some((c) => c.chapterNumber === 2)).toBe(true);
    expect(rescan.duplicateChapters.some((c) => c.chapterNumber === 4)).toBe(true);

    fs.unlinkSync(path.join(dir, '1.txt'));
    const missing = await scanSourceFolder({
      folderPath: dir,
      existingChapters: [
        {
          id: '00000000-0000-0000-0000-000000000001',
          chapterNumber: 1,
          sequenceOrder: 1,
          chapterType: 'NORMAL' as const,
          sourceFilePath: path.join(dir, '1.txt'),
          sourceFileHash: '1:1',
          sourceContentHash: 'abc',
          sourceStatus: 'SOURCE_READY',
          hasTranslation: false,
        },
      ],
    });
    expect(missing.missingChapters.some((c) => c.chapterNumber === 1)).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
