import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBookInfoText } from '@main/source-folder/book-info-parser';
import { classifySourceFile } from '@main/source-folder/source-file-classifier';
import { scanSourceFolder } from '@main/source-folder/folder-scanner';

describe('book-info-parser', () => {
  it('parses Vietnamese _BOOK_INFO keys', () => {
    const text = `Tên truyện:
仙逆

Tên tiếng Việt:
Tiên Nghịch

Tác giả:
耳根

Thể loại:
Tiên hiệp, Tu chân

Tổng số chương:
2088

Mô tả:
Một thiếu niên...

Tóm tắt:
Vương Lâm...`;

    const parsed = parseBookInfoText(text);
    expect(parsed.titleCn).toBe('仙逆');
    expect(parsed.titleVi).toBe('Tiên Nghịch');
    expect(parsed.authorName).toBe('耳根');
    expect(parsed.genre).toBe('Tiên hiệp');
    expect(parsed.subgenres).toContain('Tu chân');
    expect(parsed.expectedChapterCount).toBe(2088);
    expect(parsed.description).toContain('thiếu niên');
    expect(parsed.officialSummary).toContain('Vương Lâm');
  });
});

describe('source-file-classifier', () => {
  function classifyFile(name: string, body: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-cls-'));
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, body, 'utf8');
    const stat = fs.statSync(filePath);
    const result = classifySourceFile({
      filePath,
      buffer: fs.readFileSync(filePath),
      stat: { size: stat.size, mtimeMs: stat.mtimeMs },
    });
    fs.rmSync(dir, { recursive: true, force: true });
    return result;
  }

  it('classifies _BOOK_INFO as metadata', () => {
    const result = classifyFile(
      '_BOOK_INFO.txt',
      'Tên truyện:\n仙逆\n\nTác giả:\n耳根',
    );
    expect(result.classification).toBe('BOOK_METADATA');
    expect(result.parsedMetadata?.titleCn).toBe('仙逆');
  });

  it('classifies 序章 as PROLOGUE', () => {
    const result = classifyFile('序章.txt', '序章\n\n正文开始。');
    expect(result.classification).toBe('PROLOGUE');
    expect(result.chapterType).toBe('PROLOGUE');
  });

  it('classifies 楔子 as PROLOGUE', () => {
    expect(classifyFile('楔子.txt', '楔子\nA').classification).toBe('PROLOGUE');
  });

  it('classifies 作者的话 as AUTHOR_NOTE document', () => {
    const result = classifyFile('作者的话.txt', '感谢阅读');
    expect(result.classification).toBe('PROJECT_DOCUMENT');
    expect(result.documentType).toBe('AUTHOR_NOTE');
  });

  it('classifies 内容简介 as OFFICIAL_SUMMARY document', () => {
    const result = classifyFile('内容简介.txt', '这是简介');
    expect(result.documentType).toBe('OFFICIAL_SUMMARY');
  });

  it('classifies 前言 as PREFACE document', () => {
    const result = classifyFile('前言.txt', '前言内容');
    expect(result.documentType).toBe('PREFACE');
  });

  it('classifies 番外1 as EXTRA', () => {
    const result = classifyFile('番外1.txt', '番外篇\n内容');
    expect(result.classification).toBe('EXTRA');
  });

  it('classifies 终章 as EPILOGUE', () => {
    expect(classifyFile('终章.txt', '结局').classification).toBe('EPILOGUE');
  });

  it('marks unknown files without importing as chapter', () => {
    expect(classifyFile('UnknownFile.txt', 'random readme').classification).toBe('UNKNOWN');
  });

  it('detects filename vs heading chapter conflict', () => {
    const result = classifyFile('001.txt', '第二章\n内容');
    expect(result.detectionSource).toBe('conflict');
    expect(result.readError).toContain('Xung đột');
  });
});

describe('folder-scanner metadata integration', () => {
  it('separates metadata, documents, prologue, and chapters', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-meta-scan-'));
    fs.writeFileSync(
      path.join(dir, '_BOOK_INFO.txt'),
      'Tên truyện:\n仙逆\n\nTác giả:\n耳根\n',
      'utf8',
    );
    fs.writeFileSync(path.join(dir, '_SUMMARY.txt'), 'Tóm tắt chính thức', 'utf8');
    fs.writeFileSync(path.join(dir, '序章.txt'), '序章\nMở đầu', 'utf8');
    fs.writeFileSync(path.join(dir, '000001.txt'), '第一章\nNội dung 1', 'utf8');
    fs.writeFileSync(path.join(dir, '000002.txt'), '第二章\nNội dung 2', 'utf8');

    const result = await scanSourceFolder({ folderPath: dir });

    expect(result.bookMetadata?.parsed.titleCn).toBe('仙逆');
    expect(result.projectDocuments.length).toBeGreaterThanOrEqual(1);
    expect(result.specialChapters.some((c) => c.chapterType === 'PROLOGUE')).toBe(true);
    expect(result.newChapters.map((c) => c.chapterNumber).sort((a, b) => a - b)).toEqual([1, 2]);
    expect(result.normalChapterCount).toBe(2);
    expect(result.unrecognizedFiles).not.toContain(path.join(dir, '_BOOK_INFO.txt'));

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
