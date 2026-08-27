import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseManager } from '../../../src/main/db/database-manager';
import { NotebookSyncService } from '../../../src/main/notebook/notebook-sync-service';
import { buildMemoryContext } from '../../../src/main/memory/context-selector';
import { PACK_CANDIDATE_MIN_CONFIDENCE } from '@shared/constants/learning';

describe('consecutive chapter freshness hardening', () => {
  let db: DatabaseManager;
  let tmp: string;
  let projectId: string;
  let accountId: string;
  let accountIdB: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-fresh-'));
    db = new DatabaseManager({ dataDir: tmp, backupsDir: path.join(tmp, 'bak') });
    projectId = db.projects.create({
      title: 'Fresh Test',
      source_language: 'zh',
      target_language: 'vi',
    }).id;
    const account = db.googleAccounts.create({
      label: 'A',
      email: 'a@test.com',
      displayName: 'A',
      profileDirName: 'profile-a',
      status: 'READY',
    });
    accountId = account.id;
    const accountB = db.googleAccounts.create({
      label: 'B',
      email: 'b@test.com',
      displayName: 'B',
      profileDirName: 'profile-b',
      status: 'READY',
    });
    accountIdB = accountB.id;
  });

  afterEach(() => {
    db.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('markDirty stales ready and sync_pending for every worker mapping', () => {
    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: accountId,
      notebook_name: '[NovelTrans] A',
      status: 'ready',
    });
    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: accountIdB,
      notebook_name: '[NovelTrans] B',
      status: 'sync_pending',
    });

    const sync = new NotebookSyncService(db);
    sync.markDirty(projectId, 'TERM_CHANGED', 'new term after PASS');

    const mappings = db.notebooks.listByProject(projectId);
    expect(mappings).toHaveLength(2);
    expect(mappings.every((m) => m.status === 'stale')).toBe(true);

    const healthA = sync.getHealth(projectId, accountId);
    const healthB = sync.getHealth(projectId, accountIdB);
    expect(healthA.usableForSlimPack).toBe(false);
    expect(healthB.usableForSlimPack).toBe(false);
  });

  it('claimNext prefers lower chapter_from at equal priority', () => {
    const worker = db.workerStates.getByAccountId(accountId);
    if (!worker) throw new Error('missing worker');
    db.workerStates.setHealth(worker.id, 'READY');

    const later = db.jobs.create({
      project_id: projectId,
      type: 'translate_batch',
      state: 'QUEUED',
      priority: 50,
      chapter_from: 9,
      chapter_to: 9,
      worker_mode: 'POOL',
      config: '{}',
    });
    const earlier = db.jobs.create({
      project_id: projectId,
      type: 'translate_batch',
      state: 'QUEUED',
      priority: 50,
      chapter_from: 7,
      chapter_to: 7,
      worker_mode: 'POOL',
      config: '{}',
    });

    const claimed = db.jobs.claimNext({
      leaseOwner: 'test-lease',
      leaseMs: 60_000,
      workerId: worker.id,
      accountId,
    });
    expect(claimed?.id).toBe(earlier.id);
    expect(claimed?.chapter_from).toBe(7);
    expect(claimed?.id).not.toBe(later.id);
  });

  it('high-confidence pending candidates enter pack activeTerms', () => {
    const chapter = db.chapters.create({
      project_id: projectId,
      chapter_number: 8,
      sequence_order: 8,
      display_title: 'Ch 8',
      source_text: '韩立见到了南宫婉。',
    });
    db.paragraphs.create({
      chapter_id: chapter.id,
      paragraph_id: '[C000008:P000001]',
      sequence: 1,
      source_text: '韩立见到了南宫婉。',
    });

    db.termCandidates.upsertCandidate({
      project_id: projectId,
      source_text: '南宫婉',
      suggested_type: 'PERSON',
      suggested_translation: 'Nam Cung Uyển',
      confidence: PACK_CANDIDATE_MIN_CONFIDENCE,
      frequency: 3,
    });
    db.termCandidates.upsertCandidate({
      project_id: projectId,
      source_text: '临时词',
      suggested_type: 'OTHER',
      suggested_translation: 'tạm',
      confidence: 0.2,
      frequency: 1,
    });

    const ctx = buildMemoryContext(
      db,
      { projectId, chapterIds: [chapter.id] },
      () => null,
      () => {
        throw new Error('unexpected relationship mapping in candidate pack test');
      },
    );

    const hit = ctx.activeTerms.find((t) => t.sourceText === '南宫婉');
    expect(hit?.preferredTranslation).toBe('Nam Cung Uyển');
    expect(ctx.activeTerms.some((t) => t.sourceText === '临时词')).toBe(false);
  });
});
