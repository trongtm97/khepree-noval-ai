import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseManager } from '@main/db/database-manager';
import {
  buildTermMatchIndex,
  matchKnownTermsInText,
} from '@main/terms/term-matcher';
import { collectMatchKeys, adaptersForSourceLanguage } from '@main/terms/term-language-adapter';
import { chineseTermAdapter } from '@main/terms/adapters/chinese-term-adapter';

describe('multilingual term vault', () => {
  let dataDir: string;
  let backupsDir: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-terms-'));
    backupsDir = path.join(dataDir, 'backups');
    fs.mkdirSync(backupsDir);
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('keeps zh→vi and zh→en translations for same source in parallel', () => {
    const db = createDatabaseManager({ dataDir, backupsDir });
    const project = db.projects.create({ title: 'Pair Test' });

    const vi = db.terms.create({
      source_text: '王林',
      source_simplified: '王林',
      source_language: 'zh-Hans',
      target_language: 'vi',
      scope: 'PROJECT',
      scope_ref: project.id,
      status: 'PROJECT_VERIFIED',
      locked: true,
      preferred_translation: 'Vương Lâm',
      pinyin: 'Wang Lin',
      source_traditional: '王林',
    });
    const en = db.terms.create({
      source_text: '王林',
      source_simplified: '王林',
      source_language: 'zh-Hans',
      target_language: 'en',
      scope: 'PROJECT',
      scope_ref: project.id,
      status: 'PROJECT_VERIFIED',
      preferred_translation: 'Wang Lin',
    });

    expect(vi.id).not.toBe(en.id);
    expect(db.terms.getPrimaryTranslation(vi.id)).toBe('Vương Lâm');
    expect(db.terms.getPrimaryTranslation(en.id)).toBe('Wang Lin');
    expect(vi.locked).toBe(1);
    expect(vi.source_language).toBe('zh-Hans');
    expect(vi.target_language).toBe('vi');
    expect(en.target_language).toBe('en');

    // Locked VI must not be overwritten by EN pair update.
    db.terms.update(en.id, { preferred_translation: 'Wang Lin (rev)' });
    expect(db.terms.getPrimaryTranslation(vi.id)).toBe('Vương Lâm');
    expect(db.terms.getPrimaryTranslation(en.id)).toBe('Wang Lin (rev)');
    expect(db.terms.getById(vi.id)?.locked).toBe(1);

    const foundVi = db.terms.findBySource('王林', project.id, {
      sourceLanguage: 'zh-Hans',
      targetLanguage: 'vi',
    });
    const foundEn = db.terms.findBySource('王林', project.id, {
      sourceLanguage: 'zh-Hans',
      targetLanguage: 'en',
    });
    expect(foundVi?.id).toBe(vi.id);
    expect(foundEn?.id).toBe(en.id);

    db.close();
  });

  it('matcher resolves pair-scoped target without cross-pair overwrite', () => {
    const db = createDatabaseManager({ dataDir, backupsDir });
    const project = db.projects.create({
      title: 'Match Pair',
      source_language: 'zh-Hans',
      target_language: 'en',
    });

    db.terms.create({
      source_text: '王林',
      source_language: 'zh-Hans',
      target_language: 'vi',
      scope: 'PROJECT',
      scope_ref: project.id,
      locked: true,
      preferred_translation: 'Vương Lâm',
    });
    const en = db.terms.create({
      source_text: '王林',
      source_language: 'zh-Hans',
      target_language: 'en',
      scope: 'PROJECT',
      scope_ref: project.id,
      preferred_translation: 'Wang Lin',
    });

    const rows = db.terms.listForMatching({
      projectId: project.id,
      sourceLanguage: 'zh-Hans',
      targetLanguage: 'en',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(en.id);

    const index = buildTermMatchIndex(rows, { sourceLanguage: 'zh-Hans' });
    const matches = matchKnownTermsInText('王林出场了', index, rows, {
      projectId: project.id,
      sourceLanguage: 'zh-Hans',
      targetLanguage: 'en',
    });
    expect(matches).toHaveLength(1);
    const hit = matches[0];
    expect(hit).toBeDefined();
    expect(hit.term.id).toBe(en.id);
    expect(db.terms.getPrimaryTranslation(hit.term.id)).toBe('Wang Lin');

    db.close();
  });

  it('migrates legacy Chinese fields into source_text + transliteration', () => {
    const db = createDatabaseManager({ dataDir, backupsDir });
    const term = db.terms.create({
      source_simplified: '筑基',
      source_traditional: '築基',
      pinyin: 'zhu ji',
      scope: 'GLOBAL',
      preferred_translation: 'Trúc Cơ',
    });
    expect(term.source_text).toBe('筑基');
    expect(term.source_language).toBe('zh-Hans');
    expect(term.target_language).toBe('vi');
    expect(term.transliteration).toBe('zhu ji');
    expect(term.transliteration_system).toBe('pinyin');
    expect(term.source_traditional).toBe('築基');
    expect(term.locked).toBe(0);

    const keys = collectMatchKeys(term, [chineseTermAdapter]);
    expect(keys).toContain('筑基');
    expect(keys).toContain('築基');
    expect(adaptersForSourceLanguage('zh-Hans')[0]?.id).toBe('zh');
    expect(adaptersForSourceLanguage('ja')).toEqual([]);

    db.close();
  });
});
