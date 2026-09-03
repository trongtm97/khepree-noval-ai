import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverNovelCandidates } from '@main/batch-import/discover-candidates';
import { analyzeDiscoveredCandidate } from '@main/batch-import/analyze-candidate';
import { fingerprintFromNormalizedText } from '@main/batch-import/content-fingerprint';
import {
  annotateCrossCandidateDuplicates,
  proposeCandidateAction,
} from '@main/batch-import/propose-action';

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

describe('discoverNovelCandidates', () => {
  it('finds child folders with txt + root files, unicode, natural order', async () => {
    const root = tmp('disc-');
    fs.mkdirSync(path.join(root, 'Book 10'));
    fs.writeFileSync(path.join(root, 'Book 10', '1.txt'), '第一章\nA', 'utf8');
    fs.mkdirSync(path.join(root, 'Book 2'));
    fs.writeFileSync(path.join(root, 'Book 2', '1.txt'), '第一章\nB', 'utf8');
    fs.mkdirSync(path.join(root, '龙族'));
    fs.writeFileSync(path.join(root, '龙族', '1.txt'), '第一章\nC', 'utf8');
    fs.writeFileSync(path.join(root, 'Standalone.txt'), '第一章 独立\nbody', 'utf8');
    fs.mkdirSync(path.join(root, 'empty-folder'));
    fs.writeFileSync(path.join(root, 'empty-folder', 'notes.md'), 'not a novel');

    const found = await discoverNovelCandidates(root);
    const labels = found.map((c) => c.label);
    expect(labels).toContain('Book 2');
    expect(labels).toContain('Book 10');
    expect(labels).toContain('Standalone.txt');
    expect(labels).toContain('龙族');
    expect(labels.indexOf('Book 2')).toBeLessThan(labels.indexOf('Book 10'));
    expect(found.filter((c) => c.kind === 'folder')).toHaveLength(3);
    expect(found.filter((c) => c.kind === 'file')).toHaveLength(1);
    expect(found.map((c) => c.label)).toEqual(labels);
  });
});

describe('analyze + fingerprint + propose', () => {
  it('skips empty txt and flags corrupt epub', async () => {
    const root = tmp('an-');
    const empty = path.join(root, 'empty.txt');
    fs.writeFileSync(empty, '', 'utf8');
    const emptyAnalyzed = await analyzeDiscoveredCandidate({
      kind: 'file',
      absolutePath: empty,
      label: 'empty.txt',
      extension: '.txt',
    });
    expect(emptyAnalyzed.warnings.some((w) => w.code === 'EMPTY_FILE')).toBe(true);
    expect(proposeCandidateAction(emptyAnalyzed, []).proposedAction).toBe('SKIP');

    const bad = path.join(root, 'bad.epub');
    fs.writeFileSync(bad, 'not-an-epub', 'utf8');
    const badAnalyzed = await analyzeDiscoveredCandidate({
      kind: 'file',
      absolutePath: bad,
      label: 'bad.epub',
      extension: '.epub',
    });
    expect(badAnalyzed.warnings.some((w) => w.code === 'CORRUPT_OR_UNREADABLE')).toBe(true);
    expect(proposeCandidateAction(badAnalyzed, []).proposedAction).toBe('SKIP');
  });

  it('stable fingerprint for identical text; duplicate annotation', async () => {
    const a = fingerprintFromNormalizedText('hello world');
    const b = fingerprintFromNormalizedText('hello world');
    expect(a).toBe(b);

    const root = tmp('dup-');
    const p1 = path.join(root, 'One.txt');
    const p2 = path.join(root, 'Two.txt');
    fs.writeFileSync(p1, '第一章 同文\n同一内容重复。', 'utf8');
    fs.writeFileSync(p2, '第一章 同文\n同一内容重复。', 'utf8');
    const c1 = await analyzeDiscoveredCandidate({
      kind: 'file',
      absolutePath: p1,
      label: 'One.txt',
      extension: '.txt',
    });
    const c2 = await analyzeDiscoveredCandidate({
      kind: 'file',
      absolutePath: p2,
      label: 'Two.txt',
      extension: '.txt',
    });
    expect(c1.contentFingerprint).toBe(c2.contentFingerprint);
    annotateCrossCandidateDuplicates([c1, c2]);
    expect(c1.warnings.some((w) => w.code === 'DUPLICATE_CONTENT')).toBe(true);
    expect(proposeCandidateAction(c1, []).proposedAction).toBe('NEEDS_ATTENTION');
  });

  it('title-only match is NEEDS_ATTENTION; fingerprint match is UPDATE', async () => {
    const root = tmp('upd-');
    const file = path.join(root, 'Known Novel.txt');
    fs.writeFileSync(file, '第1章\nbody text enough for chapters', 'utf8');
    const analyzed = await analyzeDiscoveredCandidate({
      kind: 'file',
      absolutePath: file,
      label: 'Known Novel.txt',
      extension: '.txt',
    });
    const byTitle = proposeCandidateAction(analyzed, [
      {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Known Novel',
        sourceFolderPath: null,
        sourceIdentityKey: null,
        sourceContentFingerprint: null,
      },
    ]);
    expect(byTitle.proposedAction).toBe('NEEDS_ATTENTION');

    const byFp = proposeCandidateAction(analyzed, [
      {
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Other Title',
        sourceFolderPath: null,
        sourceIdentityKey: null,
        sourceContentFingerprint: analyzed.contentFingerprint,
      },
    ]);
    expect(byFp.proposedAction).toBe('UPDATE_EXISTING');
    expect(byFp.matchedProjectId).toBe('22222222-2222-4222-8222-222222222222');
  });
});
