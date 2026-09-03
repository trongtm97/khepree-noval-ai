import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseManager } from '../../../src/main/db/database-manager';
import {
  NotebookKnowledgeBuilder,
  hashKnowledgeContent,
} from '../../../src/main/notebook/knowledge-builder';
import { NotebookSyncService } from '../../../src/main/notebook/notebook-sync-service';
import { runKnowledgeVersionProbe } from '../../../src/main/notebook/notebook-version-probe';
import { NotebookBootstrapService } from '../../../src/main/notebook/notebook-bootstrap-service';
import { assemblePackSections } from '../../../src/main/prompt/translation-pack-builder';
import { KNOWLEDGE_TYPES, KNOWLEDGE_SIZE_CAPS } from '@shared/constants/knowledge';
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
  recentMemory: [],
  criticalProjectRules: ['rule-should-not-be-in-slim'],
  storyState: {
    summaryText: 'Should not appear in slim pack body dump',
    currentChapterNumber: 10,
  },
  anchorChapter: 10,
  recentWindow: { fromChapter: 1, toChapter: 10 },
  budget: { limit: 4000, estimated: 100, dropped: 0 },
};

describe('NotebookKnowledgeBuilder', () => {
  let db: DatabaseManager;
  let tmp: string;
  let projectId: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-kb-'));
    db = new DatabaseManager({ dataDir: tmp, backupsDir: path.join(tmp, 'bak') });
    const project = db.projects.create({
      title: 'Tiên Nghịch',
      title_cn: '仙逆',
      source_language: 'zh',
      target_language: 'vi',
    });
    projectId = project.id;
    db.projects.updateMetadata(projectId, {
      official_summary: 'Tóm tắt chính thức ngắn.',
      genre: 'Tiên hiệp',
    });
  });

  afterEach(() => {
    db.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('builds all 9 knowledge files deterministically', () => {
    const builder = new NotebookKnowledgeBuilder(db);
    const a = builder.buildAll(projectId);
    const b = builder.buildAll(projectId);
    expect(Object.keys(a)).toHaveLength(9);
    expect(a['00_BOOK_PROFILE.md']).toContain('Tiên Nghịch');
    expect(a['01_TRANSLATION_RULES.md']).toContain('LOCKED PROJECT TERM');
    expect(a['06_WORLD_KNOWLEDGE.md']).toBeTruthy();
    expect(a['07_RECENT_CONTEXT.md']).toBeTruthy();
    expect(a['08_SYNC_STATE.md']).toContain('KHEPREE_NOVEL_AI_PROJECT_ID=');
    expect(hashKnowledgeContent(a['00_BOOK_PROFILE.md'])).toBe(
      hashKnowledgeContent(b['00_BOOK_PROFILE.md']),
    );
  });

  it('tracks content hash and dirty on rebuild', () => {
    const builder = new NotebookKnowledgeBuilder(db);
    builder.rebuildAndTrack(projectId);
    for (const type of KNOWLEDGE_TYPES) {
      const row = db.knowledgeFiles.get(projectId, type);
      expect(row?.content_hash).toBeTruthy();
    }
    const before = db.knowledgeFiles.get(projectId, 'story_state');
    if (!before) throw new Error('expected story_state knowledge file');
    db.storyStates.patch(projectId, { summaryText: 'New state' });
    builder.rebuildAndTrack(projectId);
    const after = db.knowledgeFiles.get(projectId, 'story_state');
    if (!after) throw new Error('expected story_state after rebuild');
    expect(after.content_hash).not.toBe(before.content_hash);
    expect(after.dirty).toBe(1);
  });

  it('keeps knowledge under char budget with metadata (many terms)', () => {
    for (let i = 0; i < 400; i += 1) {
      db.terms.create({
        source_simplified: `词${i}`,
        term_type: 'OTHER',
        scope: 'PROJECT',
        scope_ref: projectId,
        target_text: `từ ${i}`,
      });
    }
    const content = new NotebookKnowledgeBuilder(db).buildProjectTerms(projectId);
    expect(content.length).toBeLessThanOrEqual(KNOWLEDGE_SIZE_CAPS.project_terms + 100);
    expect(content).toMatch(/Included: \d+ terms/);
    if (content.includes('Omitted:')) {
      expect(content).toMatch(/Omitted: \d+ lower-priority terms/);
    }
  });
});

describe('NotebookSyncService hot memory', () => {
  let db: DatabaseManager;
  let tmp: string;
  let projectId: string;
  let accountId: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-sync-'));
    db = new DatabaseManager({ dataDir: tmp, backupsDir: path.join(tmp, 'bak') });
    projectId = db.projects.create({
      title: 'Test',
      source_language: 'zh',
      target_language: 'vi',
    }).id;
    const account = db.googleAccounts.create({
      label: 'Worker',
      email: 'worker@test.com',
      displayName: 'Worker',
      profileDirName: 'profile-test',
      status: 'READY',
    });
    accountId = account.id;
  });

  afterEach(() => {
    db.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('marks dirty and builds hot memory text from SQLite', async () => {
    const sync = new NotebookSyncService(db);
    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: accountId,
      notebook_name: '[Khepree] Test',
      notebook_role: 'SINGLE',
      status: 'ready',
      instructions_hash: 'abc123',
    });
    db.knowledgeSyncState.patch(projectId, {
      pendingKnowledgeVersion: 1,
      pendingSyncNonce: 'A11CE001',
      versionProbeStatus: 'pending',
    });
    await runKnowledgeVersionProbe(db, {
      projectId,
      accountId,
      capture: () => Promise.resolve('NT_VERSION=1\nNT_NONCE=A11CE001'),
    });
    db.getConnection()
      .prepare(`UPDATE notebook_resources SET last_verified_at = ? WHERE project_id = ?`)
      .run('2020-01-01T00:00:00.000Z', projectId);
    db.getConnection()
      .prepare(`UPDATE knowledge_files SET last_verified_at = ? WHERE project_id = ?`)
      .run('2020-01-01T00:00:00.000Z', projectId);
    // Ensure story update is strictly after verify watermark
    const afterVerify = new Date(Date.now() + 5).toISOString();
    db.storyStates.patch(projectId, {
      summaryText: '王林 đột phá Nguyên Anh',
      cultivationState: { realm: 'Nguyên Anh' },
    });
    db.getConnection()
      .prepare(`UPDATE story_states SET updated_at = ? WHERE project_id = ?`)
      .run(afterVerify, projectId);
    sync.markDirty(projectId, 'STORY_STATE_CHANGED');
    const hot = sync.buildActiveHotMemoryText(projectId);
    expect(hot).toContain('Nguyên Anh');
    expect(hot).not.toMatch(/delta after job/i);
    expect(db.knowledgeFiles.anyDirty(projectId)).toBe(true);
  });

  it('clears hot deltas on version probe verify', async () => {
    const sync = new NotebookSyncService(db);
    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: accountId,
      notebook_name: '[Khepree] Test',
      notebook_role: 'SINGLE',
      status: 'sync_pending',
      instructions_hash: 'abc123',
    });
    db.knowledgeSyncState.patch(projectId, {
      pendingKnowledgeVersion: 1,
      pendingSyncNonce: 'A11CE002',
      versionProbeStatus: 'pending',
    });
    await runKnowledgeVersionProbe(db, {
      projectId,
      accountId,
      capture: () => Promise.resolve('NT_VERSION=1\nNT_NONCE=A11CE002'),
    });
    db.getConnection()
      .prepare(`UPDATE notebook_resources SET last_verified_at = ? WHERE project_id = ?`)
      .run('2020-01-01T00:00:00.000Z', projectId);
    db.getConnection()
      .prepare(`UPDATE knowledge_files SET last_verified_at = ? WHERE project_id = ?`)
      .run('2020-01-01T00:00:00.000Z', projectId);

    db.terms.create({
      source_simplified: '锁词',
      preferred_translation: 'locked',
      scope: 'PROJECT',
      scope_ref: projectId,
      status: 'LOCKED',
      locked: true,
    });
    const termRow = db.terms.findBySource('锁词', projectId);
    if (!termRow) throw new Error('expected locked term');
    db.terms.linkToProject(projectId, termRow.id, 'LOCKED');
    sync.markDirty(projectId, 'TERM_CHANGED');
    const afterDirty = new Date(Date.now() + 10).toISOString();
    db.getConnection()
      .prepare(`UPDATE terms SET updated_at = ? WHERE id = ?`)
      .run(afterDirty, termRow.id);
    expect(sync.buildActiveHotMemoryText(projectId)).toContain('锁词');

    // Name-only path must not clear
    (
      sync as unknown as {
        markNotebookVerified: (projectId: string, accountId: string) => void;
      }
    ).markNotebookVerified(projectId, accountId);
    expect(sync.buildActiveHotMemoryText(projectId)).toContain('锁词');

    db.knowledgeSyncState.patch(projectId, {
      pendingKnowledgeVersion: 2,
      pendingSyncNonce: 'A11CE003',
      versionProbeStatus: 'pending',
    });
    await runKnowledgeVersionProbe(db, {
      projectId,
      accountId,
      capture: () => Promise.resolve('NT_VERSION=2\nNT_NONCE=A11CE003'),
    });
    expect(db.notebookHotDeltas.listActive(projectId)).toHaveLength(0);
    expect(db.knowledgeFiles.anyDirty(projectId)).toBe(false);
    const health = sync.getHealth(projectId, accountId);
    expect(health.instructionsReady).toBe(true);
    expect(health.knowledgeVerified).toBe(true);
    expect(health.status).toBe('ready');
    expect(sync.buildActiveHotMemoryText(projectId)).toBe('');
  });

  it('reports instructionsReady false when hash missing', () => {
    const sync = new NotebookSyncService(db);
    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: accountId,
      notebook_name: '[Khepree] Test',
      notebook_role: 'SINGLE',
      status: 'ready',
      instructions_hash: null,
    });
    const health = sync.getHealth(projectId, accountId);
    expect(health.instructionsReady).toBe(false);
  });
});

describe('local_context TranslationPack', () => {
  it('includes hot override + locked terms without full story dump in baseContext', () => {
    const pack = assemblePackSections({
      style: 'balanced',
      chapterNumbers: [1],
      criticalRules: [],
      context: FIXED_CONTEXT,
      sourceLines: ['[C000001:P000001] 王林走了。'],
      sourceLanguage: 'zh-Hans',
      targetLanguage: 'vi',
      hotMemoryOverride: '## Recent Context\n- breakthrough',
    });
    expect(pack.prompt).toContain('breakthrough');
    expect(pack.prompt).toContain('王林');
    expect(pack.sections.hotMemoryDelta).toContain('breakthrough');
    expect(pack.sections.activeProjectTerms).toContain('LOCKED');
  });

  it('local context includes selected story snapshot from ContextSelector', () => {
    const pack = assemblePackSections({
      style: 'balanced',
      chapterNumbers: [1],
      criticalRules: ['keep tone'],
      context: FIXED_CONTEXT,
      sourceLines: ['[C000001:P000001] 王林走了。'],
      sourceLanguage: 'zh-Hans',
      targetLanguage: 'vi',
    });
    expect(pack.baseContext).toContain('Should not appear in slim pack body dump');
  });
});

describe('NotebookBootstrapService', () => {
  let db: DatabaseManager;
  let tmp: string;
  let projectId: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-boot-'));
    db = new DatabaseManager({ dataDir: tmp, backupsDir: path.join(tmp, 'bak') });
    const project = db.projects.create({
      title: 'Seed Novel',
      source_language: 'zh',
      target_language: 'vi',
    });
    projectId = project.id;
    db.projects.updateMetadata(projectId, {
      official_summary: 'Nhân vật chính bắt đầu hành trình.',
      genre: 'Huyền huyễn',
    });
    const chapter = db.chapters.create({
      project_id: projectId,
      chapter_number: 1,
      sequence_order: 1,
      chapter_title: 'Chương 1',
      source_text: '王林看着远方。',
    });
    db.paragraphs.create({
      chapter_id: chapter.id,
      paragraph_id: '[C000001:P000001]',
      sequence: 1,
      source_text: '王林看着远方。',
    });
  });

  afterEach(() => {
    db.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('seeds story state from metadata and early chapters', () => {
    const result = new NotebookBootstrapService(db).bootstrap(projectId, { seed: true });
    expect(result.seeded).toBe(true);
    const storyRow = db.storyStates.getByProject(projectId);
    if (!storyRow) throw new Error('expected story state');
    const story = db.storyStates.parseStructured(storyRow);
    expect(story.summaryText).toContain('Nhân vật chính');
    expect(story.worldKnowledge).toBeTruthy();
    expect(db.knowledgeFiles.get(projectId, 'book_profile')?.content_hash).toBeTruthy();
  });
});
