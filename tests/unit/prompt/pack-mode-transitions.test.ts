import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '@main/db/database-manager';
import { resolveTranslationPackMode } from '@main/prompt/pack-mode-resolver';
import { assemblePackSections } from '@main/prompt/translation-pack-builder';
import { formatMemoryUsage } from '@shared/constants/pack-mode';
import type { NotebookStatus } from '@shared/constants/notebook';
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
  criticalProjectRules: ['rule-should-not-be-in-slim'],
  storyState: {
    summaryText: 'Should not appear in slim pack body dump',
    currentChapterNumber: 10,
  },
  anchorChapter: 10,
  recentWindow: { fromChapter: 1, toChapter: 10 },
  budget: { limit: 4000, estimated: 100, dropped: 0 },
};

describe('formatMemoryUsage', () => {
  it('labels slim / hybrid / fat', () => {
    expect(formatMemoryUsage('slim')).toBe('Bộ nhớ sử dụng: Notebook');
    expect(formatMemoryUsage('hybrid')).toBe(
      'Bộ nhớ sử dụng: Notebook + cập nhật cục bộ',
    );
    expect(formatMemoryUsage('fat')).toBe('Bộ nhớ sử dụng: bộ nhớ cục bộ');
  });
});

describe('resolveTranslationPackMode transitions', () => {
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

  function seedNotebook(opts: {
    status: NotebookStatus;
    knowledgeVersion?: number;
    verify?: boolean;
    withBinding?: boolean;
    bindingStatus?: 'active' | 'needs_migration';
  }) {
    const mapping = db.notebooks.upsert({
      project_id: projectId,
      google_account_id: accountId,
      notebook_name: '[NovelTrans] Pack Mode',
      notebook_role: 'TRANSLATION',
      notebook_id: 'nb-pack-1',
      resource_url: 'https://notebook.google.com/x',
      status: opts.status,
    });
    if (opts.knowledgeVersion != null) {
      db.notebooks.bumpLocalKnowledgeVersion(mapping.id, opts.knowledgeVersion);
    }
    if (opts.verify !== false && opts.status !== 'pending') {
      db.notebooks.markVerified(mapping.id);
      if (opts.status !== 'ready') {
        db.notebooks.setStatus(mapping.id, opts.status);
      }
    }
    if (opts.withBinding !== false) {
      db.notebookSourceBindings.upsert({
        projectId,
        notebookId: 'nb-pack-1',
        knowledgeType: 'project_terms',
        sourceName: '02_PROJECT_TERMS.md',
        bindingType: 'DRIVE_LIVE',
        status: opts.bindingStatus ?? 'active',
        driveFileId: 'drive-1',
      });
    }
    return mapping;
  }

  it('WebAPI → always FAT', () => {
    seedNotebook({ status: 'ready', knowledgeVersion: 3 });
    const d = resolveTranslationPackMode(db, {
      projectId,
      accountId,
      providerType: 'GEMINI_WEB_API',
    });
    expect(d.packMode).toBe('fat');
    expect(d.reason).toBe('webapi_always_fat');
  });

  it('mapping missing → FAT', () => {
    const d = resolveTranslationPackMode(db, {
      projectId,
      accountId,
      providerType: 'PLAYWRIGHT_GEMINI',
    });
    expect(d.packMode).toBe('fat');
    expect(d.reason).toBe('mapping_missing');
  });

  it('grounding failed (needs_migration) → FAT', () => {
    seedNotebook({
      status: 'ready',
      knowledgeVersion: 2,
      bindingStatus: 'needs_migration',
    });
    const d = resolveTranslationPackMode(db, {
      projectId,
      accountId,
      providerType: 'PLAYWRIGHT_GEMINI',
    });
    expect(d.packMode).toBe('fat');
    expect(d.reason).toBe('grounding_failed');
  });

  it('sync_pending without bindings → HYBRID (not FAT)', () => {
    seedNotebook({
      status: 'sync_pending',
      knowledgeVersion: 1,
      withBinding: false,
      verify: false,
    });
    const d = resolveTranslationPackMode(db, {
      projectId,
      accountId,
      providerType: 'PLAYWRIGHT_GEMINI',
    });
    expect(d.packMode).toBe('hybrid');
    expect(d.reason).toBe('sync_pending');
  });

  it('sync_pending → HYBRID (not SLIM)', () => {
    seedNotebook({ status: 'sync_pending', knowledgeVersion: 2 });
    const d = resolveTranslationPackMode(db, {
      projectId,
      accountId,
      providerType: 'PLAYWRIGHT_GEMINI',
    });
    expect(d.packMode).toBe('hybrid');
    expect(d.reason).toBe('sync_pending');
  });

  it('stale → HYBRID', () => {
    seedNotebook({ status: 'stale', knowledgeVersion: 1 });
    const d = resolveTranslationPackMode(db, {
      projectId,
      accountId,
      providerType: 'PLAYWRIGHT_GEMINI',
    });
    expect(d.packMode).toBe('hybrid');
    expect(d.reason).toBe('stale');
  });

  it('ready + version mismatch → HYBRID', () => {
    seedNotebook({ status: 'ready', knowledgeVersion: 1 });
    db.knowledgeFiles.markDirty(projectId, 'project_terms');
    db.knowledgeFiles.markDirty(projectId, 'project_terms');

    const d = resolveTranslationPackMode(db, {
      projectId,
      accountId,
      providerType: 'PLAYWRIGHT_GEMINI',
    });
    expect(d.packMode).toBe('hybrid');
    expect(d.reason).toBe('version_unverified');
    expect(d.localKnowledgeVersion).toBeGreaterThan(d.notebookVerifiedVersion);
  });

  it('ready + verified + grounded → SLIM', () => {
    seedNotebook({ status: 'ready', knowledgeVersion: 5 });
    db.driveSyncState.patch(projectId, {
      pendingKnowledgeVersion: 5,
      pendingSyncNonce: 'AABBCCDD',
      verifiedKnowledgeVersion: 5,
      verifiedSyncNonce: 'AABBCCDD',
      versionProbeStatus: 'verified',
    });
    const d = resolveTranslationPackMode(db, {
      projectId,
      accountId,
      providerType: 'PLAYWRIGHT_GEMINI',
    });
    expect(d.packMode).toBe('slim');
    expect(d.reason).toBe('ready_verified');
    expect(d.notebookId).toBe('nb-pack-1');
    expect(d.sourceGroundingConfirmed).toBe(true);
  });

  it('actual character update appears in HYBRID pack (not status string)', () => {
    seedNotebook({ status: 'sync_pending', knowledgeVersion: 2 });
    db.driveSyncState.patch(projectId, {
      pendingKnowledgeVersion: 3,
      pendingSyncNonce: 'NEWNEW01',
      verifiedKnowledgeVersion: 2,
      verifiedSyncNonce: 'OLDOLD01',
      versionProbeStatus: 'mismatch',
    });

    const mode = resolveTranslationPackMode(db, {
      projectId,
      accountId,
      providerType: 'PLAYWRIGHT_GEMINI',
    });
    expect(mode.packMode).toBe('hybrid');

    const hybrid = assemblePackSections({
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
      packMode: 'hybrid',
      hotMemoryOverride: [
        '## HOT MEMORY — overrides stale Notebook',
        '- CHARACTER 王林 → Vương Lâm (updated); first_seen_chapter=10; valid_from_chapter=10',
      ].join('\n'),
    });

    expect(hybrid.prompt).toContain('CHARACTER 王林 → Vương Lâm (updated)');
    expect(hybrid.prompt).toContain('first_seen_chapter=10');
    expect(hybrid.prompt).not.toMatch(/Character delta after job/i);
    expect(mode.packMode).not.toBe('slim');
  });
});

describe('hybrid TranslationPack content', () => {
  it('includes local delta + locked terms + protocol, not recent-memory dump', () => {
    const hybrid = assemblePackSections({
      style: 'balanced',
      chapterNumbers: [1],
      criticalRules: ['rule-should-not-be-in-slim'],
      context: FIXED_CONTEXT,
      sourceLines: ['[C000001:P000001] 王林走了。'],
      packMode: 'hybrid',
    });
    expect(hybrid.prompt).toContain('Local Knowledge Delta');
    expect(hybrid.prompt).toContain('王林');
    expect(hybrid.prompt).toContain('Should not appear in slim pack body dump');
    expect(hybrid.sections.activeProjectTerms).toContain('LOCKED');
    expect(hybrid.prompt).toContain('## Output Protocol');
    expect(hybrid.prompt).not.toContain('mem@');
  });

  it('slim still omits story dump when no hot override', () => {
    const slim = assemblePackSections({
      style: 'balanced',
      chapterNumbers: [1],
      criticalRules: [],
      context: FIXED_CONTEXT,
      sourceLines: ['[C000001:P000001] 王林走了。'],
      packMode: 'slim',
    });
    expect(slim.prompt).not.toContain('Should not appear in slim pack body dump');
    expect(slim.prompt).toContain('Notebook cold knowledge is authoritative');
  });
});
