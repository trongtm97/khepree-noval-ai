import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseManager } from '@main/db/database-manager';
import { ImportService } from '@main/import/import-service';
import { initializeDatabase, closeDatabase } from '@main/db/connection';
import { formatParagraphId } from '@shared/utils/stable-id';
import JSZip from 'jszip';

describe('ImportService', () => {
  let tempRoot: string;
  let db: DatabaseManager;
  let service: ImportService;
  let fixturePath: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-import-'));
    db = initializeDatabase({
      dataDir: path.join(tempRoot, 'data'),
      backupsDir: path.join(tempRoot, 'backups'),
    });
    service = new ImportService();
    fixturePath = path.resolve(
      __dirname,
      '../../fixtures/import/chinese-web-novel.txt',
    );
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('previews chapters then commits with stable IDs and source hashes', async () => {
    const preview = await service.createPreview(fixturePath);
    expect(preview.chapterCount).toBeGreaterThan(3);
    const first = preview.chapters[0];
    expect(first.chapterNumber).toBeGreaterThan(0);
    expect(first.title.length).toBeGreaterThan(0);
    expect(first.characterCount).toBeGreaterThanOrEqual(0);
    expect(first.paragraphCount).toBeGreaterThanOrEqual(0);
    expect(preview.sourceHash).toHaveLength(64);

    const patched = service.patchPreviewChapters(preview.previewId, [
      { chapterNumber: 1, title: 'Renamed Title Only' },
    ]);
    expect(patched.chapters[0].title).toBe('Renamed Title Only');

    const committed = service.commitPreview({
      previewId: preview.previewId,
      projectTitle: 'Test Novel',
    });
    expect(committed.chapterCount).toBe(patched.chapterCount);
    expect(committed.paragraphCount).toBeGreaterThan(0);

    const chapters = db.chapters.listByProject(committed.project.id);
    expect(chapters[0].chapter_title).toBe('Renamed Title Only');
    const hashed = chapters.find((c) => (c.source_text?.length ?? 0) > 0);
    expect(hashed).toBeDefined();
    expect(hashed?.source_hash).toBeTruthy();
    if (!hashed) {
      return;
    }

    const paras = db.paragraphs.listByChapter(hashed.id);
    expect(paras[0].paragraph_id).toBe(
      formatParagraphId(hashed.chapter_number ?? 1, 1),
    );
    expect(paras[0].source_hash).toHaveLength(64);
  });

  it('detects duplicate titles in preview', async () => {
    const preview = await service.createPreview(fixturePath);
    expect(preview.chapters.some((c) => c.isDuplicateTitle)).toBe(true);
  });

  it('parses minimal EPUB buffer via file', async () => {
    const epubPath = path.join(tempRoot, 'sample.epub');
    await writeMinimalEpub(epubPath, '第一章\n\n你好。\n\n第二章\n\n世界。');
    const preview = await service.createPreview(epubPath);
    expect(preview.format).toBe('epub');
    expect(preview.chapterCount).toBeGreaterThanOrEqual(2);
  });
});

async function writeMinimalEpub(filePath: string, text: string): Promise<void> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0"?>
<package>
  <manifest>
    <item id="c1" href="chap.html" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
  </spine>
</package>`,
  );
  const htmlBody = text
    .split('\n')
    .map((line) => (line.trim() ? `<p>${line}</p>` : ''))
    .join('');
  zip.file(
    'OEBPS/chap.html',
    `<?xml version="1.0"?><html><body>${htmlBody}</body></html>`,
  );
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(filePath, buf);
}
