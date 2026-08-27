import { describe, expect, it } from 'vitest';
import {
  formatDiagnosticsAiChannel,
  formatDiagnosticsContextMode,
  formatDiagnosticsGroundingWarning,
  formatDiagnosticsKnowledgeVersions,
  formatDiagnosticsMemorySurface,
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

  it('SLIM verified → Notebook memory + SLIM mode', () => {
    const d = {
      packMode: 'slim' as const,
      notebookGroundingVerified: true,
      providerType: 'PLAYWRIGHT_GEMINI',
      localKnowledgeVersion: 48,
      notebookKnowledgeVersion: 48,
    };
    expect(formatDiagnosticsMemorySurface(d)).toBe('Translation Notebook');
    expect(formatDiagnosticsContextMode(d)).toBe('SLIM — Notebook đã xác minh');
    expect(formatDiagnosticsKnowledgeVersions(d)).toBe('v48 / v48 ✓');
    expect(formatDiagnosticsGroundingWarning(d)).toBeNull();
  });

  it('HYBRID shows version pair + warning', () => {
    const d = {
      packMode: 'hybrid' as const,
      notebookGroundingVerified: false,
      providerType: 'PLAYWRIGHT_GEMINI',
      localKnowledgeVersion: 48,
      notebookKnowledgeVersion: 47,
    };
    expect(formatDiagnosticsContextMode(d)).toBe(
      'HYBRID — Notebook v47 + cập nhật cục bộ v48',
    );
    expect(formatDiagnosticsGroundingWarning(d)).toBe(
      'Notebook chưa xác minh — đang bổ sung bộ nhớ cục bộ.',
    );
    expect(formatDiagnosticsKnowledgeVersions(d)).toBe('v47 / v48');
  });

  it('FAT is local only', () => {
    expect(
      formatDiagnosticsContextMode({
        packMode: 'fat',
        notebookGroundingVerified: false,
        localKnowledgeVersion: 1,
        notebookKnowledgeVersion: 0,
      }),
    ).toBe('FAT — SQLite local memory');
  });

  it('never claims full Notebook when grounding false on Browser', () => {
    const warn = formatDiagnosticsGroundingWarning({
      providerType: 'PLAYWRIGHT_GEMINI',
      notebookGroundingVerified: false,
      packMode: 'slim',
    });
    expect(warn).toContain('chưa xác minh');
    expect(warn).not.toMatch(/đầy đủ/i);
  });

  it('reads diagnostics from progress JSON', () => {
    const d = readDiagnosticsFromProgress({
      providerType: 'PLAYWRIGHT_GEMINI',
      packMode: 'slim',
      notebookId: 'nb-1',
      notebookName: '[NovelTrans][Translation] Tiên Nghịch',
      notebookGroundingVerified: true,
      localKnowledgeVersion: 48,
      notebookKnowledgeVersion: 48,
      knowledgeSourceMode: 'DRIVE_LIVE',
      hotDeltaCount: 0,
    });
    expect(d?.notebookName).toContain('Tiên Nghịch');
    expect(d?.knowledgeSourceMode).toBe('DRIVE_LIVE');
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
    db?.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('SLIM ready_verified → grounding true + notebook name', () => {
    const d = buildTranslationContextDiagnostics(db, {
      projectId,
      accountId,
      providerType: 'PLAYWRIGHT_GEMINI',
      packDecision: {
        packMode: 'slim',
        notebookId: 'nb-tien',
        localKnowledgeVersion: 48,
        notebookVerifiedVersion: 48,
        sourceGroundingConfirmed: true,
        reason: 'ready_verified',
        hotDeltaCount: 0,
      },
    });
    expect(d.notebookGroundingVerified).toBe(true);
    expect(d.notebookName).toContain('Tiên Nghịch');
    expect(d.notebookRole).toBe('TRANSLATION');
    expect(d.packMode).toBe('slim');
  });

  it('FAT → LOCAL_ONLY and no grounding', () => {
    const d = buildTranslationContextDiagnostics(db, {
      projectId,
      accountId,
      providerType: 'GEMINI_WEB_API',
      packDecision: {
        packMode: 'fat',
        notebookId: null,
        localKnowledgeVersion: 3,
        notebookVerifiedVersion: 0,
        sourceGroundingConfirmed: false,
        reason: 'webapi_always_fat',
        hotDeltaCount: 2,
      },
    });
    expect(d.knowledgeSourceMode).toBe('LOCAL_ONLY');
    expect(d.notebookGroundingVerified).toBe(false);
    expect(d.hotDeltaCount).toBe(2);
  });
});
