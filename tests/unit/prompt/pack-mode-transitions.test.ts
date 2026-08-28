import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '@main/db/database-manager';
import { resolveTranslationPackMode } from '@main/prompt/pack-mode-resolver';
import { assemblePackSections } from '@main/prompt/translation-pack-builder';
import { formatMemoryUsage } from '@shared/constants/pack-mode';
import type { MemoryContextDto } from '@shared/schemas/memory';

const FIXED_CONTEXT: MemoryContextDto = {
  activeTerms: [
    {
      sourceText: '王林',
      preferredTranslation: 'Vương Lâm',
      type: 'PERSON',
      locked: true,
    },
    {
      sourceText: '临时',
      preferredTranslation: 'tạm thời',
      type: 'OTHER',
      locked: false,
    },
  ],
  activeCharacters: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      projectId: '22222222-2222-4222-8222-222222222222',
      canonicalName: '王林',
      translatedName: 'Vương Lâm',
      aliases: [],
      gender: 'male',
      role: 'protagonist',
      description: null,
      firstChapter: 1,
      lastChapter: 10,
      status: 'active',
      locked: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  relationships: [],
  recentMemory: [
    {
      category: 'event',
      key: 'arrival',
      value: 'town',
      chapterNumber: 1,
    },
  ],
  criticalProjectRules: ['Keep locked names exact.'],
  storyState: {
    summaryText: 'MC arrives at town.',
    currentChapterNumber: 10,
  },
  anchorChapter: 10,
  recentWindow: { fromChapter: 1, toChapter: 10 },
  budget: { limit: 4000, estimated: 100, dropped: 0 },
};

describe('formatMemoryUsage', () => {
  it('labels local_context / notebook_assisted; legacy maps to local', () => {
    expect(formatMemoryUsage('local_context')).toBe(
      'Bộ nhớ sử dụng: ngữ cảnh cục bộ (Local Context)',
    );
    expect(formatMemoryUsage('notebook_assisted')).toBe(
      'Bộ nhớ sử dụng: Notebook + ngữ cảnh cục bộ',
    );
    expect(formatMemoryUsage('slim')).toBe(
      'Bộ nhớ sử dụng: ngữ cảnh cục bộ (Local Context)',
    );
    expect(formatMemoryUsage('fat')).toBe(
      'Bộ nhớ sử dụng: ngữ cảnh cục bộ (Local Context)',
    );
  });
});

describe('resolveTranslationPackMode (Phase 4 local-first)', () => {
  let db: DatabaseManager;
  let tmp: string;
  let projectId: string;
  let accountId: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-pack-mode-'));
    db = new DatabaseManager({ dataDir: tmp, backupsDir: path.join(tmp, 'bak') });
    const project = db.projects.create({
      title: 'Pack Mode Novel',
      source_language: 'zh',
      target_language: 'vi',
    });
    projectId = project.id;
    const account = db.googleAccounts.create({
      label: 'Worker',
      email: 'pack-mode@test.com',
      displayName: 'Worker',
      profileDirName: 'profile-pack-mode',
      status: 'READY',
    });
    accountId = account.id;
  });

  afterEach(() => {
    db.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('default → local_context regardless of provider', () => {
    const web = resolveTranslationPackMode(db, {
      projectId,
      accountId,
      providerType: 'GEMINI_WEB_API',
    });
    expect(web.packMode).toBe('local_context');
    expect(web.reason).toBe('local_context_default');

    const browser = resolveTranslationPackMode(db, {
      projectId,
      accountId,
      providerType: 'PLAYWRIGHT_GEMINI',
    });
    expect(browser.packMode).toBe('local_context');
  });

  it('preferNotebookPack → notebook_assisted (explicit opt-in only)', () => {
    const d = resolveTranslationPackMode(db, {
      projectId,
      accountId,
      providerType: 'PLAYWRIGHT_GEMINI',
      preferNotebookPack: true,
    });
    expect(d.packMode).toBe('notebook_assisted');
    expect(d.reason).toBe('notebook_assisted_explicit');
  });

  it('Notebook health / sync state does not change default pack mode', () => {
    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: accountId,
      notebook_name: '[NovelTrans] Pack Mode',
      notebook_role: 'TRANSLATION',
      notebook_id: 'nb-pack-1',
      resource_url: 'https://notebook.google.com/x',
      status: 'stale',
    });
    const d = resolveTranslationPackMode(db, {
      projectId,
      accountId,
      providerType: 'PLAYWRIGHT_GEMINI',
    });
    expect(d.packMode).toBe('local_context');
  });
});

describe('local_context TranslationPack content', () => {
  it('includes ContextSelector slices + protocol, not full vault dump', () => {
    const pack = assemblePackSections({
      style: 'balanced',
      chapterNumbers: [1],
      criticalRules: FIXED_CONTEXT.criticalProjectRules,
      context: FIXED_CONTEXT,
      sourceLines: ['[C000001:P000001] 王林走了。'],
      sourceLanguage: 'zh',
      targetLanguage: 'vi',
    });
    expect(pack.prompt).toContain('Local Context');
    expect(pack.prompt).toContain('王林');
    expect(pack.prompt).toContain('LOCKED');
    expect(pack.prompt).toContain('## Output Protocol');
    expect(pack.prompt).not.toContain('mem@');
    expect(pack.baseContext).toContain('Critical Rules');
    expect(pack.baseContext).not.toContain('[C000001:P000001]');
  });

  it('character update appears in local context body', () => {
    const pack = assemblePackSections({
      style: 'balanced',
      chapterNumbers: [10],
      criticalRules: [],
      context: {
        ...FIXED_CONTEXT,
        activeCharacters: [
          {
            ...FIXED_CONTEXT.activeCharacters[0],
            translatedName: 'Vương Lâm (updated)',
            firstChapter: 10,
          },
        ],
      },
      sourceLines: ['[C000010:P000001] 王林突破了。'],
      hotMemoryOverride: [
        '## Recent Context',
        '- CHARACTER 王林 → Vương Lâm (updated); first_seen_chapter=10',
      ].join('\n'),
    });
    expect(pack.prompt).toContain('Vương Lâm (updated)');
    expect(pack.prompt).toContain('first_seen_chapter=10');
  });
});
