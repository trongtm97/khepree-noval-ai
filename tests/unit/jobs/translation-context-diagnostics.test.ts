import { describe, expect, it } from 'vitest';
import {
  formatDiagnosticsAiChannel,
  formatDiagnosticsContextMode,
  formatDiagnosticsGroundingWarning,
  formatDiagnosticsKnowledgeVersions,
  formatDiagnosticsMemorySurface,
  formatDiagnosticsPackModeTooltip,
  readDiagnosticsFromProgress,
} from '@shared/constants/translation-context';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import { DatabaseManager } from '@main/db/database-manager';
import { buildTranslationContextDiagnostics } from '@main/jobs/translation-context-diagnostics';

describe('translation context diagnostics formatters', () => {
  it('labels Gemini Browser channel', () => {
    expect(formatDiagnosticsAiChannel('PLAYWRIGHT_GEMINI')).toBe('Gemini Browser');
    expect(formatDiagnosticsAiChannel('GEMINI_WEB_API')).toBe('Gemini Web API');
  });

  it('local_context → SQLite local memory', () => {
    const d = {
      packMode: 'local_context' as const,
      notebookGroundingVerified: false,
      providerType: 'GEMINI_WEB_API',
      localKnowledgeVersion: 48,
      notebookKnowledgeVersion: 0,
    };
    expect(formatDiagnosticsMemorySurface(d)).toBe('SQLite local memory');
    expect(formatDiagnosticsContextMode(d)).toBe('Bộ nhớ cục bộ (Local Context)');
    expect(formatDiagnosticsPackModeTooltip(d)).toBe('LOCAL_CONTEXT — SQLite v48');
    expect(formatDiagnosticsGroundingWarning(d)).toBeNull();
  });

  it('notebook_assisted shows version pair + warning when unverified', () => {
    const d = {
      packMode: 'notebook_assisted' as const,
      notebookGroundingVerified: false,
      providerType: 'PLAYWRIGHT_GEMINI',
      localKnowledgeVersion: 48,
      notebookKnowledgeVersion: 47,
    };
    expect(formatDiagnosticsContextMode(d)).toBe('Notebook + ngữ cảnh cục bộ');
    expect(formatDiagnosticsPackModeTooltip(d)).toBe(
      'NOTEBOOK_ASSISTED — Notebook v47 + local v48',
    );
    expect(formatDiagnosticsGroundingWarning(d)).toBe(
      'Notebook chưa xác minh — đang dùng ngữ cảnh cục bộ.',
    );
    expect(formatDiagnosticsKnowledgeVersions(d)).toBe('v47 / v48');
  });

  it('legacy slim in progress normalizes to local_context', () => {
    const d = readDiagnosticsFromProgress({
      providerType: 'PLAYWRIGHT_GEMINI',
      packMode: 'slim',
      notebookId: 'nb-1',
      notebookName: '[NovelTrans][Translation] Tiên Nghịch',
      localKnowledgeVersion: 48,
      knowledgeSourceMode: 'LOCAL_ONLY',
      hotDeltaCount: 0,
    });
    expect(d?.packMode).toBe('local_context');
    expect(d?.knowledgeSourceMode).toBe('LOCAL_ONLY');
  });
});

describe('buildTranslationContextDiagnostics', () => {
  let db: DatabaseManager;
  let tmp: string;
  let projectId: string;
  let accountId: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-diag-'));
    db = new DatabaseManager({ dataDir: tmp, backupsDir: path.join(tmp, 'bak') });
    projectId = db.projects.create({ title: 'Diag Novel' }).id;
    accountId = db.googleAccounts.create({
      label: 'W',
      email: 'diag@test.com',
      displayName: 'W',
      profileDirName: 'profile-diag',
      status: 'READY',
    }).id;
    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: accountId,
      notebook_name: '[NovelTrans][Translation] Tiên Nghịch',
      notebook_role: 'TRANSLATION',
      notebook_id: 'nb-tien',
      resource_url: 'https://notebook.google.com/x',
      status: 'ready',
      instructions_hash: 'h',
    });
  });

  afterEach(() => {
    db.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('local_context default → LOCAL_ONLY, no grounding claim', () => {
    const d = buildTranslationContextDiagnostics(db, {
      projectId,
      accountId,
      providerType: 'PLAYWRIGHT_GEMINI',
      packDecision: {
        packMode: 'local_context',
        notebookId: null,
        localKnowledgeVersion: 48,
        notebookVerifiedVersion: 0,
        sourceGroundingConfirmed: false,
        reason: 'local_context_default',
        hotDeltaCount: 0,
      },
    });
    expect(d.notebookGroundingVerified).toBe(false);
    expect(d.knowledgeSourceMode).toBe('LOCAL_ONLY');
    expect(d.packMode).toBe('local_context');
  });

  it('notebook_assisted → notebook role preserved', () => {
    const d = buildTranslationContextDiagnostics(db, {
      projectId,
      accountId,
      providerType: 'PLAYWRIGHT_GEMINI',
      packDecision: {
        packMode: 'notebook_assisted',
        notebookId: 'nb-tien',
        localKnowledgeVersion: 3,
        notebookVerifiedVersion: 0,
        sourceGroundingConfirmed: false,
        reason: 'notebook_assisted_explicit',
        hotDeltaCount: 2,
      },
    });
    expect(d.notebookName).toContain('Tiên Nghịch');
    expect(d.notebookRole).toBe('TRANSLATION');
    expect(d.hotDeltaCount).toBe(2);
  });
});
