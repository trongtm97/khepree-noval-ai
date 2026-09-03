import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '@main/db/database-manager';
import { NotebookSyncService } from '@main/notebook/notebook-sync-service';
import {
  applyVersionProbeResult,
  runKnowledgeVersionProbe,
} from '@main/notebook/notebook-version-probe';
import { LEGACY_NOTEBOOK_BINDING_DRIVE_LIVE } from '@shared/constants/legacy-knowledge-events';
import { resolveTranslationPackMode } from '@main/prompt/pack-mode-resolver';
import {
  buildSyncStateManifestContent,
  evaluateVersionProbeResponse,
  parseSyncStateManifestContent,
} from '@shared/constants/notebook-version-probe';

describe('sync-state manifest + version probe', () => {
  it('builds and parses manifest', () => {
    const content = buildSyncStateManifestContent({
      projectId: 'proj-1',
      knowledgeVersion: 47,
      syncNonce: '8F7A2C19',
    });
    expect(content).toContain('KHEPREE_NOVEL_AI_KNOWLEDGE_VERSION=47');
    expect(content).toContain('KHEPREE_NOVEL_AI_SYNC_NONCE=8F7A2C19');
    const parsed = parseSyncStateManifestContent(content);
    expect(parsed).toEqual({
      projectId: 'proj-1',
      knowledgeVersion: 47,
      syncNonce: '8F7A2C19',
    });
  });

  it('parses legacy NovelTrans manifest keys', () => {
    const legacy = [
      '# NovelTrans sync state',
      'NOVELTRANS_PROJECT_ID=legacy-proj',
      'NOVELTRANS_KNOWLEDGE_VERSION=12',
      'NOVELTRANS_SYNC_NONCE=ABCD1234',
    ].join('\n');
    expect(parseSyncStateManifestContent(legacy)).toEqual({
      projectId: 'legacy-proj',
      knowledgeVersion: 12,
      syncNonce: 'ABCD1234',
    });
  });

  it('evaluates matching / mismatch / unverified', () => {
    const expected = { knowledgeVersion: 47, syncNonce: '8F7A2C19' };
    expect(
      evaluateVersionProbeResponse('NT_VERSION=47\nNT_NONCE=8F7A2C19', expected).status,
    ).toBe('verified');
    expect(
      evaluateVersionProbeResponse('NT_VERSION=46\nNT_NONCE=8F7A2C19', expected).status,
    ).toBe('mismatch');
    expect(
      evaluateVersionProbeResponse('I think the version is 47', expected).status,
    ).toBe('unverified');
  });
});

describe('CONTENT_CURRENT vs SOURCE_PRESENT', () => {
  let db: DatabaseManager;
  let tmp: string;
  let projectId: string;
  let accountId: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-ver-probe-'));
    db = new DatabaseManager({ dataDir: tmp, backupsDir: path.join(tmp, 'bak') });
    const project = db.projects.create({
      title: 'Version Probe Novel',
      source_language: 'zh',
      target_language: 'vi',
    });
    projectId = project.id;
    const account = db.googleAccounts.create({
      label: 'Worker',
      email: 'probe@test.com',
      displayName: 'Worker',
      profileDirName: 'profile-probe',
      status: 'READY',
    });
    accountId = account.id;

    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: accountId,
      notebook_name: '[Khepree] Probe',
      notebook_role: 'SINGLE',
      notebook_id: 'nb-probe',
      resource_url: 'https://notebook.google.com/x',
      status: 'sync_pending',
    });
    db.notebookSourceBindings.upsert({
      projectId,
      notebookId: 'nb-probe',
      knowledgeType: 'sync_state',
      sourceName: '08_SYNC_STATE',
      bindingType: LEGACY_NOTEBOOK_BINDING_DRIVE_LIVE,
      status: 'active',
      driveFileId: 'drive-sync',
    });
    db.knowledgeSyncState.patch(projectId, {
      pendingKnowledgeVersion: 47,
      pendingSyncNonce: '8F7A2C19',
      versionProbeStatus: 'pending',
    });
  });

  afterEach(() => {
    db.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('old Notebook version → HYBRID, not slim; hot not cleared', () => {
    const sync = new NotebookSyncService(db);
    sync.markDirty(projectId, 'TERM_CHANGED', '天逆珠 → Thiên Nghịch Châu [LOCKED]');
    expect(db.notebookHotDeltas.listActive(projectId).length).toBeGreaterThan(0);

    const result = applyVersionProbeResult(db, {
      projectId,
      accountId,
      rawResponse: 'NT_VERSION=46\nNT_NONCE=8F7A2C19',
    });
    expect(result.status).toBe('mismatch');
    expect(result.packHint).toBe('hybrid');
    expect(db.notebookHotDeltas.listActive(projectId).length).toBeGreaterThan(0);

    const mode = resolveTranslationPackMode(db, {
      projectId,
      accountId,
      providerType: 'PLAYWRIGHT_GEMINI',
      preferNotebookPack: true,
    });
    expect(mode.packMode).toBe('notebook_assisted');
  });

  it('matching version+nonce → verified, clears hot; pack mode still notebook_assisted when explicit', async () => {
    const sync = new NotebookSyncService(db);
    sync.markDirty(projectId, 'TERM_CHANGED', '天逆珠 → Thiên Nghịch Châu [LOCKED]');

    const result = await runKnowledgeVersionProbe(db, {
      projectId,
      accountId,
      capture: () => Promise.resolve('NT_VERSION=47\nNT_NONCE=8F7A2C19'),
    });
    expect(result.status).toBe('verified');
    expect(db.notebookHotDeltas.listActive(projectId)).toHaveLength(0);

    const state = db.knowledgeSyncState.ensure(projectId);
    expect(state.version_probe_status).toBe('verified');
    expect(state.verified_knowledge_version).toBe(47);

    const health = sync.getHealth(projectId, accountId);
    expect(health.knowledgeVerified).toBe(true);
    expect(health.usableForSlimPack).toBe(true);

    const mode = resolveTranslationPackMode(db, {
      projectId,
      accountId,
      providerType: 'PLAYWRIGHT_GEMINI',
      preferNotebookPack: true,
    });
    expect(mode.packMode).toBe('notebook_assisted');
  });

  it('fake source same name but old content → verification fail; pack notebook_assisted when explicit', async () => {
    // Pending is 48/NEW — Notebook still answers with old 47/OLD (filename present, content stale).
    db.knowledgeSyncState.patch(projectId, {
      pendingKnowledgeVersion: 48,
      pendingSyncNonce: 'AABBCCDD',
      versionProbeStatus: 'pending',
    });

    const result = await runKnowledgeVersionProbe(db, {
      projectId,
      accountId,
      capture: () => Promise.resolve('NT_VERSION=47\nNT_NONCE=8F7A2C19'),
    });
    expect(result.status).toBe('mismatch');
    expect(db.knowledgeSyncState.ensure(projectId).version_probe_status).toBe('mismatch');

    const mode = resolveTranslationPackMode(db, {
      projectId,
      accountId,
      providerType: 'PLAYWRIGHT_GEMINI',
      preferNotebookPack: true,
    });
    expect(mode.packMode).toBe('notebook_assisted');
  });

  it('markNotebookVerified without probe does not clear hot', () => {
    const sync = new NotebookSyncService(db);
    sync.markDirty(projectId, 'TERM_CHANGED', '天逆珠 → Thiên Nghịch Châu [LOCKED]');
    const before = db.notebookHotDeltas.listActive(projectId).length;
    (
      sync as unknown as {
        markNotebookVerified: (projectId: string, accountId: string) => void;
      }
    ).markNotebookVerified(projectId, accountId);
    expect(db.notebookHotDeltas.listActive(projectId)).toHaveLength(before);
  });
});
