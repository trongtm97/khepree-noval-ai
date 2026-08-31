import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../../../src/main/db/database-manager';
import { NotebookSyncService } from '../../../src/main/notebook/notebook-sync-service';
import { buildActiveHotMemoryText } from '../../../src/main/notebook/hot-memory-builder';
import { applyTermDelta } from '../../../src/main/learning/term-delta-processor';
import { runKnowledgeVersionProbe } from '../../../src/main/notebook/notebook-version-probe';
import { buildTranslationPack } from '../../../src/main/prompt/translation-pack-builder';
import type { MemoryContextDto } from '@shared/schemas/memory';

async function seedVerifiedNotebook(
  db: DatabaseManager,
  projectId: string,
  accountId: string,
  version = 1,
  nonce = 'AABB0001',
): Promise<void> {
  db.notebooks.upsert({
    project_id: projectId,
    google_account_id: accountId,
    notebook_name: '[Khepree] Hot',
    notebook_role: 'SINGLE',
    status: 'ready',
    instructions_hash: 'hash',
  });
  db.driveSyncState.patch(projectId, {
    pendingKnowledgeVersion: version,
    pendingSyncNonce: nonce,
    versionProbeStatus: 'pending',
  });
  await runKnowledgeVersionProbe(db, {
    projectId,
    accountId,
    capture: () => Promise.resolve(`NT_VERSION=${version}\nNT_NONCE=${nonce}`),
  });
  // Push watermark into the past so subsequent SQLite facts always count as hot deltas.
  const mapping = db.notebooks.listByProject(projectId)[0];
  db.getConnection()
    .prepare(`UPDATE notebook_resources SET last_verified_at = ? WHERE id = ?`)
    .run('2020-01-01T00:00:00.000Z', mapping.id);
  for (const type of [
    'book_profile',
    'translation_rules',
    'project_terms',
    'characters',
    'relationships',
    'story_state',
    'world_knowledge',
    'recent_context',
    'sync_state',
  ] as const) {
    db.getConnection()
      .prepare(
        `UPDATE knowledge_files SET last_verified_at = ? WHERE project_id = ? AND knowledge_type = ?`,
      )
      .run('2020-01-01T00:00:00.000Z', projectId, type);
  }
}

describe('Notebook Hot Memory (structured SQLite deltas)', () => {
  let db: DatabaseManager;
  let tmp: string;
  let projectId: string;
  let accountId: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-hot-'));
    db = new DatabaseManager({ dataDir: tmp, backupsDir: path.join(tmp, 'bak') });
    const project = db.projects.create({
      title: 'Hot Memory Novel',
      source_language: 'zh',
      target_language: 'vi',
    });
    projectId = project.id;
    const account = db.googleAccounts.create({
      label: 'Worker',
      email: 'worker@test.com',
      displayName: 'Worker',
      profileDirName: 'profile-hot',
      status: 'READY',
    });
    accountId = account.id;
    db.chapters.create({
      project_id: projectId,
      chapter_number: 450,
      sequence_order: 450,
      source_text: '王林得到天逆珠。',
    });
  });

  afterEach(() => {
    db.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('buildActiveHotMemoryText uses actual term mapping, not status messages', async () => {
    const sync = new NotebookSyncService(db);
    await seedVerifiedNotebook(db, projectId, accountId);

    applyTermDelta(
      db,
      [
        {
          action: 'confirm',
          source: '天逆珠',
          target: 'Thiên Nghịch Châu',
        },
      ],
      { projectId, chapterNumber: 450 },
    );
    const term = db.terms.findBySource('天逆珠', projectId);
    expect(term).toBeTruthy();
    if (term) db.terms.lock(term.id, true);

    sync.markDirty(projectId, 'TERM_CHANGED');

    // Ensure SQLite fact timestamps are strictly after Notebook verify watermark.
    const after = new Date(Date.now() + 10).toISOString();
    const termRow = db.terms.findBySource('天逆珠', projectId);
    if (termRow) {
      db.getConnection()
        .prepare(`UPDATE terms SET updated_at = ? WHERE id = ?`)
        .run(after, termRow.id);
    }

    const hot = buildActiveHotMemoryText(db, projectId, { anchorChapter: 450 });
    expect(hot).toContain('## HOT MEMORY — active wave / queue deltas');
    expect(hot).toContain('天逆珠');
    expect(hot).toContain('Thiên Nghịch Châu');
    expect(hot).toContain('[LOCKED]');
    expect(hot).not.toMatch(/delta after job/i);
    expect(hot).not.toMatch(/Term delta:/i);
  });

  it('excludes future-sensitive facts before valid chapter', async () => {
    const sync = new NotebookSyncService(db);
    await seedVerifiedNotebook(db, projectId, accountId);

    const ch = db.characters.create({
      project_id: projectId,
      canonical_name: '王林',
      translated_name: 'Vương Lâm',
      role: 'protagonist',
      first_chapter: 500,
    });
    db.getConnection()
      .prepare(`UPDATE characters SET future_sensitive = 1, updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), ch.id);

    sync.markDirty(projectId, 'CHARACTER_CHANGED');

    const after = new Date(Date.now() + 10).toISOString();
    db.getConnection()
      .prepare(`UPDATE characters SET updated_at = ? WHERE id = ?`)
      .run(after, ch.id);

    const early = buildActiveHotMemoryText(db, projectId, { anchorChapter: 450 });
    expect(early).not.toContain('王林');

    const late = buildActiveHotMemoryText(db, projectId, { anchorChapter: 500 });
    expect(late).toContain('王林');
    expect(late).toContain('Vương Lâm');
  });

  it('pack contains actual term after stale; clear only after Notebook verified', async () => {
    const sync = new NotebookSyncService(db);
    await seedVerifiedNotebook(db, projectId, accountId, 1, 'AABB0001');

    applyTermDelta(
      db,
      [{ action: 'confirm', source: '王林', target: 'Vương Lâm' }],
      { projectId, chapterNumber: 450 },
    );
    sync.markDirty(projectId, 'TERM_CHANGED');

    const afterDirty = new Date(Date.now() + 10).toISOString();
    const termRow = db.terms.findBySource('王林', projectId);
    if (termRow) {
      db.getConnection()
        .prepare(`UPDATE terms SET updated_at = ? WHERE id = ?`)
        .run(afterDirty, termRow.id);
    }

    const chapter = db.chapters.getByProjectAndNumber(projectId, 450);
    if (!chapter) throw new Error('expected chapter 450');
    const hot = sync.buildActiveHotMemoryText(projectId, { anchorChapter: 450 });
    expect(hot).toContain('王林');
    expect(hot).toContain('Vương Lâm');

    const emptyContext: MemoryContextDto = {
      activeTerms: [],
      activeCharacters: [],
      relationships: [],
      recentMemory: [],
      criticalProjectRules: [],
      storyState: undefined,
      anchorChapter: 450,
      recentWindow: { fromChapter: 450, toChapter: 450 },
      budget: { limit: 2000, estimated: 0, dropped: 0 },
    };
    const pack = buildTranslationPack(db, {
      projectId,
      chapterIds: [chapter.id],
      style: 'balanced',
      context: emptyContext,
      packMode: 'local_context',
      hotMemoryOverride: hot,
    });
    expect(pack.sections.hotMemoryDelta).toContain('王林 → Vương Lâm');
    expect(pack.sections.hotMemoryDelta).not.toMatch(/Character delta after/i);

    // Name-only verify must NOT clear hot:
    (
      sync as unknown as {
        markNotebookVerified: (projectId: string, accountId: string) => void;
      }
    ).markNotebookVerified(projectId, accountId);
    expect(sync.buildActiveHotMemoryText(projectId, { anchorChapter: 450 })).toContain('王林');

    // CONTENT_CURRENT probe clears hot
    db.driveSyncState.patch(projectId, {
      pendingKnowledgeVersion: 2,
      pendingSyncNonce: 'AABB0002',
      versionProbeStatus: 'pending',
    });
    await runKnowledgeVersionProbe(db, {
      projectId,
      accountId,
      capture: () => Promise.resolve('NT_VERSION=2\nNT_NONCE=AABB0002'),
    });
    expect(db.notebookHotDeltas.listActive(projectId)).toHaveLength(0);
    expect(db.knowledgeFiles.anyDirty(projectId)).toBe(false);
    expect(sync.getHealth(projectId, accountId).knowledgeVerified).toBe(true);
    expect(sync.getHealth(projectId, accountId).status).toBe('ready');
    // CONTENT_CURRENT + clean → no structured hot overrides
    expect(
      sync.buildActiveHotMemoryText(projectId, { anchorChapter: 450 }),
    ).toBe('');
  });

  it('rejects status-message hotPayload inserts', () => {
    const sync = new NotebookSyncService(db);
    sync.markDirty(
      projectId,
      'CHARACTER_CHANGED',
      'Character delta after job abc (ch.1)',
    );
    expect(db.notebookHotDeltas.listActive(projectId)).toHaveLength(0);
  });
});
