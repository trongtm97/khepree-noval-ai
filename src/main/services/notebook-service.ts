import { APP_NAME } from '@shared/constants/app';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { DatabaseManager } from '../db/database-manager';
import { NotebookProvider } from '../automation/providers/google/notebook-provider';
import { AutomationError } from '../automation/errors/automation-errors';
import { formatNotebookNameForRole, DEFAULT_NOTEBOOK_ROLE, type NotebookRole } from '@shared/constants/notebook-role';
import { getActiveEdition } from './edition-service';
import type { NotebookAssistedStep } from '@shared/constants/notebook';
import { getLanguageProfile } from '@shared/constants/language-profile';
import { KNOWLEDGE_PROJECT_DOC_TITLES } from '@shared/constants/notebook-source-binding';
import type { NotebookSourceBindingType } from '@shared/constants/notebook-source-binding';
import { LEGACY_BINDING_DRIVE_LIVE } from '../knowledge/legacy-db-values';
import {
  KNOWLEDGE_FILE_NAMES,
  KNOWLEDGE_TYPES,
  type KnowledgeType,
} from '@shared/constants/knowledge';
import {
  FILE_KEY_TO_NAME,
  OWNED_FILE_KEYS,
  writeKnowledgeSourceFiles,
} from '../notebook/knowledge-source-files';
import { NotebookKnowledgeBuilder } from '../notebook/knowledge-builder';
import { resolveResearchNotebook, resolveTranslationNotebook } from '../notebook/notebook-resolver';
import { attachKnowledgeSources } from '../notebook/attach-knowledge-sources';
import type { BrowserSessionController } from '../automation/browser-runner/browser-session-controller';
import { PlaywrightBrowserSessionController } from '../automation/browser-runner/browser-session-controller';
import { browserProfileManager } from '../automation/browser-runner/profile-manager';
import { profileLockManager, startLeaseHeartbeat } from '../automation/browser-runner/profile-lock';
import { pathsService } from './paths-service';
import { logger } from '../logging/logger';
import { getNotebookSyncService } from '../notebook/notebook-sync-service-singleton';

export interface NotebookMappingDto {
  projectId: string;
  accountId: string;
  notebookName: string;
  notebookRole: string;
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

function recordSourceBindings(
  db: DatabaseManager,
  projectId: string,
  notebookId: string | null,
  bindingType: NotebookSourceBindingType,
  needsMigration: string[],
): void {
  for (const type of KNOWLEDGE_TYPES) {
    const fileName = KNOWLEDGE_FILE_NAMES[type];
    const docTitle = fileName.replace(/\.md$/i, '');
    const kf = db.knowledgeFiles.get(projectId, type);
    const status =
      bindingType === 'STATIC_UPLOAD' || bindingType === 'COPIED_TEXT'
        ? needsMigration.some((n) => n.includes(docTitle) || n.includes(type))
          ? 'needs_migration'
          : 'active'
        : 'needs_migration';

    db.notebookSourceBindings.upsert({
      projectId,
      notebookId,
      knowledgeType: type,
      driveFileId: kf?.drive_file_id ?? null,
      sourceName: fileName,
      bindingType,
      contentHash: kf?.content_hash ?? null,
      localVersion: kf?.local_version ?? 0,
      remoteVersion: kf?.remote_version ?? 0,
      lastVerifiedVersion: status === 'active' ? (kf?.local_version ?? 0) : 0,
      status,
    });
  }
}

/** Report whether Translation Notebook still has static / degraded bindings. */
export function listStaticKnowledgeBindings(
  db: DatabaseManager,
  projectId: string,
): { knowledgeType: KnowledgeType; bindingType: string; status: string; sourceName: string }[] {
  return db.notebookSourceBindings
    .listByProject(projectId)
    .filter(
      (row) =>
        row.binding_type === LEGACY_BINDING_DRIVE_LIVE ||
        row.status === 'needs_migration',
    )
    .map((row) => ({
      knowledgeType: row.knowledge_type as KnowledgeType,
      bindingType: row.binding_type,
      status: row.status,
      sourceName: row.source_name,
    }));
}

function loadNotebookInstructions(
  db: DatabaseManager,
  projectId: string,
  role: NotebookRole,
): string {
  const row = db
    .getConnection()
    .prepare(`SELECT style_config FROM project_settings WHERE project_id = ?`)
    .get(projectId) as { style_config: string | null } | undefined;

  const project = db.projects.getById(projectId);
  const sourceCode = project?.source_language ?? 'zh-Hans';
  const targetCode = project?.target_language ?? 'vi';
  const sourceName = getLanguageProfile(sourceCode).nativeName;
  const targetName = getLanguageProfile(targetCode).nativeName;

  const lines: string[] =
    role === 'RESEARCH'
      ? [
          `Notebook RESEARCH — full corpus for whole-novel analysis (${APP_NAME}).`,
          '',
          'Contains NOVEL_PART_* sections (source corpus).',
          'Use for: terminology discovery, characters, relationships, world, plot.',
          'Do NOT translate chapter prose here — import results into SQLite then sync to Translation Notebook.',
          'Avoid future spoilers when answering — note first_seen_chapter when possible.',
        ]
      : [
          `This Notebook is long-term knowledge memory for a novel translation project: ${sourceName} → ${targetName} (${APP_NAME}).`,
          `Source language: ${sourceName} (${sourceCode}). Target language: ${targetName} (${targetCode}).`,
          '',
          'Always prioritize these sources:',
          'Translation Rules, Project Terms, Characters, Relationships, Story State, World Knowledge, Recent Context.',
          '',
          'Do not invent story facts beyond sources when asked about novel data.',
          'For character names and terms, prefer confirmed / LOCKED Project Terms.',
          'Official Summary in Book Profile is NOT current state — Story State is current.',
          'HOT MEMORY in the Translation Pack overrides Notebook on conflict (not yet synced).',
          'Do not translate the whole novel here; translate only when given a Translation Pack with Source + Output Protocol.',
        ];

  if (role !== 'RESEARCH' && row?.style_config) {
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

  getMapping(
    projectId: string,
    accountId: string,
    role?: NotebookRole,
  ): NotebookMappingDto | null {
    const row = role
      ? this.db.notebooks.getByProjectWorkerRole(projectId, accountId, role)
      : resolveTranslationNotebook(this.db, projectId, accountId);
    return row ? this.toDto(row) : null;
  }

  listMappings(projectId: string): NotebookMappingDto[] {
    return this.db.notebooks.listByProject(projectId).map((row) => this.toDto(row));
  }

  /** Open Research Notebook URL in worker browser (optional feature). */
  async openResearch(input: {
    projectId: string;
    accountId?: string;
  }): Promise<{ ok: boolean; url: string | null }> {
    const { resolveProjectWorker } = await import('./project-worker-resolver');
    const accountId =
      input.accountId ??
      resolveProjectWorker(this.db, {
        projectId: input.projectId,
        purpose: 'research',
      }).accountId;
    if (!accountId) {
      throw new Error('Chưa gắn tài khoản Google cho Research Notebook.');
    }
    const mapping = resolveResearchNotebook(this.db, input.projectId, accountId);
    const url = mapping?.resource_url ?? 'https://notebook.google.com/';
    const profile = this.db.googleAccounts.getProfile(accountId);
    if (!profile) throw new Error('Browser profile missing');
    const profilePath = browserProfileManager.resolveProfilePath(profile.profile_dir_name);
    await this.freeProfileForNotebook(accountId, profilePath);
    await this.browser.open({
      accountId,
      profilePath,
      startUrl: url,
      headless: false,
    });
    return { ok: true, url };
  }

  async researchQuery(input: {
    projectId: string;
    accountId?: string;
    question: string;
  }) {
    const { queryResearchNotebook } = await import('../notebook/research-query-service');
    return queryResearchNotebook(this.db, input);
  }

  async provision(input: {
    projectId: string;
    accountId: string;
    headless?: boolean;
    baseUrl?: string;
    role?: NotebookRole;
  }): Promise<ProvisionNotebookResult> {
    const project = this.db.projects.getById(input.projectId);
    if (!project) throw new Error(`Project not found: ${input.projectId}`);
    const account = this.db.googleAccounts.getById(input.accountId);
    if (!account) throw new Error(`Account not found: ${input.accountId}`);

    const notebookRole = input.role ?? DEFAULT_NOTEBOOK_ROLE;
    const activeEdition =
      notebookRole === 'RESEARCH' ? null : getActiveEdition(this.db, input.projectId);
    const notebookName = formatNotebookNameForRole(project.title, notebookRole, {
      targetLanguage: activeEdition?.target_language ?? project.target_language,
      editionTitle: activeEdition?.name ?? project.target_title ?? project.title,
    });
    const attachKnowledge = notebookRole !== 'RESEARCH';
    const instructions = loadNotebookInstructions(this.db, input.projectId, notebookRole);
    const instructionsHash = hashText(instructions);
    const sourceNames = attachKnowledge ? [...KNOWLEDGE_PROJECT_DOC_TITLES] : [];
    const knowledgeSources = attachKnowledge
      ? buildKnowledgeSources(this.db, input.projectId)
      : [];
    const sourceFilesDir = path.join(
      pathsService.getPath('cache'),
      'automation',
      input.accountId,
      'notebook-sources',
      input.projectId,
      notebookRole.toLowerCase(),
    );
    const knowledgeFilePaths = attachKnowledge
      ? writeKnowledgeSourceFiles(sourceFilesDir, knowledgeSources)
      : [];

    let mapping = this.db.notebooks.upsert({
      project_id: input.projectId,
      google_account_id: input.accountId,
      notebook_name: notebookName,
      notebook_role: notebookRole,
      edition_id: activeEdition?.id ?? null,
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
    profileLockManager.acquireLease({
      profilePath,
      ownerId: input.accountId,
      accountId: input.accountId,
      operation: 'notebook_setup',
      label: 'Thiết lập Notebook',
    });
    const stopHeartbeat = startLeaseHeartbeat(profileLockManager, {
      profilePath,
      ownerId: input.accountId,
    });
    const releaseLock = (): void => {
      if (!lockHeld) return;
      stopHeartbeat();
      profileLockManager.releaseLease(profilePath, input.accountId);
      lockHeld = false;
    };

    const { launchKhepreeNovelAIPersistentContext } = await import(
      '../automation/browser-runner/launch-persistent-context'
    );
    let context: import('playwright').BrowserContext | null = null;

    try {
      context = (
        await launchKhepreeNovelAIPersistentContext({
          profilePath,
          // Headed: Google NotebookLM often blank / login-wall under headless.
          headless: input.headless,
          headlessDefault: false,
          diagnosticsDir,
        })
      ).context;
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
        notebook_role: notebookRole,
        notebook_id: notebook.id,
        resource_url: notebook.url ?? page.url(),
        status: 'provisioning',
        instructions_hash: instructionsHash,
      });

      if (attachKnowledge) {
        try {
          const attachResult = await attachKnowledgeSources({
            provider,
            knowledgeSources,
            filePaths: knowledgeFilePaths,
          });
          recordSourceBindings(
            this.db,
            input.projectId,
            notebook.id,
            attachResult.bindingType,
            attachResult.needsMigration,
          );
          if (attachResult.migrationGuide) {
            logger.warn('Notebook knowledge sources need migration', {
              projectId: input.projectId,
              guide: attachResult.migrationGuide,
              staticRemaining: attachResult.staticRemaining,
            });
          }
        } catch (error) {
          if (error instanceof AutomationError) {
            return await handOffAssisted('add_sources', error.message);
          }
          throw error;
        }

        const verified = await provider.verifySources(sourceNames);
        this.db.knowledgeSyncEvents.insert({
          projectId: input.projectId,
          eventType: 'NOTEBOOK_SOURCE_PRESENT',
          message: verified.ok
            ? `Sources present (${verified.present.length}).`
            : `Sources partial; missing: ${verified.missing.join(', ')}`,
        });
        if (!verified.ok && verified.present.length < sourceNames.length) {
          return await handOffAssisted(
            'verify',
            `Missing sources: ${verified.missing.join(', ')}`,
          );
        }
      }

      let _instructionsApplied = false;
      try {
        await provider.setInstructions(instructions);
        _instructionsApplied = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('Notebook instructions failed after sources verified', { message });
        await context.close().catch(() => undefined);
        context = null;
        releaseLock();
        const userMessage = attachKnowledge
          ? `Nguồn đã sẵn sàng; chưa đặt Custom instructions (Configure chat → Custom). ${message}`
          : message;
        return await this.enterAssisted(
          mapping.id,
          input,
          'set_instructions',
          userMessage,
          notebookName,
        );
      }
      void _instructionsApplied;

      // SOURCE_PRESENT ≠ CONTENT_CURRENT — stay sync_pending until version probe.
      const ready = this.db.notebooks.upsert({
        project_id: input.projectId,
        google_account_id: input.accountId,
        notebook_name: notebookName,
        notebook_role: notebookRole,
        notebook_id: mapping.notebook_id,
        resource_url: mapping.resource_url ?? page.url(),
        status: attachKnowledge ? 'sync_pending' : 'ready',
        instructions_hash: instructionsHash,
        assisted_step: null,
        last_error: null,
        last_verified_at: attachKnowledge ? null : new Date().toISOString(),
      });
      if (attachKnowledge) {
        getNotebookSyncService(this.db).scheduleBackgroundVersionProbe(
          input.projectId,
          input.accountId,
        );
      }
      this.releaseAccountBusyForTranslate(input.accountId);
      return {
        mapping: this.toDto(ready),
        assisted: false,
        message: attachKnowledge
          ? 'Notebook đã thiết lập; đang chờ xác minh knowledge version.'
          : 'Notebook đã thiết lập và xác minh.',
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
        notebook_role: notebookRole,
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
    role?: NotebookRole;
  }): Promise<ProvisionNotebookResult> {
    const notebookRole = input.role ?? DEFAULT_NOTEBOOK_ROLE;
    const existing = this.db.notebooks.getByProjectWorkerRole(
      input.projectId,
      input.accountId,
      notebookRole,
    );
    if (!existing) {
      return this.provision({ ...input, role: notebookRole });
    }

    const project = this.db.projects.getById(input.projectId);
    if (!project) throw new Error(`Project not found: ${input.projectId}`);
    const notebookName =
      existing.notebook_name ?? formatNotebookNameForRole(project.title, notebookRole);
    const attachKnowledge = notebookRole !== 'RESEARCH';
    const sourceNames = attachKnowledge ? [...KNOWLEDGE_PROJECT_DOC_TITLES] : [];
    const knowledgeSources = attachKnowledge
      ? buildKnowledgeSources(this.db, input.projectId)
      : [];
    const knowledgeFilePaths = attachKnowledge
      ? writeKnowledgeSourceFiles(
          path.join(
            pathsService.getPath('cache'),
            'automation',
            input.accountId,
            'notebook-sources',
            input.projectId,
            notebookRole.toLowerCase(),
          ),
          knowledgeSources,
        )
      : [];
    const instructions = loadNotebookInstructions(this.db, input.projectId, notebookRole);
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
    profileLockManager.acquireLease({
      profilePath,
      ownerId: input.accountId,
      accountId: input.accountId,
      operation: 'notebook_setup',
      label: 'Tiếp tục thiết lập Notebook',
    });
    const stopHeartbeat = startLeaseHeartbeat(profileLockManager, {
      profilePath,
      ownerId: input.accountId,
    });
    const releaseLock = (): void => {
      if (!lockHeld) return;
      stopHeartbeat();
      profileLockManager.releaseLease(profilePath, input.accountId);
      lockHeld = false;
    };

    const { launchKhepreeNovelAIPersistentContext } = await import(
      '../automation/browser-runner/launch-persistent-context'
    );
    let context: import('playwright').BrowserContext | null = null;

    try {
      // Headed so user can finish login / manual steps if automation stops.
      context = (
        await launchKhepreeNovelAIPersistentContext({
          profilePath,
          headless: input.headless,
          headlessDefault: false,
          diagnosticsDir,
        })
      ).context;
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

      if (attachKnowledge) {
        try {
          const attachResult = await attachKnowledgeSources({
            provider,
            knowledgeSources,
            filePaths: knowledgeFilePaths,
          });
          recordSourceBindings(
            this.db,
            input.projectId,
            found.id,
            attachResult.bindingType,
            attachResult.needsMigration,
          );
          if (attachResult.migrationGuide) {
            logger.warn('Notebook knowledge sources need migration', {
              projectId: input.projectId,
              guide: attachResult.migrationGuide,
              staticRemaining: attachResult.staticRemaining,
            });
          }
        } catch (error) {
          if (error instanceof AutomationError) {
            return await handOffAssisted('add_sources', error.message);
          }
          throw error;
        }

        const verified = await provider.verifySources(sourceNames);
        this.db.knowledgeSyncEvents.insert({
          projectId: input.projectId,
          eventType: 'NOTEBOOK_SOURCE_PRESENT',
          message: verified.ok
            ? `Sources present (${verified.present.length}).`
            : `Sources partial; missing: ${verified.missing.join(', ')}`,
        });
        if (!verified.ok && verified.present.length < sourceNames.length) {
          return await handOffAssisted(
            'add_sources',
            `Missing sources: ${verified.missing.join(', ')}. ` +
              `Present: ${verified.present.join(', ') || '(none)'}. ` +
              `Add knowledge files 00_…08_ (local upload), then Resume`,
          );
        }
      }

      let _instructionsApplied = false;
      try {
        await provider.setInstructions(instructions);
        _instructionsApplied = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('Notebook instructions failed after sources verified', { message });
        await context.close().catch(() => undefined);
        context = null;
        releaseLock();
        const userMessage = attachKnowledge
          ? `Nguồn đã sẵn sàng; chưa đặt Custom instructions (Configure chat → Custom). ${message}`
          : message;
        return await this.enterAssisted(
          existing.id,
          input,
          'set_instructions',
          userMessage,
          notebookName,
        );
      }
      void _instructionsApplied;

      const ready = this.db.notebooks.upsert({
        project_id: input.projectId,
        google_account_id: input.accountId,
        notebook_name: notebookName,
        notebook_role: notebookRole,
        notebook_id: found.id,
        resource_url: page.url(),
        status: attachKnowledge ? 'sync_pending' : 'ready',
        assisted_step: null,
        last_error: null,
        last_verified_at: attachKnowledge ? null : new Date().toISOString(),
        instructions_hash: hashText(instructions),
      });

      if (attachKnowledge) {
        getNotebookSyncService(this.db).scheduleBackgroundVersionProbe(
          input.projectId,
          input.accountId,
        );
      }

      this.releaseAccountBusyForTranslate(input.accountId);

      const { markProviderRunSuccess } = await import('./diagnostics-service');
      markProviderRunSuccess(this.db, 'google-notebook');

      return {
        mapping: this.toDto(ready),
        assisted: false,
        message: attachKnowledge
          ? 'Notebook đã thiết lập; đang chờ xác minh knowledge version.'
          : 'Notebook đã thiết lập và xác minh.',
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
        notebook_role: notebookRole,
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
      const { getBrowserRuntimeManager } = await import(
        '../automation/browser-runner/browser-runtime-manager'
      );
      await getBrowserRuntimeManager().evictForExternalLaunch(accountId);
    } catch (error) {
      logger.warn('Could not evict browser runtime before Notebook', {
        accountId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    try {
      const { getAccountWorkerService } = await import('./account-worker-singleton');
      await getAccountWorkerService().closeBrowser(accountId);
    } catch (error) {
      logger.warn('Could not close account browser before Notebook', {
        accountId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    profileLockManager.recoverIfStale(profilePath);
  }

  /**
   * After Notebook setup, account often stays BUSY because assisted browser
   * is still open — restore READY so translate preflight / Accounts UI match.
   */
  private releaseAccountBusyForTranslate(accountId: string): void {
    const account = this.db.googleAccounts.getById(accountId);
    if (account?.status === 'BUSY' && account.email) {
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
      this.db.notebooks.getByProjectWorkerRole(
        input.projectId,
        input.accountId,
        'TRANSLATION',
      ) ??
      resolveTranslationNotebook(this.db, input.projectId, input.accountId);
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
    notebook_role?: string | null;
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
      notebookRole: row.notebook_role ?? DEFAULT_NOTEBOOK_ROLE,
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
