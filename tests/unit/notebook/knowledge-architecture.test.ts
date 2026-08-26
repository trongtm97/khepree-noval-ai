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
    db?.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('builds all 8 knowledge files deterministically', () => {
    const builder = new NotebookKnowledgeBuilder(db);
    const a = builder.buildAll(projectId);
    const b = builder.buildAll(projectId);
    expect(Object.keys(a)).toHaveLength(8);
    expect(a['00_BOOK_PROFILE.md']).toContain('Tiên Nghịch');
    expect(a['01_TRANSLATION_RULES.md']).toContain('Knowledge Priority');
    expect(a['06_WORLD_KNOWLEDGE.md']).toBeTruthy();
    expect(a['07_RECENT_CONTEXT.md']).toBeTruthy();
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
    const before = db.knowledgeFiles.get(projectId, 'story_state')!;
    db.storyStates.patch(projectId, { summaryText: 'New state' });
    builder.rebuildAndTrack(projectId);
    const after = db.knowledgeFiles.get(projectId, 'story_state')!;
    expect(after.content_hash).not.toBe(before.content_hash);
    expect(after.dirty).toBe(1);
  });

  it('keeps knowledge under size caps even with many terms', () => {
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
    expect(content.length).toBeLessThanOrEqual(KNOWLEDGE_SIZE_CAPS.project_terms);
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
    db?.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('marks dirty and builds hot memory text', () => {
    const sync = new NotebookSyncService(db);
    sync.markDirty(projectId, 'STORY_STATE_CHANGED', '王林 đột phá Nguyên Anh');
    const hot = sync.buildActiveHotMemoryText(projectId);
    expect(hot).toContain('Nguyên Anh');
    expect(db.knowledgeFiles.anyDirty(projectId)).toBe(true);
  });

  it('clears hot deltas on verify', () => {
    const sync = new NotebookSyncService(db);
    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: accountId,
      notebook_name: '[NovelTrans] Test',
      status: 'sync_pending',
    });
    sync.markDirty(projectId, 'TERM_CHANGED', 'locked term');
    sync.markNotebookVerified(projectId, accountId);
    expect(sync.buildActiveHotMemoryText(projectId)).toBe('');
    expect(db.knowledgeFiles.anyDirty(projectId)).toBe(false);
  });
});

describe('slim vs fat TranslationPack', () => {
  it('slim pack omits full story dump and prefers locked overrides', () => {
    const slim = assemblePackSections({
      style: 'balanced',
      chapterNumbers: [1],
      criticalRules: [],
      context: FIXED_CONTEXT,
      sourceLines: ['[C000001:P000001] 王林走了。'],
      packMode: 'slim',
      hotMemoryOverride: '## Hot Memory\n- breakthrough',
    });
    expect(slim.prompt).toContain('Hot Memory');
    expect(slim.prompt).toContain('breakthrough');
    expect(slim.prompt).toContain('王林');
    expect(slim.prompt).not.toContain('Should not appear in slim pack body dump');
    expect(slim.sections.activeProjectTerms).toContain('LOCKED');
  });

  it('fat pack includes story snapshot', () => {
    const fat = assemblePackSections({
      style: 'balanced',
      chapterNumbers: [1],
      criticalRules: ['keep tone'],
      context: FIXED_CONTEXT,
      sourceLines: ['[C000001:P000001] 王林走了。'],
      packMode: 'fat',
    });
    expect(fat.prompt).toContain('Should not appear in slim pack body dump');
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
    db?.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('seeds story state from metadata and early chapters', () => {
    const result = new NotebookBootstrapService(db).bootstrap(projectId, { seed: true });
    expect(result.seeded).toBe(true);
    const story = db.storyStates.parseStructured(db.storyStates.getByProject(projectId)!);
    expect(story.summaryText).toContain('Nhân vật chính');
    expect(story.worldKnowledge).toBeTruthy();
    expect(db.knowledgeFiles.get(projectId, 'book_profile')?.content_hash).toBeTruthy();
  });
});
