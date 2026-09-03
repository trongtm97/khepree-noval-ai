import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveAppPaths, pathsService } from '@main/services/paths-service';
import { createDatabaseManager, closeDatabase } from '@main/db/connection';
import type { DatabaseManager } from '@main/db/database-manager';
import {
  BrowserCircuitBreaker,
  resetBrowserCircuitBreakerForTests,
} from '@main/automation/browser-pool/circuit-breaker';
import { applyBrowserPoolAttention } from '@main/automation/browser-pool/apply-attention';
import {
  candidatesWithinBudget,
  resolveFirstVisible,
  type VersionedSelectorCatalog,
} from '@main/automation/selectors/versioned-selector';
import {
  deleteFailureDiagnostic,
  listFailureDiagnostics,
  purgeFailureDiagnosticsOlderThan,
} from '@main/automation/diagnostics-retention';
import { recoverJobsGeminiAndProfilesOnStartup } from '@main/gemini/startup-recovery';
import {
  automationCodeToPoolState,
  googleStatusToPoolState,
  isPoolStateAdmissible,
} from '@shared/constants/browser-account-pool';

describe('browser account pool states', () => {
  it('maps legacy statuses and blocks non-READY', () => {
    expect(googleStatusToPoolState('LIMITED')).toBe('QUOTA_EXHAUSTED');
    expect(googleStatusToPoolState('LOGIN_REQUIRED')).toBe('LOGIN_REQUIRED');
    expect(isPoolStateAdmissible('READY')).toBe(true);
    expect(isPoolStateAdmissible('CAPTCHA_REQUIRED')).toBe(false);
    expect(automationCodeToPoolState('CAPTCHA_REQUIRED').pool).toBe('CAPTCHA_REQUIRED');
    expect(automationCodeToPoolState('LOGIN_REQUIRED').attention).toBe('LOGIN_REQUIRED');
  });
});

describe('circuit breaker', () => {
  it('opens after threshold and trips immediately for attention', () => {
    let now = 1_000;
    const breaker = new BrowserCircuitBreaker({
      failureThreshold: 3,
      openMs: 10_000,
      now: () => now,
      random: () => 0,
    });
    expect(breaker.canAttempt('prov', 'acc')).toBe(true);
    breaker.recordFailure('prov', 'acc');
    breaker.recordFailure('prov', 'acc');
    expect(breaker.canAttempt('prov', 'acc')).toBe(true);
    breaker.recordFailure('prov', 'acc');
    expect(breaker.canAttempt('prov', 'acc')).toBe(false);
    expect(breaker.backoffMs('prov', 'acc')).toBeGreaterThan(0);

    breaker.clear('prov', 'acc');
    breaker.tripForAttention('prov', 'acc', 60_000);
    expect(breaker.canAttempt('prov', 'acc')).toBe(false);
    now += 61_000;
    expect(breaker.snapshot('prov', 'acc').state).toBe('half_open');
  });
});

describe('versioned selectors', () => {
  it('respects fallback budget newest-first', async () => {
    const catalog: VersionedSelectorCatalog = {
      id: 'test',
      version: 3,
      candidates: [
        { key: 'old', version: 1, css: '.old' },
        { key: 'mid', version: 2, css: '.mid' },
        { key: 'new', version: 3, css: '.new' },
        { key: 'extra', version: 3, css: '.extra' },
        { key: 'extra2', version: 3, css: '.extra2' },
      ],
    };
    expect(candidatesWithinBudget(catalog, 2).map((c) => c.key)).toEqual(['new', 'extra']);
    const tried: string[] = [];
    const hit = await resolveFirstVisible(async (c) => {
      tried.push(c.key);
      return c.key === 'mid';
    }, catalog, 4);
    expect(hit?.candidate.key).toBe('mid');
    expect(tried[0]).toBe('new');
  });
});

describe('attention + diagnostics retention + multi-provider recovery', () => {
  let tempRoot: string;
  let db: DatabaseManager;

  beforeEach(() => {
    resetBrowserCircuitBreakerForTests();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-browser-pool-'));
    pathsService.initializeAt(tempRoot);
    const paths = resolveAppPaths(tempRoot);
    fs.mkdirSync(paths.data, { recursive: true });
    fs.mkdirSync(path.join(paths.data, 'diagnostics'), { recursive: true });
    closeDatabase();
    db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
  });

  afterEach(() => {
    db.close();
    closeDatabase();
    resetBrowserCircuitBreakerForTests();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('opens attention item and stops account on CAPTCHA', () => {
    const account = db.googleAccounts.create({
      label: 'A',
      email: 'a@example.com',
      profileDirName: 'p-a',
      status: 'READY',
    });
    const result = applyBrowserPoolAttention(db, {
      accountKind: 'GOOGLE_ACCOUNT',
      accountId: account.id,
      providerId: 'prov-playwright-gemini',
      providerType: 'PLAYWRIGHT_GEMINI',
      errorCode: 'CAPTCHA',
      summary: 'CAPTCHA gate visible',
    });
    expect(result.poolState).toBe('CAPTCHA_REQUIRED');
    expect(result.attentionId).toBeTruthy();
    expect(db.googleAccounts.getById(account.id)?.status).toBe('NEEDS_ATTENTION');
    expect(db.browserAttention.listOpen()).toHaveLength(1);

    // Dedup
    applyBrowserPoolAttention(db, {
      accountKind: 'GOOGLE_ACCOUNT',
      accountId: account.id,
      errorCode: 'CAPTCHA',
      summary: 'again',
    });
    expect(db.browserAttention.listOpen()).toHaveLength(1);
  });

  it('purges and deletes failure diagnostics', () => {
    const dir = path.join(pathsService.getPath('data'), 'diagnostics');
    const fresh = path.join(dir, 'fresh.png');
    const old = path.join(dir, 'old.png');
    fs.writeFileSync(fresh, 'x');
    fs.writeFileSync(old, 'y');
    const oldTime = Date.now() - 8 * 24 * 60 * 60 * 1000;
    fs.utimesSync(old, new Date(oldTime / 1000), new Date(oldTime / 1000));

    const listed = listFailureDiagnostics();
    expect(listed.some((f) => f.path === fresh || f.name.includes('fresh'))).toBe(true);

    const purged = purgeFailureDiagnosticsOlderThan(7 * 24 * 60 * 60 * 1000);
    expect(purged.deleted).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(fresh)).toBe(true);
    expect(deleteFailureDiagnostic(fresh)).toBe(true);
    expect(fs.existsSync(fresh)).toBe(false);
  });

  it('startup recovery classifies non-terminal ai_requests', () => {
    const project = db.projects.create({ title: 'P' });
    db.aiRequests.create({
      project_id: project.id,
      provider_id: 'prov-playwright-chatgpt',
      provider_type: 'PLAYWRIGHT_CHATGPT',
      account_kind: 'AI_ACCOUNT',
      account_id: 'acc-1',
      status: 'SENDING',
      lifecycle: 'preparing',
    });
    db.aiRequests.create({
      project_id: project.id,
      provider_id: 'prov-playwright-chatgpt',
      provider_type: 'PLAYWRIGHT_CHATGPT',
      account_kind: 'AI_ACCOUNT',
      account_id: 'acc-1',
      status: 'WAITING_AI',
      lifecycle: 'sent_waiting',
    });
    const report = recoverJobsGeminiAndProfilesOnStartup(db, {
      profilesRoot: pathsService.getPath('browserProfiles'),
    });
    expect(report.aiRequestAbandonedBeforeSend).toBe(1);
    expect(report.aiRequestUnknownAfterCrash).toBe(1);
  });
});

/**
 * Live smoke against real logged-in browser accounts.
 * NOT VERIFIED in this environment — opt-in only when user provides accounts.
 */
describe.skip('browser provider live smoke (NOT VERIFIED)', () => {
  it('placeholder — run only with user-allowed logged-in profiles', () => {
    expect(true).toBe(true);
  });
});
