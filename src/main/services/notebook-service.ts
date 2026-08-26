import { createHash } from 'node:crypto';
import path from 'node:path';
import type { DatabaseManager } from '../db/database-manager';
import { NotebookProvider } from '../automation/providers/google/notebook-provider';
import { AutomationError } from '../automation/errors/automation-errors';
import { formatNotebookName } from '@shared/constants/notebook';
import type { NotebookAssistedStep } from '@shared/constants/notebook';
import { DRIVE_PROJECT_FILES } from '@shared/constants/drive';
import {
  FILE_KEY_TO_NAME,
  OWNED_FILE_KEYS,
  writeKnowledgeSourceFiles,
} from '../drive/drive-content-builder';
import { NotebookKnowledgeBuilder } from '../notebook/knowledge-builder';
import type { BrowserSessionController } from '../automation/browser-runner/browser-session-controller';
import { PlaywrightBrowserSessionController } from '../automation/browser-runner/browser-session-controller';
import { browserProfileManager } from '../automation/browser-runner/profile-manager';
import { profileLockManager } from '../automation/browser-runner/profile-lock';
import { pathsService } from './paths-service';
import { logger } from '../logging/logger';
import { getNotebookSyncService } from '../notebook/notebook-sync-service-singleton';

export interface NotebookMappingDto {
  projectId: string;
  accountId: string;
  notebookName: string;
  notebookId: string | null;
  resourceUrl: string | null;
  status: string;
  assistedStep: string | null;
  lastError: string | null;
  lastVerifiedAt: string | null;
  knowledgeVersion?: number;
  localKnowledgeVersion?: number;
  lastSyncAt?: string | null;
  lastDriveSyncAt?: string | null;
}

export interface ProvisionNotebookResult {
  mapping: NotebookMappingDto;
  assisted: boolean;
  message: string;
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function buildKnowledgeSources(
  db: DatabaseManager,
  projectId: string,
): { name: string; content: string }[] {
  const docs = new NotebookKnowledgeBuilder(db).rebuildAndTrack(projectId);
  return OWNED_FILE_KEYS.map((key) => ({
    name: FILE_KEY_TO_NAME[key],
    content: docs[key],
  }));
}

/** File upload → Copied text → Drive picker. */
async function attachKnowledgeSources(
  provider: NotebookProvider,
  knowledgeSources: { name: string; content: string }[],
  sourceNames: string[],
  filePaths: string[],
): Promise<void> {
  try {
    await provider.addFileSources(filePaths);
    return;
  } catch (error) {
    // Only fall back when upload UI is missing — NEVER on UNKNOWN_UI
    // (upload may have succeeded; retrying paste duplicates sources).
    if (!(error instanceof AutomationError) || error.code !== 'SELECTOR_NOT_FOUND') {
      throw error;
    }
    logger.warn('Notebook file upload unavailable; falling back to Copied text', {
      message: error.message,
    });
  }

  try {
    await provider.addTextSources(knowledgeSources);
    return;
  } catch (error) {
    if (!(error instanceof AutomationError) || error.code !== 'SELECTOR_NOT_FOUND') {
      throw error;
    }
    logger.warn('Notebook Copied-text unavailable; falling back to Drive picker', {
      message: error.message,
    });
  }

  await provider.addDriveSources(sourceNames);
}

function loadNotebookInstructions(db: DatabaseManager, projectId: string): string {
  const row = db
    .getConnection()
    .prepare(`SELECT style_config FROM project_settings WHERE project_id = ?`)
    .get(projectId) as { style_config: string | null } | undefined;

  const lines: string[] = [
    'Notebook này là bộ nhớ tri thức dài hạn của một dự án dịch tiểu thuyết Trung → Việt (NovelTrans Studio).',
    '',
    'Luôn ưu tiên các nguồn:',
    'Translation Rules, Project Terms, Characters, Relationships, Story State, World Knowledge, Recent Context.',
    '',
    'Không tự phát minh thông tin ngoài sources khi được hỏi về dữ liệu truyện.',
    'Đối với tên nhân vật và thuật ngữ, ưu tiên bản dịch đã xác nhận / LOCKED trong Project Terms.',
    'Official Summary trong Book Profile KHÔNG phải trạng thái hiện tại — Story State mới là trạng thái hiện tại.',
    'HOT MEMORY trong Translation Pack override Notebook nếu xung đột (chưa kịp sync).',
    'Không tự dịch toàn bộ novel; chỉ dịch khi nhận Translation Pack với Source + Output Protocol.',
  ];

  if (row?.style_config) {
    try {
      const parsed = JSON.parse(row.style_config) as {
        notebookInstructions?: string;
        rules?: string[];
        criticalRules?: string[];
      };
      if (parsed.notebookInstructions) {
        lines.push(parsed.notebookInstructions);
      }
      if (Array.isArray(parsed.criticalRules)) lines.push(...parsed.criticalRules);
      if (Array.isArray(parsed.rules)) lines.push(...parsed.rules);
    } catch {
      lines.push(row.style_config);
    }
  }

  return lines.join('\n');
}

export class NotebookService {
  private readonly browser: BrowserSessionController;

  constructor(
    private readonly db: DatabaseManager,
    browser?: BrowserSessionController,
  ) {
    this.browser = browser ?? new PlaywrightBrowserSessionController();
  }

  getMapping(projectId: string, accountId: string): NotebookMappingDto | null {
    const row = this.db.notebooks.getByProjectAndWorker(projectId, accountId);
    return row ? this.toDto(row) : null;
  }

  listMappings(projectId: string): NotebookMappingDto[] {
    return this.db.notebooks.listByProject(projectId).map((row) => this.toDto(row));
  }

  async provision(input: {
    projectId: string;
    accountId: string;
    headless?: boolean;
    baseUrl?: string;
  }): Promise<ProvisionNotebookResult> {
    const project = this.db.projects.getById(input.projectId);
    if (!project) throw new Error(`Project not found: ${input.projectId}`);
    const account = this.db.googleAccounts.getById(input.accountId);
    if (!account) throw new Error(`Account not found: ${input.accountId}`);

    const notebookName = formatNotebookName(project.title);
    const instructions = loadNotebookInstructions(this.db, input.projectId);
    const instructionsHash = hashText(instructions);
    const sourceNames = [...DRIVE_PROJECT_FILES];
    const knowledgeSources = buildKnowledgeSources(this.db, input.projectId);
    const sourceFilesDir = path.join(
      pathsService.getPath('cache'),
      'automation',
      input.accountId,
      'notebook-sources',
      input.projectId,
    );
    const knowledgeFilePaths = writeKnowledgeSourceFiles(sourceFilesDir, knowledgeSources);

    let mapping = this.db.notebooks.upsert({
      project_id: input.projectId,
      google_account_id: input.accountId,
      notebook_name: notebookName,
      status: 'provisioning',
      instructions_hash: instructionsHash,
      last_error: null,
    });

    const diagnosticsDir = path.join(
      pathsService.getPath('cache'),
      'automation',
      input.accountId,
      'notebook',
    );

    const profile = this.db.googleAccounts.getProfile(input.accountId);
    if (!profile) throw new Error('Browser profile missing for worker');
    const profilePath = browserProfileManager.resolveProfilePath(profile.profile_dir_name);

    await this.freeProfileForNotebook(input.accountId, profilePath);

    let lockHeld = true;
    profileLockManager.acquire(profilePath, input.accountId);
    const releaseLock = (): void => {
      if (!lockHeld) return;
      profileLockManager.release(profilePath, input.accountId);
      lockHeld = false;
    };

    const { chromium } = await import('playwright');
    let context: import('playwright').BrowserContext | null = null;

    try {
      context = await chromium.launchPersistentContext(profilePath, {
        // Headed: Google NotebookLM often blank / login-wall under headless.
        headless: input.headless ?? false,
        args: ['--disable-blink-features=AutomationControlled'],
      });
      const page = context.pages()[0] ?? (await context.newPage());
      const provider = new NotebookProvider({
        diagnosticsDir,
        baseUrl: input.baseUrl,
      });
      provider.attachPage(page);

      const handOffAssisted = async (
        step: NotebookAssistedStep,
        errorMessage: string,
      ): Promise<ProvisionNotebookResult> => {
        await context?.close().catch(() => undefined);
        context = null;
        releaseLock();
        return this.enterAssisted(mapping.id, input, step, errorMessage, notebookName);
      };

      const available = await provider.detectAvailability();
      if (!available) {
        return await handOffAssisted('create_notebook', 'NotebookLM UI not detected');
      }

      const notebook = await provider.ensureNotebook(notebookName);

      await provider.openNotebook(notebookName);
      mapping = this.db.notebooks.upsert({
        project_id: input.projectId,
        google_account_id: input.accountId,
        notebook_name: notebookName,
        notebook_id: notebook.id,
        resource_url: notebook.url ?? page.url(),
        status: 'provisioning',
        instructions_hash: instructionsHash,
      });

      try {
        await attachKnowledgeSources(
          provider,
          knowledgeSources,
          sourceNames,
          knowledgeFilePaths,
        );
      } catch (error) {
        if (error instanceof AutomationError) {
          return await handOffAssisted('add_sources', error.message);
        }
        throw error;
      }

      const verified = await provider.verifySources(sourceNames);
      // Live UI may title cards differently than filenames; accept by count after upload.
      if (!verified.ok && verified.present.length < sourceNames.length) {
        return await handOffAssisted(
          'verify',
          `Missing sources: ${verified.missing.join(', ')}`,
        );
      }

      let instructionsApplied = false;
      try {
        await provider.setInstructions(instructions);
        instructionsApplied = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('Notebook instructions skipped after sources verified', { message });
      }

      const ready = this.db.notebooks.upsert({
        project_id: input.projectId,
        google_account_id: input.accountId,
        notebook_name: notebookName,
        notebook_id: mapping.notebook_id,
        resource_url: mapping.resource_url ?? page.url(),
        status: 'ready',
        instructions_hash: instructionsApplied ? instructionsHash : null,
        assisted_step: null,
        last_error: instructionsApplied
          ? null
          : 'Sources ready; custom instructions not set (Configure chat → Custom)',
        last_verified_at: new Date().toISOString(),
      });
      getNotebookSyncService(this.db).markNotebookVerified(
        input.projectId,
        input.accountId,
      );
      this.releaseAccountBusyForTranslate(input.accountId);
      return {
        mapping: this.toDto(ready),
        assisted: false,
        message: instructionsApplied
          ? 'Notebook provisioned and verified'
          : 'Notebook sources ready; set Custom instructions in Configure chat if needed',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = error instanceof AutomationError ? error.code : 'UNKNOWN_UI';
      logger.warn('Notebook provision failed', { message, code });

      if (code === 'SELECTOR_NOT_FOUND' || code === 'LOGIN_REQUIRED') {
        await context?.close().catch(() => undefined);
        context = null;
        releaseLock();
        return await this.enterAssisted(
          mapping.id,
          input,
          'create_notebook',
          message,
          notebookName,
        );
      }

      this.db.notebooks.upsert({
        project_id: input.projectId,
        google_account_id: input.accountId,
        notebook_name: notebookName,
        status: 'error',
        last_error: message,
      });
      throw error;
    } finally {
      await context?.close().catch(() => undefined);
      releaseLock();
    }
  }

  async resumeAssisted(input: {
    projectId: string;
    accountId: string;
    headless?: boolean;
    baseUrl?: string;
  }): Promise<ProvisionNotebookResult> {
    const existing = this.db.notebooks.getByProjectAndWorker(
      input.projectId,
      input.accountId,
    );
    if (!existing) {
      return this.provision(input);
    }

    const project = this.db.projects.getById(input.projectId);
    if (!project) throw new Error(`Project not found: ${input.projectId}`);
    const notebookName = existing.notebook_name ?? formatNotebookName(project.title);
    const sourceNames = [...DRIVE_PROJECT_FILES];
    const knowledgeSources = buildKnowledgeSources(this.db, input.projectId);
    const knowledgeFilePaths = writeKnowledgeSourceFiles(
      path.join(
        pathsService.getPath('cache'),
        'automation',
        input.accountId,
        'notebook-sources',
        input.projectId,
      ),
      knowledgeSources,
    );
    const instructions = loadNotebookInstructions(this.db, input.projectId);
    const assistedStep =
      (existing.assisted_step as NotebookAssistedStep | null) ?? 'create_notebook';

    const profile = this.db.googleAccounts.getProfile(input.accountId);
    if (!profile) throw new Error('Browser profile missing');
    const profilePath = browserProfileManager.resolveProfilePath(profile.profile_dir_name);
    const diagnosticsDir = path.join(
      pathsService.getPath('cache'),
      'automation',
      input.accountId,
      'notebook',
    );

    // Close Accounts / leftover assisted Chromium so we can own userDataDir.
    await this.freeProfileForNotebook(input.accountId, profilePath);

    let lockHeld = true;
    profileLockManager.acquire(profilePath, input.accountId);
    const releaseLock = (): void => {
      if (!lockHeld) return;
      profileLockManager.release(profilePath, input.accountId);
      lockHeld = false;
    };

    const { chromium } = await import('playwright');
    let context: import('playwright').BrowserContext | null = null;

    try {
      // Headed so user can finish login / manual steps if automation stops.
      context = await chromium.launchPersistentContext(profilePath, {
        headless: input.headless ?? false,
        args: ['--disable-blink-features=AutomationControlled'],
      });
      const page = context.pages()[0] ?? (await context.newPage());
      const provider = new NotebookProvider({
        diagnosticsDir,
        baseUrl: input.baseUrl,
      });
      provider.attachPage(page);

      const handOffAssisted = async (
        step: NotebookAssistedStep,
        errorMessage: string,
      ): Promise<ProvisionNotebookResult> => {
        await context?.close().catch(() => undefined);
        context = null;
        releaseLock();
        return this.enterAssisted(existing.id, input, step, errorMessage, notebookName);
      };

      const available = await provider.detectAvailability();
      if (!available) {
        return await handOffAssisted(
          assistedStep,
          'NotebookLM UI not available — log in at notebook.google.com in the opened browser, then Resume',
        );
      }

      let found = await provider.findNotebookByName(notebookName);
      if (!found) {
        try {
          // Never stop at "still missing" without attempting create/rename-untitled.
          found = await provider.ensureNotebook(notebookName);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const code = error instanceof AutomationError ? error.code : 'UNKNOWN_UI';
          if (code === 'SELECTOR_NOT_FOUND' || code === 'LOGIN_REQUIRED' || code === 'UNKNOWN_UI') {
            return await handOffAssisted('create_notebook', message);
          }
          throw error;
        }
      }

      await provider.openNotebook(notebookName);

      try {
        await attachKnowledgeSources(
          provider,
          knowledgeSources,
          sourceNames,
          knowledgeFilePaths,
        );
      } catch (error) {
        if (error instanceof AutomationError) {
          return await handOffAssisted('add_sources', error.message);
        }
        throw error;
      }

      const verified = await provider.verifySources(sourceNames);
      // Live UI may title cards differently than filenames; accept by count after upload.
      if (!verified.ok && verified.present.length < sourceNames.length) {
        return await handOffAssisted(
          'add_sources',
          `Missing sources: ${verified.missing.join(', ')}. ` +
            `Present: ${verified.present.join(', ') || '(none)'}. ` +
            `Upload 00_…05_.md (or Copied text), then Resume`,
        );
      }

      let instructionsApplied = false;
      try {
        await provider.setInstructions(instructions);
        instructionsApplied = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('Notebook instructions skipped after sources verified', { message });
      }

      const ready = this.db.notebooks.upsert({
        project_id: input.projectId,
        google_account_id: input.accountId,
        notebook_name: notebookName,
        notebook_id: found.id,
        resource_url: page.url(),
        status: 'ready',
        assisted_step: null,
        last_error: instructionsApplied
          ? null
          : 'Sources ready; custom instructions not set (Configure chat → Custom)',
        last_verified_at: new Date().toISOString(),
        instructions_hash: instructionsApplied ? hashText(instructions) : null,
      });

      this.releaseAccountBusyForTranslate(input.accountId);

      const { markProviderRunSuccess } = await import('./diagnostics-service');
      markProviderRunSuccess(this.db, 'google-notebook');

      return {
        mapping: this.toDto(ready),
        assisted: false,
        message: instructionsApplied
          ? 'Assisted setup complete — notebook verified'
          : 'Notebook sources ready; set Custom instructions in Configure chat if needed',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = error instanceof AutomationError ? error.code : 'UNKNOWN_UI';
      logger.warn('Notebook resume failed', { message, code });

      if (code === 'SELECTOR_NOT_FOUND' || code === 'LOGIN_REQUIRED') {
        await context?.close().catch(() => undefined);
        context = null;
        releaseLock();
        return await this.enterAssisted(
          existing.id,
          input,
          assistedStep,
          message,
          notebookName,
        );
      }

      this.db.notebooks.upsert({
        project_id: input.projectId,
        google_account_id: input.accountId,
        notebook_name: notebookName,
        status: 'error',
        last_error: message,
      });
      throw error;
    } finally {
      await context?.close().catch(() => undefined);
      releaseLock();
    }
  }

  /**
   * Close Accounts-managed Chromium (and clear stale locks) so Notebook can
   * launchPersistentContext on the same userDataDir.
   */
  private async freeProfileForNotebook(
    accountId: string,
    profilePath: string,
  ): Promise<void> {
    try {
      const { getAccountWorkerService } = await import('./account-worker-singleton');
      await getAccountWorkerService().closeBrowser(accountId);
    } catch (error) {
      logger.warn('Could not close account browser before Notebook', {
        accountId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (profileLockManager.isLocked(profilePath)) {
      logger.warn('Force-clearing leftover profile lock before Notebook', {
        accountId,
      });
      profileLockManager.forceClearStaleLock(profilePath);
    }
  }

  /**
   * After Notebook setup, account often stays BUSY because assisted browser
   * is still open — restore READY so translate preflight / Accounts UI match.
   */
  private releaseAccountBusyForTranslate(accountId: string): void {
    const account = this.db.googleAccounts.getById(accountId);
    if (account?.status === 'BUSY' && (account.email || account.drive_connected === 1)) {
      this.db.googleAccounts.update(accountId, { status: 'READY' });
    }
    const worker = this.db.workerStates.getByAccountId(accountId);
    if (worker?.health === 'BUSY' && !worker.current_job_id) {
      this.db.workerStates.markReady(worker.id);
    }
  }

  private async enterAssisted(
    mappingId: string,
    input: { projectId: string; accountId: string; baseUrl?: string },
    step: NotebookAssistedStep,
    errorMessage: string,
    notebookName: string,
  ): Promise<ProvisionNotebookResult> {
    const row = this.db.notebooks.markAssisted(mappingId, step, errorMessage);

    let browserNote = '';
    try {
      // Prefer AccountWorker session (tracks lock + focus on re-open).
      const { getAccountWorkerService } = await import('./account-worker-singleton');
      // Ensure leftover Playwright from provision/resume does not hold the profile.
      const profile = this.db.googleAccounts.getProfile(input.accountId);
      if (profile) {
        const profilePath = browserProfileManager.resolveProfilePath(
          profile.profile_dir_name,
        );
        await this.freeProfileForNotebook(input.accountId, profilePath);
      }
      await getAccountWorkerService().openBrowser(input.accountId, 'notebook');
      logger.info('Assisted setup browser opened via AccountWorker', {
        accountId: input.accountId,
        step,
        notebookName,
      });
    } catch (error) {
      // Fallback: direct Playwright open (tests / AccountWorker unavailable).
      const profile = this.db.googleAccounts.getProfile(input.accountId);
      if (profile) {
        const profilePath = browserProfileManager.resolveProfilePath(
          profile.profile_dir_name,
        );
        try {
          await this.freeProfileForNotebook(input.accountId, profilePath);
          await this.browser.open({
            accountId: input.accountId,
            profilePath,
            startUrl: input.baseUrl ?? 'https://notebook.google.com/',
            headless: false,
          });
          logger.info('Assisted setup browser opened (fallback)', {
            accountId: input.accountId,
            step,
            notebookName,
          });
        } catch (fallbackError) {
          browserNote =
            ' Browser failed to open: ' +
            (fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError));
          logger.warn('Failed to open assisted browser', {
            error:
              fallbackError instanceof Error
                ? fallbackError.message
                : String(fallbackError),
            primary: error instanceof Error ? error.message : String(error),
          });
        }
      } else {
        browserNote =
          ' Browser failed to open: ' +
          (error instanceof Error ? error.message : String(error));
        logger.warn('Failed to open assisted browser', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const assistedRow =
      row ??
      this.db.notebooks.getByProjectAndWorker(input.projectId, input.accountId);
    if (!assistedRow) {
      throw new Error('Notebook mapping missing after assisted setup');
    }

    return {
      mapping: this.toDto(assistedRow),
      assisted: true,
      message: `Automation stopped at ${step}: ${errorMessage}. Complete in browser (no CAPTCHA bypass), then Resume.${browserNote}`,
    };
  }

  private toDto(row: {
    project_id: string;
    google_account_id: string | null;
    notebook_name: string | null;
    notebook_id: string | null;
    resource_url: string | null;
    status: string;
    assisted_step: string | null;
    last_error: string | null;
    last_verified_at: string | null;
    knowledge_version?: number;
    local_knowledge_version?: number;
    last_sync_at?: string | null;
    last_drive_sync_at?: string | null;
  }): NotebookMappingDto {
    return {
      projectId: row.project_id,
      accountId: row.google_account_id ?? '',
      notebookName: row.notebook_name ?? '',
      notebookId: row.notebook_id,
      resourceUrl: row.resource_url,
      status: row.status,
      assistedStep: row.assisted_step,
      lastError: row.last_error,
      lastVerifiedAt: row.last_verified_at,
      knowledgeVersion: row.knowledge_version ?? 0,
      localKnowledgeVersion: row.local_knowledge_version ?? 0,
      lastSyncAt: row.last_sync_at ?? null,
      lastDriveSyncAt: row.last_drive_sync_at ?? null,
    };
  }
}
