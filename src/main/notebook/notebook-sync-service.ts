import type { DatabaseManager } from '../db/database-manager';
import {
  KNOWLEDGE_FILE_NAMES,
  KNOWLEDGE_TYPES,
  type KnowledgeType,
} from '@shared/constants/knowledge';
import { NotebookKnowledgeBuilder, loadNotebookSettings } from './knowledge-builder';
import {
  FILE_KEY_TO_NAME,
  OWNED_FILE_KEYS,
  writeKnowledgeSourceFiles,
} from '../drive/drive-content-builder';
import { logger } from '../logging/logger';
import path from 'node:path';
import { pathsService } from '../services/paths-service';
import {
  getNotebookLayout,
  listKnowledgeSyncMappings,
  resolveNotebookForPurpose,
  resolveResearchNotebook,
  resolveTranslationNotebook,
} from './notebook-resolver';
import type { NotebookLayout } from '@shared/constants/notebook-role';
import type { VersionProbeStatus } from '@shared/constants/notebook-version-probe';
import {
  runKnowledgeVersionProbe,
  type VersionProbeCapture,
} from './notebook-version-probe';
import { buildActiveHotMemoryText as buildHotMemoryFromSqlite } from './hot-memory-builder';
import { resolveProjectWorker } from '../services/project-worker-resolver';

function looksLikeStatusMessage(text: string): boolean {
  return /delta after job|memory delta applied|term delta:|recent context after|world fact after/i.test(
    text,
  );
}

const TYPE_BY_EVENT: Record<string, KnowledgeType[]> = {
  PROJECT_METADATA_CHANGED: ['book_profile'],
  TERM_CHANGED: ['project_terms'],
  CHARACTER_CHANGED: ['characters'],
  RELATIONSHIP_CHANGED: ['relationships'],
  STORY_STATE_CHANGED: ['story_state', 'recent_context'],
  WORLD_KNOWLEDGE_CHANGED: ['world_knowledge'],
  RECENT_CONTEXT_CHANGED: ['recent_context'],
  ALL: [...KNOWLEDGE_TYPES],
};

export type KnowledgeDirtyEvent = keyof typeof TYPE_BY_EVENT;

export interface NotebookHealthDto {
  projectId: string;
  accountId: string | null;
  notebookName: string | null;
  status: string;
  localVersion: number;
  notebookVersion: number;
  pendingKnowledgeVersion: number;
  verifiedKnowledgeVersion: number;
  versionProbeStatus: VersionProbeStatus;
  lastSyncAt: string | null;
  lastVerifiedAt: string | null;
  lastDriveSyncAt: string | null;
  lastError: string | null;
  instructionsReady: boolean;
  files: {
    type: KnowledgeType;
    name: string;
    dirty: boolean;
    localVersion: number;
    remoteVersion: number;
    contentHash: string | null;
  }[];
  dirty: boolean;
  usableForSlimPack: boolean;
  knowledgeVerified: boolean;
}

export interface NotebookRoleHealthDto {
  projectId: string;
  accountId: string | null;
  role: string;
  notebookName: string | null;
  status: string;
  lastVerifiedAt: string | null;
  lastDriveSyncAt: string | null;
  lastError: string | null;
  resourceUrl: string | null;
}

export interface NotebookDualHealthDto {
  projectId: string;
  layout: NotebookLayout;
  translation: NotebookHealthDto;
  research: NotebookRoleHealthDto | null;
}

export class NotebookSyncService {
  private readonly builder: NotebookKnowledgeBuilder;

  constructor(
    private readonly db: DatabaseManager,
    private readonly syncProjectDrive?: (projectId: string) => Promise<unknown>,
  ) {
    this.builder = new NotebookKnowledgeBuilder(db);
  }

  /**
   * Mark knowledge dirty. Do NOT pass status messages as hotPayload —
   * Hot Memory is built from SQLite deltas since Notebook verified (see hot-memory-builder).
   * Optional hotPayload kept only for rare structured overrides / tests.
   */
  markDirty(projectId: string, event: KnowledgeDirtyEvent, hotPayload?: string): void {
    const types = TYPE_BY_EVENT[event] ?? [...KNOWLEDGE_TYPES];
    this.db.knowledgeFiles.markAllDirty(projectId, types);
    const localVersion = this.db.knowledgeFiles.maxLocalVersion(projectId);
    for (const mapping of listKnowledgeSyncMappings(this.db, projectId)) {
      this.db.notebooks.bumpLocalKnowledgeVersion(mapping.id, localVersion);
      if (mapping.status === 'ready' || mapping.status === 'sync_pending') {
        this.db.notebooks.setStatus(mapping.id, 'stale');
      }
    }
    this.db.driveSyncState.patch(projectId, {
      versionProbeStatus: 'pending',
    });
    if (hotPayload?.trim() && !looksLikeStatusMessage(hotPayload)) {
      this.db.notebookHotDeltas.insert(projectId, event, hotPayload.trim());
    }
    logger.info('Knowledge marked dirty', { projectId, event, types });
    this.db.knowledgeSyncEvents.insert({
      projectId,
      eventType: 'KNOWLEDGE_DIRTY',
      message: `Knowledge dirty: ${event}`,
      metadata: { event, types },
    });
  }

  rebuildKnowledge(projectId: string): ReturnType<NotebookKnowledgeBuilder['buildAll']> {
    return this.builder.rebuildAndTrack(projectId);
  }

  writeLocalSources(projectId: string, accountId: string): string[] {
    const docs = this.rebuildKnowledge(projectId);
    const sources = OWNED_FILE_KEYS.map((key) => ({
      name: FILE_KEY_TO_NAME[key],
      content: docs[key],
    }));
    const dir = path.join(
      pathsService.getPath('cache'),
      'automation',
      accountId,
      'notebook-sources',
      projectId,
    );
    return writeKnowledgeSourceFiles(dir, sources);
  }

  /**
   * Drive upload then mark sync_pending. CONTENT_CURRENT requires version probe —
   * do not clear Hot Memory here.
   */
  async syncDrive(projectId: string): Promise<{ updated: boolean }> {
    this.db.knowledgeSyncEvents.insert({
      projectId,
      eventType: 'DRIVE_SYNC_STARTED',
      message: 'Đã gửi dữ liệu bộ nhớ lên Google Drive.',
    });
    this.rebuildKnowledge(projectId);

    if (this.syncProjectDrive) {
      await this.syncProjectDrive(projectId);
    }

    for (const type of KNOWLEDGE_TYPES) {
      this.db.knowledgeFiles.markDriveSynced(projectId, type);
    }

    for (const mapping of listKnowledgeSyncMappings(this.db, projectId)) {
      this.db.notebooks.markDriveSynced(mapping.id);
    }

    this.db.driveSyncState.patch(projectId, {
      versionProbeStatus: 'pending',
    });

    this.db.knowledgeSyncEvents.insert({
      projectId,
      eventType: 'DRIVE_SYNC_COMPLETED',
      message: 'Đã cập nhật dữ liệu trên Google Drive.',
    });
    this.db.knowledgeSyncEvents.insert({
      projectId,
      eventType: 'DRIVE_SYNCED',
      message: 'Drive sync completed.',
    });
    this.db.knowledgeSyncEvents.insert({
      projectId,
      eventType: 'NOTEBOOK_SYNC_PENDING',
      message: 'Đang chờ Notebook cập nhật nguồn (version probe).',
    });

    return { updated: true };
  }

  /**
   * Advance chapters_since_sync by real translated chapter count (batch 101–103 → +3).
   * Critical changes can force shouldSync early. Does not upload Drive.
   */
  evaluateSyncPolicy(
    projectId: string,
    input: { chapterCount: number; critical?: boolean },
  ): { shouldSync: boolean; chaptersSinceSync: number } {
    const delta = Math.max(0, Math.floor(input.chapterCount));

    if (input.critical) {
      this.db.driveSyncState.patch(projectId, {
        criticalChangePending: true,
        syncStatus: 'pending',
      });
    }

    const refreshed = this.db.driveSyncState.ensure(projectId);
    const next = refreshed.chapters_since_sync + delta;
    const shouldSync =
      refreshed.critical_change_pending === 1 ||
      next >= refreshed.sync_every_n_chapters;

    this.db.driveSyncState.patch(projectId, {
      chaptersSinceSync: shouldSync ? 0 : next,
      criticalChangePending: shouldSync ? false : refreshed.critical_change_pending === 1,
      ...(shouldSync ? { syncStatus: 'pending' as const } : {}),
    });

    return {
      shouldSync,
      chaptersSinceSync: shouldSync ? 0 : next,
    };
  }

  /** @deprecated Prefer evaluateSyncPolicy with explicit chapterCount. */
  maybeAutoSyncAfterChapter(projectId: string): { shouldSync: boolean } {
    const settings = loadNotebookSettings(this.db, projectId);
    const state = this.db.driveSyncState.ensure(projectId);
    const next = state.chapters_since_sync + 1;
    const dirty = this.db.knowledgeFiles.anyDirty(projectId);
    const shouldSync =
      dirty &&
      (state.critical_change_pending === 1 || next >= settings.syncEveryNChapters);
    this.db.driveSyncState.patch(projectId, {
      chaptersSinceSync: shouldSync ? 0 : next,
      criticalChangePending: shouldSync ? false : state.critical_change_pending === 1,
      ...(shouldSync ? { syncStatus: 'pending' as const } : {}),
    });
    return { shouldSync };
  }

  /**
   * @deprecated Name-only verify is NOT CONTENT_CURRENT.
   * Prefer verifyKnowledgeVersion after Drive sync.
   */
  markNotebookVerified(
    projectId: string,
    accountId: string,
    _role: 'TRANSLATION' | 'SINGLE' = 'TRANSLATION',
  ): void {
    const state = this.db.driveSyncState.ensure(projectId);
    if (
      state.version_probe_status === 'verified' &&
      state.verified_knowledge_version === state.pending_knowledge_version &&
      state.verified_sync_nonce &&
      state.verified_sync_nonce === state.pending_sync_nonce
    ) {
      const mapping = resolveTranslationNotebook(this.db, projectId, accountId);
      if (!mapping) return;
      for (const type of KNOWLEDGE_TYPES) {
        this.db.knowledgeFiles.markVerified(projectId, type);
      }
      this.db.notebooks.markVerified(mapping.id);
      this.db.notebookHotDeltas.clearActive(projectId);
      return;
    }
    logger.warn(
      'markNotebookVerified ignored — requires NOTEBOOK_VERSION_VERIFIED (version+nonce probe)',
      { projectId, accountId },
    );
  }

  /**
   * Prove Notebook reads pending sync-state version+nonce. Clears hot only on match.
   */
  async verifyKnowledgeVersion(
    projectId: string,
    accountId: string,
    capture?: VersionProbeCapture,
  ): Promise<{ status: string; packHint: 'slim' | 'hybrid' }> {
    const captureFn =
      capture ?? (await this.createBrowserVersionCapture(projectId, accountId));
    const result = await runKnowledgeVersionProbe(this.db, {
      projectId,
      accountId,
      capture: captureFn,
    });
    return { status: result.status, packHint: result.packHint };
  }

  /** Fire-and-forget background retry — never blocks translation. */
  scheduleBackgroundVersionProbe(projectId: string, accountId: string): void {
    const delays = [5_000, 30_000, 120_000];
    let attempt = 0;
    const tick = () => {
      const state = this.db.driveSyncState.ensure(projectId);
      if (state.version_probe_status === 'verified') return;
      void this.verifyKnowledgeVersion(projectId, accountId)
        .then((r) => {
          if (r.status === 'verified') return;
          attempt += 1;
          if (attempt < delays.length) {
            setTimeout(tick, delays[attempt]);
          }
        })
        .catch(() => {
          attempt += 1;
          if (attempt < delays.length) {
            setTimeout(tick, delays[attempt]);
          }
        });
    };
    setTimeout(tick, delays[0]);
  }

  private async createBrowserVersionCapture(
    projectId: string,
    accountId: string,
  ): Promise<VersionProbeCapture> {
    const { GeminiBrowserProvider } = await import(
      '../automation/providers/google/gemini-browser-provider'
    );
    const { getBrowserRuntimeManager } = await import(
      '../automation/browser-runner/browser-runtime-manager'
    );
    const { browserProfileManager } = await import(
      '../automation/browser-runner/profile-manager'
    );
    const { newId } = await import('../db/utils/uuid');
    const { pathsService } = await import('../services/paths-service');
    const pathMod = await import('node:path');

    const mapping = resolveTranslationNotebook(this.db, projectId, accountId);
    if (!mapping?.resource_url) {
      throw new Error('Translation Notebook URL missing for version probe');
    }
    const profile = this.db.googleAccounts.getProfile(accountId);
    if (!profile) throw new Error('Browser profile missing for version probe');
    const profilePath = browserProfileManager.resolveProfilePath(profile.profile_dir_name);
    const diagnosticsDir = pathMod.join(
      pathsService.getPath('cache'),
      'automation',
      accountId,
      'notebook-version-probe',
    );

    return async (prompt: string) => {
      const provider = new GeminiBrowserProvider({
        diagnosticsDir,
        maxTimeoutMs: 90_000,
        expectedNotebookUrl: mapping.resource_url,
      });
      const runtimeManager = getBrowserRuntimeManager();
      return runtimeManager.runExclusive(
        {
          accountId,
          profilePath,
          diagnosticsDir,
          headless: true,
        },
        async ({ runtime, prepareNotebook }) => {
          void runtime;
          const page = await prepareNotebook({
            projectId,
            notebookUrl: mapping.resource_url ?? '',
            openNotebook: async (p, url) => {
              provider.attachPage(p);
              await provider.openProjectNotebook(url || mapping.resource_url);
            },
            verifyReady: async (p) => {
              provider.attachPage(p);
              const ok = await provider.healthCheck();
              if (!ok.ok) {
                await provider.openProjectNotebook(mapping.resource_url);
              }
            },
          });
          provider.attachPage(page);
          await provider.createOrOpenTranslationThread({ forceNew: false });
          const correlationId = newId();
          await provider.submitPlainPrompt(prompt, correlationId);
          await provider.waitForGenerationStart();
          await provider.waitForGenerationComplete(correlationId);
          const raw = await provider.extractLatestResponse(correlationId);
          await provider.detach();
          return raw.text;
        },
      );
    };
  }

  getHealth(
    projectId: string,
    accountId?: string | null,
    role: 'TRANSLATION' | 'RESEARCH' | 'SINGLE' = 'TRANSLATION',
  ): NotebookHealthDto {
    const mappings = this.db.notebooks.listByProject(projectId);
    let mapping =
      accountId != null
        ? resolveNotebookForPurpose(
            this.db,
            projectId,
            accountId,
            role === 'RESEARCH' ? 'research' : 'translation',
          )
        : null;
    if (!mapping && mappings.length > 0) {
      mapping =
        mappings.find((m) => m.notebook_role === role) ??
        mappings.find((m) => m.notebook_role === 'TRANSLATION') ??
        mappings.find((m) => m.notebook_role === 'SINGLE') ??
        mappings[0];
    }

    const files = KNOWLEDGE_TYPES.map((type) => {
      const row = this.db.knowledgeFiles.ensure(projectId, type);
      return {
        type,
        name: KNOWLEDGE_FILE_NAMES[type],
        dirty: row.dirty === 1,
        localVersion: row.local_version,
        remoteVersion: row.remote_version,
        contentHash: row.content_hash,
      };
    });

    const driveState = this.db.driveSyncState.ensure(projectId);
    const pendingKnowledgeVersion = driveState.pending_knowledge_version;
    const verifiedKnowledgeVersion = driveState.verified_knowledge_version;
    const versionProbeStatus = (driveState.version_probe_status ||
      'pending') as VersionProbeStatus;
    const knowledgeVerified =
      versionProbeStatus === 'verified' &&
      verifiedKnowledgeVersion === pendingKnowledgeVersion &&
      Boolean(driveState.verified_sync_nonce) &&
      driveState.verified_sync_nonce === driveState.pending_sync_nonce;

    const localVersion = this.db.knowledgeFiles.maxLocalVersion(projectId);
    if (!mapping) {
      return {
        projectId,
        accountId: null,
        notebookName: null,
        status: 'pending',
        localVersion,
        notebookVersion: 0,
        pendingKnowledgeVersion,
        verifiedKnowledgeVersion,
        versionProbeStatus,
        lastSyncAt: null,
        lastVerifiedAt: null,
        lastDriveSyncAt: null,
        lastError: null,
        files,
        dirty: this.db.knowledgeFiles.anyDirty(projectId),
        usableForSlimPack: false,
        knowledgeVerified: false,
        instructionsReady: false,
      };
    }

    const status = mapping.status;
    const bindings = mapping.notebook_id
      ? this.db.notebookSourceBindings.listByNotebook(projectId, mapping.notebook_id)
      : this.db.notebookSourceBindings.listByProject(projectId);
    const grounding =
      bindings.length === 0
        ? knowledgeVerified
        : bindings.some((b) => b.status === 'active') &&
          !bindings.some((b) => b.status === 'needs_migration');
    // SLIM only when CONTENT_CURRENT (version+nonce probe) — not SOURCE_PRESENT alone.
    const usableForSlimPack =
      status === 'ready' &&
      knowledgeVerified &&
      grounding &&
      !this.db.knowledgeFiles.anyDirty(projectId);

    return {
      projectId,
      accountId: mapping.google_account_id,
      notebookName: mapping.notebook_name,
      status,
      localVersion: Math.max(localVersion, pendingKnowledgeVersion),
      notebookVersion: verifiedKnowledgeVersion || mapping.knowledge_version,
      pendingKnowledgeVersion,
      verifiedKnowledgeVersion,
      versionProbeStatus,
      lastSyncAt: mapping.last_sync_at,
      lastVerifiedAt: mapping.last_verified_at,
      lastDriveSyncAt: mapping.last_drive_sync_at,
      lastError: mapping.last_error,
      instructionsReady: mapping.instructions_hash != null && mapping.instructions_hash.length > 0,
      files,
      dirty: this.db.knowledgeFiles.anyDirty(projectId),
      usableForSlimPack,
      knowledgeVerified,
    };
  }

  getDualHealth(projectId: string, accountId?: string | null): NotebookDualHealthDto {
    const resolvedAccount =
      accountId ??
      resolveProjectWorker(this.db, {
        projectId,
        purpose: 'notebook',
      }).accountId ??
      null;

    const layout =
      resolvedAccount != null
        ? getNotebookLayout(this.db, projectId, resolvedAccount)
        : 'DUAL';

    const translation = this.getHealth(projectId, resolvedAccount, 'TRANSLATION');

    let research: NotebookRoleHealthDto | null = null;
    if (layout === 'DUAL' && resolvedAccount) {
      const researchRow = resolveResearchNotebook(this.db, projectId, resolvedAccount);
      research = researchRow
        ? {
            projectId,
            accountId: researchRow.google_account_id,
            role: 'RESEARCH',
            notebookName: researchRow.notebook_name,
            status: researchRow.status,
            lastVerifiedAt: researchRow.last_verified_at,
            lastDriveSyncAt: researchRow.last_drive_sync_at,
            lastError: researchRow.last_error,
            resourceUrl: researchRow.resource_url,
          }
        : {
            projectId,
            accountId: resolvedAccount,
            role: 'RESEARCH',
            notebookName: null,
            status: 'pending',
            lastVerifiedAt: null,
            lastDriveSyncAt: null,
            lastError: null,
            resourceUrl: null,
          };
    }

    return { projectId, layout, translation, research };
  }

  buildActiveHotMemoryText(
    projectId: string,
    options?: { anchorChapter?: number | null; maxLines?: number; force?: boolean },
  ): string {
    return buildHotMemoryFromSqlite(this.db, projectId, options);
  }
}
