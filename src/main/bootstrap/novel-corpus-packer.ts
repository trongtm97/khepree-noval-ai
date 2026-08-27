import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { DatabaseManager } from '../db/database-manager';
import { pathsService } from '../services/paths-service';
import {
  CORPUS_PART_MAX_BYTES,
  CORPUS_PART_MAX_WORDS,
} from '@shared/constants/notebooklm-preprocess';

export interface CorpusPartInfo {
  fileName: string;
  filePath: string;
  wordCount: number;
  byteLength: number;
  chapterFrom: number;
  chapterTo: number;
  contentHash: string;
}

export interface PackNovelCorpusResult {
  outputDir: string;
  parts: CorpusPartInfo[];
  totalWords: number;
  totalChapters: number;
  underSinglePartLimit: boolean;
}

/** Estimate words: CJK ideographs count as 1 each; else whitespace-split. */
export function estimateWordCount(text: string): number {
  const cjk = text.match(/[\u3400-\u9fff\uf900-\ufaff]/g);
  const cjkCount = cjk ? cjk.join('').length : 0;
  const withoutCjk = text.replace(/[\u3400-\u9fff\uf900-\ufaff]+/g, ' ');
  const latin = withoutCjk
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
  return cjkCount + latin;
}

export interface ChapterCorpusBlock {
  chapterRef: number;
  text: string;
}

export interface InMemoryCorpusPart {
  body: string;
  wordCount: number;
  byteLength: number;
  chapterFrom: number;
  chapterTo: number;
}

/** Split chapter blocks by soft word/byte limits (no IO). */
export function splitCorpusParts(
  blocks: ChapterCorpusBlock[],
  maxWords = CORPUS_PART_MAX_WORDS,
  maxBytes = CORPUS_PART_MAX_BYTES,
): InMemoryCorpusPart[] {
  interface Buf {
    chunks: string[];
    words: number;
    bytes: number;
    chapterFrom: number;
    chapterTo: number;
  }

  const parts: InMemoryCorpusPart[] = [];
  let buf: Buf | null = null;

  const flush = () => {
    if (!buf || buf.chunks.length === 0) return;
    const body = buf.chunks.join('\n');
    parts.push({
      body,
      wordCount: buf.words,
      byteLength: Buffer.byteLength(body, 'utf8'),
      chapterFrom: buf.chapterFrom,
      chapterTo: buf.chapterTo,
    });
    buf = null;
  };

  for (const block of blocks) {
    const words = estimateWordCount(block.text);
    const bytes = Buffer.byteLength(block.text, 'utf8');
    if (
      buf &&
      (buf.words + words > maxWords || buf.bytes + bytes > maxBytes)
    ) {
      flush();
    }
    if (!buf) {
      buf = {
        chunks: [block.text],
        words,
        bytes,
        chapterFrom: block.chapterRef,
        chapterTo: block.chapterRef,
      };
    } else {
      buf.chunks.push(block.text);
      buf.words += words;
      buf.bytes += bytes;
      buf.chapterTo = block.chapterRef;
    }
  }
  flush();
  return parts;
}

function chapterBlock(ch: {
  chapter_number: number | null;
  sequence_order: number;
  display_title: string | null;
  chapter_title: string | null;
  source_text: string | null;
}): string {
  const n = ch.chapter_number ?? ch.sequence_order;
  const title = ch.display_title ?? ch.chapter_title ?? '';
  const header = title ? `# Chương ${n} — ${title}` : `# Chương ${n}`;
  return `${header}\n\n${(ch.source_text ?? '').trim()}\n`;
}

/**
 * Concatenate SOURCE_READY chapters and split into NotebookLM-safe text parts.
 */
export function packNovelCorpus(
  db: DatabaseManager,
  projectId: string,
  options?: { outputDir?: string },
): PackNovelCorpusResult {
  const project = db.projects.getById(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);

  const chapters = db.chapters
    .listByProject(projectId)
    .filter((c) => c.source_status === 'SOURCE_READY' && (c.source_text?.trim() ?? '').length > 0)
    .sort((a, b) => a.sequence_order - b.sequence_order);

  if (chapters.length === 0) {
    throw new Error('No SOURCE_READY chapters with text to pack');
  }

  const exportsRoot = pathsService.getPath('exports');
  const outputDir =
    options?.outputDir ??
    path.join(exportsRoot, 'preprocess', projectId, `corpus-${Date.now()}`);
  fs.mkdirSync(outputDir, { recursive: true });

  const blocks: ChapterCorpusBlock[] = chapters.map((ch) => ({
    chapterRef: ch.chapter_number ?? ch.sequence_order,
    text: chapterBlock(ch),
  }));
  const split = splitCorpusParts(blocks);

  const parts: CorpusPartInfo[] = [];
  let totalWords = 0;
  for (let i = 0; i < split.length; i++) {
    const part = split[i];
    const fileName = `NOVEL_PART_${String(i + 1).padStart(2, '0')}.txt`;
    const filePath = path.join(outputDir, fileName);
    fs.writeFileSync(filePath, part.body, 'utf8');
    parts.push({
      fileName,
      filePath,
      wordCount: part.wordCount,
      byteLength: part.byteLength,
      chapterFrom: part.chapterFrom,
      chapterTo: part.chapterTo,
      contentHash: createHash('sha256').update(part.body, 'utf8').digest('hex'),
    });
    totalWords += part.wordCount;
  }

  return {
    outputDir,
    parts,
    totalWords,
    totalChapters: chapters.length,
    underSinglePartLimit: parts.length === 1,
  };
}
