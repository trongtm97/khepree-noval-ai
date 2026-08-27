import type { DatabaseManager } from '../db/database-manager';
import JSZip from 'jszip';
import {
  getLanguageProfile,
  normalizeLanguageCode,
} from '@shared/constants/language-profile';
import { resolveActiveEditionId } from '../services/edition-service';

export interface NovelExportParagraph {
  stableParagraphId: string;
  sequence: number;
  sourceText: string;
  translatedText: string | null;
  trailingNewlines: number;
}

export interface NovelExportChapter {
  chapterNumber: number;
  title: string | null;
  paragraphs: NovelExportParagraph[];
}

export interface NovelExportOptions {
  projectId: string;
  chapterFrom?: number;
  chapterTo?: number;
  translatedOnly: boolean;
}

export interface NovelExportData {
  projectTitle: string;
  sourceLanguage: string;
  targetLanguage: string;
  sourceLanguageLabel: string;
  targetLanguageLabel: string;
  chapters: NovelExportChapter[];
}

export function loadNovelExportData(
  db: DatabaseManager,
  options: NovelExportOptions,
): NovelExportData {
  const project = db.projects.getById(options.projectId);
  if (!project) throw new Error('Project not found');

  let chapters = db.chapters.listByProject(options.projectId);
  if (options.chapterFrom != null) {
    const from = options.chapterFrom;
    chapters = chapters.filter(
      (c) => (c.chapter_number ?? c.sequence_order) >= from,
    );
  }
  if (options.chapterTo != null) {
    const to = options.chapterTo;
    chapters = chapters.filter(
      (c) => (c.chapter_number ?? c.sequence_order) <= to,
    );
  }

  const exportChapters: NovelExportChapter[] = [];
  const editionId = resolveActiveEditionId(db, options.projectId);

  for (const chapter of chapters) {
    const paragraphs = db.paragraphs.listByChapter(chapter.id);
    const exportParagraphs: NovelExportParagraph[] = [];

    for (const para of paragraphs) {
      const translation = db.translations.getByParagraphId(para.id, editionId);
      const translatedText = translation?.translated_text ?? null;
      if (options.translatedOnly && !translatedText?.trim()) continue;

      exportParagraphs.push({
        stableParagraphId: para.paragraph_id,
        sequence: para.sequence,
        sourceText: para.source_text,
        translatedText,
        trailingNewlines:
          typeof para.trailing_newlines === 'number' && para.trailing_newlines > 0
            ? Math.min(2, para.trailing_newlines)
            : 2,
      });
    }

    if (options.translatedOnly && exportParagraphs.length === 0) continue;

    exportChapters.push({
      chapterNumber: chapter.chapter_number ?? chapter.sequence_order,
      title: chapter.display_title ?? chapter.chapter_title,
      paragraphs: exportParagraphs,
    });
  }

  return {
    projectTitle: project.title,
    sourceLanguage: normalizeLanguageCode(project.source_language),
    targetLanguage: normalizeLanguageCode(project.target_language),
    sourceLanguageLabel: getLanguageProfile(project.source_language).displayNameNative,
    targetLanguageLabel: getLanguageProfile(project.target_language).displayNameNative,
    chapters: exportChapters,
  };
}

export interface RenderNovelOptions {
  includeChapterTitles: boolean;
  includeParagraphIds: boolean;
  useTranslation: boolean;
}

/** Prefer original chapter title; only synthesize "Chương N:" when title lacks a chapter cue. */
export function formatExportChapterHeading(
  chapterNumber: number,
  title: string | null | undefined,
): string {
  const trimmed = title?.trim() ?? '';
  if (!trimmed) return `Chương ${chapterNumber}`;
  if (
    /第\s*[0-9一二三四五六七八九十百千零〇两兩]+?\s*[章节回卷]/i.test(trimmed) ||
    /^(chương|chapter|chap\.?)\s*\d+/i.test(trimmed) ||
    /^chương\s+/i.test(trimmed)
  ) {
    return trimmed;
  }
  return `Chương ${chapterNumber}: ${trimmed}`;
}

function paragraphBodyHtml(body: string): string {
  return escapeXml(body).replace(/\n/g, '<br/>');
}

export function renderChapterPlainText(
  chapter: NovelExportChapter,
  opts: RenderNovelOptions,
): string {
  const lines: string[] = [];
  if (opts.includeChapterTitles) {
    lines.push(formatExportChapterHeading(chapter.chapterNumber, chapter.title));
    lines.push('');
  }
  for (const para of chapter.paragraphs) {
    const body = opts.useTranslation
      ? (para.translatedText ?? para.sourceText)
      : para.sourceText;
    if (opts.includeParagraphIds) {
      lines.push(`${para.stableParagraphId} ${body}`);
    } else {
      lines.push(body);
    }
    // trailingNewlines=1 → adjacent; =2 → one blank line after paragraph
    const trail = Math.max(1, Math.min(2, para.trailingNewlines || 2));
    for (let i = 1; i < trail; i += 1) {
      lines.push('');
    }
  }
  return lines.join('\n').trimEnd();
}

export function renderNovelPlainText(
  data: NovelExportData,
  opts: RenderNovelOptions,
): string {
  return data.chapters
    .map((chapter) => renderChapterPlainText(chapter, opts))
    .filter(Boolean)
    .join('\n\n');
}

export function countExportParagraphs(data: NovelExportData): number {
  return data.chapters.reduce((sum, ch) => sum + ch.paragraphs.length, 0);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderChapterHtml(
  chapter: NovelExportChapter,
  opts: RenderNovelOptions,
): string {
  const parts: string[] = [];
  if (opts.includeChapterTitles) {
    const heading = formatExportChapterHeading(chapter.chapterNumber, chapter.title);
    parts.push(`<h1>${escapeXml(heading)}</h1>`);
  }
  for (const para of chapter.paragraphs) {
    const body = opts.useTranslation
      ? (para.translatedText ?? para.sourceText)
      : para.sourceText;
    const prefix = opts.includeParagraphIds
      ? `<span class="pid">${escapeXml(para.stableParagraphId)}</span> `
      : '';
    parts.push(`<p>${prefix}${paragraphBodyHtml(body)}</p>`);
    const trail = Math.max(1, Math.min(2, para.trailingNewlines || 2));
    if (trail >= 2) {
      parts.push('<p><br/></p>');
    }
  }
  return parts.join('\n');
}

export function wrapHtmlDocument(title: string, bodyHtml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(title)}</title></head>
<body>
${bodyHtml}
</body>
</html>`;
}

export function buildDocxParagraphsXml(text: string): string {
  return text
    .split(/\n/)
    .map((line) => {
      if (!line.trim()) return '<w:p/>';
      return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`;
    })
    .join('');
}

export async function buildMinimalDocxBuffer(title: string, bodyText: string): Promise<Buffer> {
  const zip = new JSZip();
  const paragraphs = buildDocxParagraphsXml(bodyText);
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${escapeXml(title)}</w:t></w:r></w:p>
    ${paragraphs}
    <w:sectPr/>
  </w:body>
</w:document>`,
  );
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

export async function buildEpubBuffer(
  data: NovelExportData,
  opts: RenderNovelOptions,
): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  const manifestItems: string[] = [];
  const spineItems: string[] = [];
  let idx = 0;
  for (const chapter of data.chapters) {
    idx += 1;
    const id = `ch${idx}`;
    const fileName = `OEBPS/${id}.xhtml`;
    const html = wrapHtmlDocument(
      chapter.title ?? `Chapter ${chapter.chapterNumber}`,
      renderChapterHtml(chapter, opts),
    );
    zip.file(fileName, html);
    manifestItems.push(
      `<item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`,
    );
    spineItems.push(`<itemref idref="${id}"/>`);
  }

  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(data.projectTitle)}</dc:title>
    <dc:language>${escapeXml(normalizeLanguageCode(data.targetLanguage))}</dc:language>
    <meta property="dcterms:source">${escapeXml(normalizeLanguageCode(data.sourceLanguage))}</meta>
    <meta name="noveltrans:source-language" content="${escapeXml(data.sourceLanguageLabel)}"/>
    <meta name="noveltrans:target-language" content="${escapeXml(data.targetLanguageLabel)}"/>
    <dc:identifier id="uid">urn:noveltrans:${Date.now()}</dc:identifier>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine>
    ${spineItems.join('\n    ')}
  </spine>
</package>`,
  );

  return zip.generateAsync({ type: 'nodebuffer' });
}
