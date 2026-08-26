import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { Page, BrowserContext } from 'playwright';
import type { AutomationProviderId } from '@shared/constants/diagnostics';
import type {
  ConnectionTestKind,
  ConnectionTestResponse,
  HealthReport,
  LocatorSuggestion,
} from '@shared/schemas/diagnostics';
import type { SelectorOverrideFile } from '@shared/schemas/selector-override';
import { SelectorOverrideFileSchema } from '@shared/schemas/selector-override';
import type { DatabaseManager } from '../db/database-manager';
import { browserProfileManager } from '../automation/browser-runner/profile-manager';
import { profileLockManager } from '../automation/browser-runner/profile-lock';
import { GeminiBrowserProvider } from '../automation/providers/google/gemini-browser-provider';
import { NotebookProvider } from '../automation/providers/google/notebook-provider';
import { BrowserEventLogger } from '../automation/browser-event-logger';
import {
  createRepairSessionId,
  waitForElementClick,
} from '../automation/interactive-repair';
import { buildDiagnosticsExportZip } from '../automation/diagnostics-export';
import {
  countOverrides,
  defaultSelectorOverridesPath,
  emptySelectorOverrideFile,
  loadSelectorOverridesFromDisk,
  reloadSelectorOverrides,
  saveSelectorOverridesToDisk,
  upsertSelectorOverride,
} from '../automation/selectors/selector-override-loader';
import {
  listProviderStatuses,
  recordProviderSuccess,
} from '../automation/selectors/provider-status';
import { pathsService } from './paths-service';
import { getAccountWorkerService } from './account-worker-singleton';
import { getDriveSyncService } from './drive-sync-service-singleton';
import { logger } from '../logging/logger';

const GEMINI_URL = 'https://gemini.google.com/app';
const NOTEBOOK_URL = 'https://notebook.google.com/';

interface RepairRuntime {
  sessionId: string;
  accountId: string;
  providerId: AutomationProviderId;
  selectorKey: string;
  context: BrowserContext;
  page: Page;
  ownerId: string;
  profilePath: string;
  suggestion: LocatorSuggestion | null;
}

export class DiagnosticsService {
  private readonly repairSessions = new Map<string, RepairRuntime>();

  constructor(private readonly getDb: () => DatabaseManager) {}

  listProviders() {
    return { providers: listProviderStatuses(this.getDb()) };
  }

  getSelectorOverrides() {
    const loaded = loadSelectorOverridesFromDisk();
    return {
      filePath: loaded.filePath,
      file: loaded.errors.length ? emptySelectorOverrideFile() : loaded.file,
      exists: fs.existsSync(loaded.filePath),
    };
  }

  loadSelectorOverrides(filePath?: string) {
    const loaded = loadSelectorOverridesFromDisk(filePath);
    if (filePath && loaded.errors.length === 0) {
      // Copy validated external file into managed path
      const managed = saveSelectorOverridesToDisk(loaded.file);
      return {
        ok: true,
        filePath: managed,
        overrideCount: countOverrides(loaded.file),
        errors: [] as string[],
      };
    }
    return {
      ok: loaded.errors.length === 0,
      filePath: loaded.filePath,
      overrideCount: countOverrides(loaded.file),
      errors: loaded.errors,
    };
  }

  saveSelectorOverrides(file: SelectorOverrideFile | Record<string, unknown>) {
    const filePath = saveSelectorOverridesToDisk(SelectorOverrideFileSchema.parse(file));
    return { ok: true, filePath };
  }

  reloadSelectorOverrides() {
    const result = reloadSelectorOverrides();
    return {
      ok: result.errors.length === 0,
      filePath: result.filePath,
      overrideCount: result.overrideCount,
      errors: result.errors,
    };
  }

  buildHealthReport(): HealthReport {
    const db = this.getDb();
    const automationDir = path.join(pathsService.getPath('cache'), 'automation');
    const overridesPath = defaultSelectorOverridesPath();
    const loaded = loadSelectorOverridesFromDisk(overridesPath);

    return {
      generatedAt: new Date().toISOString(),
      appVersion: readAppVersion(),
      schemaVersion: db.getSchemaVersion(),
      providers: listProviderStatuses(db),
      recentFailures: listRecentFailureArtifacts(automationDir, 20),
      selectorOverridesPath: overridesPath,
      selectorOverridesValid: loaded.errors.length === 0,
      logRedactionEnabled: true,
      notes: [
        'Diagnostics export excludes cookies, OAuth tokens, browser profiles, and localStorage secrets.',
        'Selector overrides are locator data only — no remote code execution.',
        ...(loaded.errors.length
          ? [`Selector override validation errors: ${loaded.errors.join('; ')}`]
          : []),
      ],
    };
  }

  async exportDiagnostics(outputPath?: string) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target =
      outputPath ??
      path.join(pathsService.getPath('exports'), `diagnostics-${stamp}.zip`);
    const result = await buildDiagnosticsExportZip({
      healthReport: this.buildHealthReport(),
      automationCacheDir: path.join(pathsService.getPath('cache'), 'automation'),
      logsDir: pathsService.getPath('logs'),
      outputPath: target,
    });
    logger.info('Diagnostics export created', { filePath: result.filePath });
    return result;
  }

  async runConnectionTest(input: {
    kind: ConnectionTestKind;
    accountId: string;
  }): Promise<ConnectionTestResponse> {
    const started = Date.now();
    try {
      switch (input.kind) {
        case 'browserProfile':
          return await this.testBrowserProfile(input.accountId, started);
        case 'drive':
          return await this.testDrive(input.accountId, started);
        case 'gemini':
          return await this.testGemini(input.accountId, started);
        case 'notebook':
          return await this.testNotebook(input.accountId, started);
        default: {
          const _exhaustive: never = input.kind;
          return {
            kind: _exhaustive,
            ok: false,
            message: 'Unknown test kind',
            durationMs: Date.now() - started,
          };
        }
      }
    } catch (error) {
      return {
        kind: input.kind,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - started,
      };
    }
  }

  private async testBrowserProfile(
    accountId: string,
    started: number,
  ): Promise<ConnectionTestResponse> {
    const result = await getAccountWorkerService().testSession(accountId);
    return {
      kind: 'browserProfile',
      ok: result.usable,
      message: result.usable
        ? `Profile usable${result.email ? ` (${result.email})` : ''}`
        : `Profile not usable: ${result.reason ?? 'unknown'}`,
      durationMs: Date.now() - started,
      details: { email: result.email, reason: result.reason ?? null },
    };
  }

  private async testDrive(
    accountId: string,
    started: number,
  ): Promise<ConnectionTestResponse> {
    const account = this.getDb().googleAccounts.getById(accountId);
    if (!account) throw new Error(`Account not found: ${accountId}`);
    const oauthConfigured = await getDriveSyncService().getOAuthConfigured();
    const connected = account.drive_connected === 1;
    const ok = oauthConfigured && connected;
    return {
      kind: 'drive',
      ok,
      message: ok
        ? 'Drive OAuth configured and account connected'
        : !oauthConfigured
          ? 'Drive OAuth client not configured'
          : 'Account Drive not connected',
      durationMs: Date.now() - started,
      details: {
        oauthConfigured,
        driveConnected: connected,
        // never include tokens
      },
    };
  }

  private async testGemini(
    accountId: string,
    started: number,
  ): Promise<ConnectionTestResponse> {
    const health = await this.withProviderPage(
      accountId,
      'google-gemini',
      GEMINI_URL,
      async (page, diagnosticsDir) => {
        const eventLogger = new BrowserEventLogger(
          null,
          path.join(diagnosticsDir, 'events'),
        );
        const provider = new GeminiBrowserProvider({
          diagnosticsDir,
          eventLogger,
          workerId: accountId,
        });
        provider.attachPage(page);
        try {
          return await provider.healthCheck();
        } finally {
          await provider.detach();
        }
      },
    );
    if (health.ok) {
      recordProviderSuccess(this.getDb(), 'google-gemini');
    }
    return {
      kind: 'gemini',
      ok: health.ok,
      message: health.message,
      durationMs: Date.now() - started,
    };
  }

  private async testNotebook(
    accountId: string,
    started: number,
  ): Promise<ConnectionTestResponse> {
    const health = await this.withProviderPage(
      accountId,
      'google-notebook',
      NOTEBOOK_URL,
      async (page, diagnosticsDir) => {
        const provider = new NotebookProvider({ diagnosticsDir });
        provider.attachPage(page);
        try {
          return await provider.healthCheck();
        } finally {
          await provider.detach();
        }
      },
    );
    if (health.ok) {
      recordProviderSuccess(this.getDb(), 'google-notebook');
    }
    return {
      kind: 'notebook',
      ok: health.ok,
      message: health.message,
      durationMs: Date.now() - started,
    };
  }

  private async withProviderPage<T>(
    accountId: string,
    providerId: AutomationProviderId,
    startUrl: string,
    fn: (page: Page, diagnosticsDir: string) => Promise<T>,
  ): Promise<T> {
    const profile = this.getDb().googleAccounts.getProfile(accountId);
    if (!profile) throw new Error('Browser profile missing for account');
    const profilePath = browserProfileManager.resolveProfilePath(profile.profile_dir_name);
    const ownerId = `diagnostics:${providerId}:${Date.now()}`;
    const diagnosticsDir = path.join(
      pathsService.getPath('cache'),
      'automation',
      accountId,
      'diagnostics',
    );
    fs.mkdirSync(diagnosticsDir, { recursive: true });

    profileLockManager.acquire(profilePath, ownerId);
    const { chromium } = await import('playwright');
    const context = await chromium.launchPersistentContext(profilePath, {
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    });
    try {
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      return await fn(page, diagnosticsDir);
    } finally {
      await context.close().catch(() => undefined);
      profileLockManager.release(profilePath, ownerId);
    }
  }

  async startInteractiveRepair(input: {
    accountId: string;
    providerId: AutomationProviderId;
    selectorKey: string;
    startUrl?: string;
  }) {
    const profile = this.getDb().googleAccounts.getProfile(input.accountId);
    if (!profile) throw new Error('Browser profile missing for account');
    const profilePath = browserProfileManager.resolveProfilePath(profile.profile_dir_name);
    const sessionId = createRepairSessionId();
    const ownerId = `repair:${sessionId}`;
    const startUrl =
      input.startUrl ??
      (input.providerId === 'google-notebook' ? NOTEBOOK_URL : GEMINI_URL);

    profileLockManager.acquire(profilePath, ownerId);
    const { chromium } = await import('playwright');
    const context = await chromium.launchPersistentContext(profilePath, {
      headless: false,
      args: ['--disable-blink-features=AutomationControlled'],
    });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    this.repairSessions.set(sessionId, {
      sessionId,
      accountId: input.accountId,
      providerId: input.providerId,
      selectorKey: input.selectorKey,
      context,
      page,
      ownerId,
      profilePath,
      suggestion: null,
    });

    return {
      sessionId,
      message:
        'Browser open. Click target element in page (password fields rejected). Then Capture.',
    };
  }

  async captureInteractiveRepair(input: {
    sessionId: string;
    timeoutMs?: number;
  }) {
    const session = this.repairSessions.get(input.sessionId);
    if (!session) throw new Error('Repair session not found');
    const suggestion = await waitForElementClick(
      session.page,
      input.timeoutMs ?? 60_000,
    );
    session.suggestion = suggestion;
    return {
      sessionId: session.sessionId,
      selectorKey: session.selectorKey,
      providerId: session.providerId,
      suggestion,
    };
  }

  applyInteractiveRepair(input: {
    sessionId: string;
    mode?: 'prepend' | 'append' | 'replace';
  }) {
    const session = this.repairSessions.get(input.sessionId);
    if (!session) throw new Error('Repair session not found');
    if (!session.suggestion || session.suggestion.rejected) {
      throw new Error(
        session.suggestion?.rejectReason ?? 'No valid locator suggestion to apply',
      );
    }
    if (session.suggestion.suggestedStrategies.length === 0) {
      throw new Error('No suggested strategies from click');
    }
    const filePath = upsertSelectorOverride({
      providerId: session.providerId,
      selectorKey: session.selectorKey,
      strategies: session.suggestion.suggestedStrategies,
      mode: input.mode ?? 'prepend',
      description: `Interactive repair ${new Date().toISOString()}`,
    });
    return {
      ok: true,
      filePath,
      selectorKey: session.selectorKey,
    };
  }

  async cancelInteractiveRepair(sessionId: string) {
    const session = this.repairSessions.get(sessionId);
    if (!session) return { ok: true };
    this.repairSessions.delete(sessionId);
    await session.context.close().catch(() => undefined);
    profileLockManager.release(session.profilePath, session.ownerId);
    return { ok: true };
  }
}

function readAppVersion(): string {
  try {
    return app.getVersion();
  } catch {
    return '0.0.0-test';
  }
}

function listRecentFailureArtifacts(
  root: string,
  limit: number,
): HealthReport['recentFailures'] {
  if (!fs.existsSync(root)) return [];
  const files: { path: string; mtime: number }[] = [];
  const stack = [root];
  while (stack.length > 0 && files.length < 200) {
    const dir = stack.pop();
    if (!dir) break;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        stack.push(full);
        continue;
      }
      const ext = path.extname(ent.name).toLowerCase();
      if (!['.png', '.html', '.json'].includes(ext)) continue;
      try {
        const st = fs.statSync(full);
        files.push({ path: full, mtime: st.mtimeMs });
      } catch {
        // skip
      }
    }
  }
  return files
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)
    .map((f) => ({
      path: f.path,
      modifiedAt: new Date(f.mtime).toISOString(),
      kind:
        f.path.endsWith('.png')
          ? ('screenshot' as const)
          : f.path.endsWith('.html')
            ? ('html' as const)
            : ('other' as const),
    }));
}

/** Called from production send paths on success. */
export function markProviderRunSuccess(
  db: DatabaseManager,
  providerId: AutomationProviderId,
): void {
  recordProviderSuccess(db, providerId);
}
