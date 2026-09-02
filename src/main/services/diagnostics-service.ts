import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { Page, BrowserContext } from 'playwright';
import type { AutomationProviderId } from '@shared/constants/diagnostics';
import type {
  AiBrowserProbeKind,
  AiBrowserProbeResponse,
  ConnectionTestKind,
  ConnectionTestResponse,
  HealthReport,
  LocatorSuggestion,
} from '@shared/schemas/diagnostics';
import { AutomationError } from '../automation/errors/automation-errors';
import { startFailTrace } from '../automation/playwright-tracing';
import { resolveTranslationNotebook } from '../notebook/notebook-resolver';
import { NOTEBOOKLM_URL } from '@shared/constants/gemini';
import { newId } from '../db/utils/uuid';
import type { SelectorOverrideFile } from '@shared/schemas/selector-override';
import { SelectorOverrideFileSchema } from '@shared/schemas/selector-override';
import type { DatabaseManager } from '../db/database-manager';
import { browserProfileManager } from '../automation/browser-runner/profile-manager';
import { profileLockManager, startLeaseHeartbeat } from '../automation/browser-runner/profile-lock';
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
  stopHeartbeat: () => void;
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
      profileLeases: profileLockManager.listActiveLeases().map((lease) => ({
        accountId: lease.accountId,
        ownerId: lease.ownerId,
        operation: lease.operation,
        label: lease.label,
        pid: lease.pid,
        expiresAt: lease.expiresAt,
        profilePath: lease.profilePath,
      })),
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

  async runGoogleSmoke(input: {
    accountId: string;
    notebookUrl: string;
    smokeProjectLabel?: string;
    headless?: boolean;
    scenarios?: ('A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H')[];
  }) {
    const profile = this.getDb().googleAccounts.getProfile(input.accountId);
    if (!profile) throw new Error('Browser profile missing for account');
    const profilePath = browserProfileManager.resolveProfilePath(profile.profile_dir_name);
    const { parseGoogleSmokeConfig, runGoogleSmoke } = await import('../google-smoke');
    const artifactsDir = path.join(
      pathsService.getPath('cache'),
      'automation',
      input.accountId,
      'google-smoke',
    );
    const reportPath = path.join(process.cwd(), 'docs', 'REAL_GOOGLE_TEST_REPORT.md');
    const config = parseGoogleSmokeConfig({
      enabled: true,
      profilePath,
      notebookUrl: input.notebookUrl,
      headless: input.headless ?? false,
      smokeProjectLabel: input.smokeProjectLabel ?? 'KHEPREE_NOVEL_AI_SMOKE',
      scenarios: input.scenarios,
      reportMarkdownPath: reportPath,
      artifactsDir,
      allowNonSmokeNotebook: false,
    });
    logger.info('Real Google smoke starting from Diagnostics UI', {
      accountId: input.accountId,
      notebookUrl: input.notebookUrl,
    });
    const report = await runGoogleSmoke(config);
    return {
      overall: report.overall,
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
      reportPath,
      artifactsDir: report.artifactsDir,
      results: report.results.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        durationMs: r.durationMs,
        message: r.message,
        screenshotPath: r.screenshotPath,
        timelinePath: r.timelinePath,
      })),
    };
  }

  async runNotebookGroundingSmoke(input: {
    accountId: string;
    notebookUrl: string;
    smokeProjectLabel?: string;
    headless?: boolean;
    tests?: ('A' | 'B' | 'C' | 'D')[];
    groundingKnowledgeDriveFileId?: string;
    groundingSyncStateDriveFileId?: string;
  }) {
    const profile = this.getDb().googleAccounts.getProfile(input.accountId);
    if (!profile) throw new Error('Browser profile missing for account');
    const profilePath = browserProfileManager.resolveProfilePath(profile.profile_dir_name);
    const {
      parseNotebookGroundingSmokeConfig,
      runNotebookGroundingSmoke,
    } = await import('../notebook-grounding-smoke');
    const artifactsDir = path.join(
      pathsService.getPath('cache'),
      'automation',
      input.accountId,
      'notebook-grounding-smoke',
    );
    const reportPath = path.join(process.cwd(), 'docs', 'REAL_NOTEBOOK_GROUNDING_REPORT.md');

    const config = parseNotebookGroundingSmokeConfig({
      enabled: true,
      profilePath,
      notebookUrl: input.notebookUrl,
      headless: input.headless ?? false,
      smokeProjectLabel: input.smokeProjectLabel ?? 'KHEPREE_NOVEL_AI_SMOKE',
      tests: input.tests,
      reportMarkdownPath: reportPath,
      artifactsDir,
      allowNonSmokeNotebook: false,
      accountId: input.accountId,
      groundingKnowledgeDriveFileId: input.groundingKnowledgeDriveFileId,
      groundingSyncStateDriveFileId: input.groundingSyncStateDriveFileId,
    });

    logger.info('Real Notebook grounding smoke starting from Diagnostics UI', {
      accountId: input.accountId,
      notebookUrl: input.notebookUrl,
    });

    const report = await runNotebookGroundingSmoke({
      config,
      db: this.getDb(),
    });

    return {
      overall: report.overall,
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
      reportPath,
      artifactsDir: report.artifactsDir,
      knowledgeKey: report.knowledgeKey,
      notebookName: report.notebookName,
      results: report.results.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        durationMs: r.durationMs,
        localVersion: r.localVersion,
        notebookVersion: r.notebookVersion,
        bindingType: r.bindingType === 'UNKNOWN' ? null : r.bindingType,
        remoteFileId: r.remoteFileId,
        notebookName: r.notebookName,
        packMode: r.packMode,
        response: r.response,
        message: r.message,
        screenshotPath: r.screenshotPath,
      })),
    };
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
        case 'gemini':
          return await this.testGemini(input.accountId, started);
        case 'notebook':
          return await this.testNotebook(input.accountId, started);
        default:
          return {
            kind: input.kind,
            ok: false,
            message: 'Unknown or unsupported test kind',
            durationMs: Date.now() - started,
          };
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

  /**
   * Settings → Chẩn đoán AI stepwise probes.
   * Trial translate uses a tiny prompt and never writes Project Memory.
   */
  async runAiBrowserProbe(input: {
    kind: AiBrowserProbeKind;
    accountId: string;
    projectId?: string;
  }): Promise<AiBrowserProbeResponse> {
    const started = Date.now();
    const steps: AiBrowserProbeResponse['steps'] = [];
    let diagnosticsDir: string | null = null;
    try {
      const result = await this.withProviderPage(
        input.accountId,
        'google-gemini',
        GEMINI_URL,
        async (page, diagDir, context) => {
          diagnosticsDir = diagDir;
          const eventLogger = new BrowserEventLogger(
            null,
            path.join(diagDir, 'events'),
          );
          const provider = new GeminiBrowserProvider({
            diagnosticsDir: diagDir,
            eventLogger,
            workerId: input.accountId,
          });
          provider.attachPage(page);
          provider.beginTimeline();
          const trace = await startFailTrace(context, diagDir, `probe-${input.kind}`);
          provider.setFailTraceSession(trace);

          const push = (step: string, ok: boolean, message?: string) => {
            steps.push({ step, ok, message });
          };

          try {
            if (input.kind === 'browser') {
              const health = await provider.healthCheck();
              push('browser', health.ok, health.message);
              return this.probeResult(input.kind, health.ok, steps, started, provider, diagDir, health.message);
            }

            const loggedIn = await provider.detectLogin();
            push('login', loggedIn, loggedIn ? 'Google session usable' : 'Login required');
            if (!loggedIn) {
              return this.probeResult(input.kind, false, steps, started, provider, diagDir, 'NEEDS_LOGIN', 'LOGIN_REQUIRED');
            }
            if (input.kind === 'login') {
              return this.probeResult(input.kind, true, steps, started, provider, diagDir, 'Login OK');
            }

            const mapping = input.projectId
              ? resolveTranslationNotebook(this.getDb(), input.projectId, input.accountId)
              : null;
            const notebookUrl =
              mapping?.resource_url?.startsWith('http')
                ? mapping.resource_url
                : NOTEBOOKLM_URL;
            provider.setExpectedNotebookUrl(notebookUrl);
            await provider.openProjectNotebook(notebookUrl);
            push('notebook', true, `Opened ${notebookUrl}`);
            if (input.kind === 'notebook') {
              return this.probeResult(input.kind, true, steps, started, provider, diagDir, 'Notebook OK');
            }

            await provider.createOrOpenTranslationThread();
            const composer = await provider.probeComposerReady();
            push('composer', composer.ok, composer.ok ? 'Composer usable' : 'Composer not found');
            if (!composer.ok || input.kind === 'composer') {
              return this.probeResult(
                input.kind,
                composer.ok,
                steps,
                started,
                provider,
                diagDir,
                composer.ok ? 'Composer OK' : 'Composer failed',
              );
            }

            {
              const trialPrompt =
                'Reply with exactly one word: OK. Do not change any memory or notebook sources.';
              const correlationId = newId();
              await provider.submitPlainPrompt(trialPrompt, correlationId);
              push('send', true, 'Send confirmed');
              if (input.kind === 'send') {
                await provider.cancelGeneration().catch(() => undefined);
                return this.probeResult(input.kind, true, steps, started, provider, diagDir, 'Send OK (cancelled generation)');
              }
              await provider.waitForGenerationStart(20_000);
              push('generation', true, 'Generation started');
              await provider.waitForGenerationComplete(correlationId, {
                maxTimeoutMs: 60_000,
                stabilizationWindowMs: 2_000,
              });
              const raw = await provider.extractLatestResponse(correlationId);
              push('capture', true, `Captured ${raw.text.length} chars`);
              // Never touch Project Memory — probe only.
              return this.probeResult(
                input.kind,
                true,
                steps,
                started,
                provider,
                diagDir,
                `Trial OK: ${raw.text.slice(0, 120)}`,
              );
            }

            return this.probeResult(input.kind, true, steps, started, provider, diagDir, 'OK');
          } finally {
            await provider.discardFailTrace().catch(() => undefined);
            await provider.detach();
          }
        },
      );
      return result;
    } catch (error) {
      const auto = error instanceof AutomationError ? error : null;
      const failedStep =
        auto?.diagnostics?.failedStep ??
        steps.filter((s) => s.ok).at(-1)?.step ??
        input.kind;
      if (auto) {
        steps.push({
          step: failedStep,
          ok: false,
          message: auto.message,
        });
      }
      return {
        kind: input.kind,
        ok: false,
        failedStep: failedStep,
        lastOkStep: auto?.diagnostics?.lastOkStep ?? (steps.filter((s) => s.ok).at(-1)?.step ?? null),
        message: auto?.message ?? (error instanceof Error ? error.message : String(error)),
        durationMs: Date.now() - started,
        steps,
        diagnosticsDir,
        timeline: auto?.diagnostics?.timeline ?? null,
        errorCode: auto?.code ?? 'UNKNOWN_UI',
      };
    }
  }

  private probeResult(
    kind: AiBrowserProbeKind,
    ok: boolean,
    steps: AiBrowserProbeResponse['steps'],
    started: number,
    provider: GeminiBrowserProvider,
    diagnosticsDir: string,
    message: string,
    errorCode?: string | null,
  ): AiBrowserProbeResponse {
    const snap = provider.getTimeline()?.snapshot() ?? null;
    return {
      kind,
      ok,
      failedStep: ok ? null : (snap?.failedStep ?? steps.find((s) => !s.ok)?.step ?? kind),
      lastOkStep: snap?.lastOkStep ?? steps.filter((s) => s.ok).at(-1)?.step ?? null,
      message,
      durationMs: Date.now() - started,
      steps,
      diagnosticsDir,
      timeline: snap,
      errorCode: errorCode ?? null,
    };
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
    fn: (page: Page, diagnosticsDir: string, context: BrowserContext) => Promise<T>,
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

    profileLockManager.acquireLease({
      profilePath,
      ownerId,
      accountId,
      operation: 'diagnostics_repair',
      label: 'Diagnostics connection probe',
    });
    const stopHeartbeat = startLeaseHeartbeat(profileLockManager, {
      profilePath,
      ownerId,
    });
    const { launchKhepreeNovelAIPersistentContext } = await import(
      '../automation/browser-runner/launch-persistent-context'
    );
    const { context } = await launchKhepreeNovelAIPersistentContext({
      profilePath,
      // Connection probes may run headless; caller path is diagnostics-only.
      headless: true,
      diagnosticsDir,
    });
    try {
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      return await fn(page, diagnosticsDir, context);
    } finally {
      await context.close().catch(() => undefined);
      stopHeartbeat();
      profileLockManager.releaseLease(profilePath, ownerId);
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

    profileLockManager.acquireLease({
      profilePath,
      ownerId,
      accountId: input.accountId,
      operation: 'diagnostics_repair',
      label: 'Sửa selector (diagnostics)',
    });
    const stopHeartbeat = startLeaseHeartbeat(profileLockManager, {
      profilePath,
      ownerId,
    });
    const { launchKhepreeNovelAIPersistentContext } = await import(
      '../automation/browser-runner/launch-persistent-context'
    );
    const { context } = await launchKhepreeNovelAIPersistentContext({
      profilePath,
      headless: false,
      diagnosticsDir: path.join(
        pathsService.getPath('cache'),
        'automation',
        input.accountId,
        'repair',
      ),
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
      stopHeartbeat,
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
    session.stopHeartbeat();
    await session.context.close().catch(() => undefined);
    try {
      profileLockManager.releaseLease(session.profilePath, session.ownerId);
    } catch {
      profileLockManager.recoverIfStale(session.profilePath);
    }
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
