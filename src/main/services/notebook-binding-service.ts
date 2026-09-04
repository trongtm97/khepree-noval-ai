import type { Page } from 'playwright';
import type { DatabaseManager } from '../db/database-manager';
import type { NotebookResourceRow } from '../db/repositories/notebook-repository';
import { NotebookProvider } from '../automation/providers/google/notebook-provider';
import type { NotebookRole } from '@shared/constants/notebook-role';
import {
  coerceNotebookRole,
  DEFAULT_NOTEBOOK_ROLE,
} from '@shared/constants/notebook-role';
import type { NotebookStatus } from '@shared/constants/notebook';
import type { NotebookBinding } from '@shared/schemas/notebook';
import { notebookBindingInaccessiblePayload } from '@shared/constants/notebook-binding-access';
import { NOTEBOOK_BINDING_OWNER_ERROR } from '@shared/constants/notebook-binding-owner';

/**
 * HARD REQUIREMENT 8–18 — sole owner of NotebookLM remote create/reuse
 * and durable SQLite binding persistence (`notebook_resources`).
 *
 * HARD REQUIREMENT 15 — binding owner = story/project only.
 * Series/World may share knowledge; do NOT create NotebookLM by seriesId,
 * campaignId, jobId, or chapterId.
 *
 * HARD REQUIREMENT 18 — existing user data:
 * - Do not rename persisted column keys.
 * - Missing binding is valid; never block app/project open.
 * - Create only when NotebookLM is actually needed; then reuse.
 *
 * Canonical op: getOrCreateNotebookBinding (get-or-reuse; create only if unbound).
 * Retry op: reuseNotebookBindingForRetry (allowCreate:false — never create).
 * Sync read: getNotebookForStory.
 * Concurrency: story-level promise mutex + double-check before create.
 *
 * Callers (must not call NotebookProvider.create/ensure directly):
 * - NotebookService.provision / resumeAssisted
 * - full-novel-preprocess-orchestrator
 * - IPC notebook.provision ← UI
 * - notebook-send-readiness-service
 */
export interface NotebookRemoteBinding {
  name: string;
  id: string | null;
  url: string;
}

export interface NotebookBindingMapping {
  notebook_id: string | null;
  notebook_name: string | null;
  resource_url: string | null;
}

/** HARD REQUIREMENT 10 — result of get-or-reuse (create only when unbound). */
export type GetOrCreateNotebookResult =
  | {
      outcome: 'reused';
      created: false;
      binding: NotebookBinding;
      remote: NotebookRemoteBinding;
      row: NotebookResourceRow;
    }
  | {
      outcome: 'needs_reconnect';
      created: false;
      binding: NotebookBinding;
      remote?: undefined;
      row: NotebookResourceRow;
      /** Human-readable (VI) — never invent a new NotebookLM project. */
      userMessage: string;
      /** Operator / logs — keep separate from userMessage. */
      technicalDetail: string;
      actions: import('@shared/constants/notebook-binding-access').NotebookBindingAccessAction[];
      /** @deprecated use technicalDetail */
      message: string;
    }
  | {
      outcome: 'created';
      created: true;
      binding: NotebookBinding;
      remote: NotebookRemoteBinding;
      row: NotebookResourceRow;
    };

export class NotebookBindingService {
  constructor(private readonly db: DatabaseManager | null = null) {}

  /**
   * HARD REQUIREMENT 11+15 — story-level create lock (promise-chain mutex).
   * Keyed by projectId + role only (story owns the notebook; account is worker).
   * Never key by seriesId / campaignId / jobId / chapterId.
   */
  private readonly createLockTails = new Map<string, Promise<unknown>>();

  /** @internal tests */
  clearCreateLocksForTests(): void {
    this.createLockTails.clear();
  }

  private createLockKey(projectId: string, role: NotebookRole): string {
    return `story:${projectId}:role:${role}`;
  }

  /**
   * HARD REQUIREMENT 15 — owner must be an existing story/project row.
   * Rejects accidental use of series/campaign/job/chapter UUIDs as owner.
   */
  assertStoryProjectOwner(projectId: string): void {
    const db = this.requireDb();
    if (!db.projects.getById(projectId)) {
      throw new Error(NOTEBOOK_BINDING_OWNER_ERROR);
    }
  }

  private withStoryCreateLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.createLockTails.get(key) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(() => fn());
    this.createLockTails.set(
      key,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }

  private requireDb(): DatabaseManager {
    if (!this.db) {
      throw new Error('NotebookBindingService requires database for durable binding ops');
    }
    return this.db;
  }

  /** True when SQLite already stores a remote NotebookLM project id. */
  hasRemoteBinding(row: NotebookResourceRow | NotebookBinding | null | undefined): boolean {
    if (!row) return false;
    if ('notebookId' in row) return Boolean(row.notebookId);
    return Boolean(row.notebook_id);
  }

  /**
   * HARD REQUIREMENT 10+18 — sync get for story.
   * Returns persisted binding when a remote notebookId exists; never creates.
   * Unbound legacy stories → null (valid; does not block open).
   */
  getNotebookForStory(projectId: string): NotebookBinding | null {
    const binding = this.getBindingForStory(projectId);
    if (!binding || !this.hasRemoteBinding(binding)) return null;
    return binding;
  }

  /**
   * HARD REQUIREMENT 16+18 — Production Center notebook resolve.
   *
   * production job → projectId → this service → existing NotebookLM binding.
   * Never creates. Never uses campaignId/jobId/chapterId as owner.
   * Missing project / missing binding → null (never throws; never invents).
   */
  resolveNotebookForProductionJob(projectId: string): NotebookBinding | null {
    const db = this.db;
    if (!db?.projects.getById(projectId)) return null;
    return this.getNotebookForStory(projectId);
  }

  /** Load durable binding from SQLite (survives restart). */
  getBinding(
    projectId: string,
    accountId: string,
    role: NotebookRole = DEFAULT_NOTEBOOK_ROLE,
  ): NotebookBinding | null {
    const row = this.requireDb().notebooks.getByProjectWorkerRole(
      projectId,
      accountId,
      role,
    );
    return row ? this.toBinding(row) : null;
  }

  /** Any durable binding for the story (prefers SINGLE, then RESEARCH). */
  getBindingForStory(projectId: string): NotebookBinding | null {
    const rows = this.requireDb()
      .notebooks.listByProject(projectId)
      .filter((r) => !r.deprecated_at);
    const preferred =
      rows.find((r) => r.notebook_role === 'SINGLE' && r.notebook_id) ??
      rows.find((r) => r.notebook_role === 'RESEARCH' && r.notebook_id) ??
      rows.find((r) => r.notebook_id) ??
      rows[0];
    return preferred ? this.toBinding(preferred) : null;
  }

  /**
   * HARD REQUIREMENT 10+11+12 — canonical get-or-reuse with story create lock.
   *
   * 1. Look for persisted story binding (project + worker + role).
   * 2. If remote notebookId exists → reuse; never create another project.
   * 3. If bound but access fails → mark reconnect; never silent create.
   * 4. Only when unbound may create — under story-level mutex + double-check.
   * 5. Persist immediately after successful create.
   * 6. Concurrent callers serialize; only one creation; all get same binding.
   * 7. HR12: retries / reconnect / resume pass allowCreate:false — never create.
   *    Also refuse create if this story+role already has any remote notebookId.
   */
  async getOrCreateNotebookBinding(input: {
    projectId: string;
    accountId: string;
    preferredName: string;
    role?: NotebookRole;
    editionId?: string | null;
    provider: NotebookProvider;
    page: Page;
    instructionsHash?: string | null;
    /**
     * When false (retry / reconnect / resume-after-bind), never create a remote
     * NotebookLM project. Default true only for first-time provision.
     */
    allowCreate?: boolean;
  }): Promise<GetOrCreateNotebookResult> {
    const role = input.role ?? DEFAULT_NOTEBOOK_ROLE;
    const allowCreate = input.allowCreate !== false;
    const db = this.requireDb();
    this.assertStoryProjectOwner(input.projectId);

    // Fast path: already bound on this worker — no create lock.
    const existing =
      db.notebooks.getByProjectWorkerRole(
        input.projectId,
        input.accountId,
        role,
      ) ?? null;
    if (existing && this.hasRemoteBinding(existing)) {
      return this.reuseOrMarkReconnect(input, role, existing);
    }

    // Unbound (or race): acquire story create lock, then CHECK AGAIN.
    const lockKey = this.createLockKey(input.projectId, role);
    return this.withStoryCreateLock(lockKey, async () => {
      const again =
        db.notebooks.getByProjectWorkerRole(
          input.projectId,
          input.accountId,
          role,
        ) ?? null;
      if (again && this.hasRemoteBinding(again)) {
        return this.reuseOrMarkReconnect(input, role, again);
      }

      // Story+role already has a remote binding (other row / restart) — reuse it.
      const storyRemote = this.findStoryRemoteRow(input.projectId, role);
      if (storyRemote?.notebook_id) {
        const rebound = this.persistBinding({
          projectId: input.projectId,
          accountId: input.accountId,
          notebookName: input.preferredName,
          role,
          editionId: input.editionId,
          notebookId: storyRemote.notebook_id,
          notebookUrl: storyRemote.resource_url,
          status: 'provisioning',
          instructionsHash: input.instructionsHash,
          lastError: null,
          assistedStep: null,
        });
        return this.reuseOrMarkReconnect(input, role, rebound);
      }

      // HR12: retry / reconnect must not create.
      if (!allowCreate) {
        return this.refuseCreateOnRetry(input, role, again);
      }

      return this.createAndPersistBinding(input, role, again);
    });
  }

  /**
   * HARD REQUIREMENT 12 — retry / job retry / campaign retry / reconnect /
   * resume-after-restart: reuse original binding only. Never create.
   */
  async reuseNotebookBindingForRetry(input: {
    projectId: string;
    accountId: string;
    preferredName: string;
    role?: NotebookRole;
    editionId?: string | null;
    provider: NotebookProvider;
    page: Page;
    instructionsHash?: string | null;
  }): Promise<GetOrCreateNotebookResult> {
    return this.getOrCreateNotebookBinding({ ...input, allowCreate: false });
  }

  /** Any row for this story+role that already stores a remote notebook id. */
  findStoryRemoteRow(
    projectId: string,
    role: NotebookRole,
  ): NotebookResourceRow | null {
    const rows = this.requireDb()
      .notebooks.listByProject(projectId)
      .filter(
        (r) =>
          r.notebook_role === role &&
          Boolean(r.notebook_id) &&
          !r.deprecated_at,
      );
    return rows[0] ?? null;
  }

  private refuseCreateOnRetry(
    input: {
      projectId: string;
      accountId: string;
      preferredName: string;
      editionId?: string | null;
      instructionsHash?: string | null;
    },
    role: NotebookRole,
    row: NotebookResourceRow | null,
  ): GetOrCreateNotebookResult {
    const technical =
      'Retry/reconnect refused to create a new NotebookLM project — no reusable binding found';
    const inaccessible = notebookBindingInaccessiblePayload(technical);
    const unavailable = this.persistBinding({
      projectId: input.projectId,
      accountId: input.accountId,
      notebookName: input.preferredName,
      role,
      editionId: input.editionId,
      notebookId: row?.notebook_id ?? null,
      notebookUrl: row?.resource_url ?? null,
      status: 'unavailable',
      instructionsHash: input.instructionsHash,
      lastError: technical,
    });
    return {
      outcome: 'needs_reconnect',
      created: false,
      binding: this.toBinding(unavailable),
      row: unavailable,
      userMessage: inaccessible.userMessage,
      technicalDetail: inaccessible.technicalDetail,
      actions: inaccessible.actions,
      message: inaccessible.technicalDetail,
    };
  }

  private async reuseOrMarkReconnect(
    input: {
      projectId: string;
      accountId: string;
      preferredName: string;
      editionId?: string | null;
      provider: NotebookProvider;
      page: Page;
      instructionsHash?: string | null;
    },
    role: NotebookRole,
    row: NotebookResourceRow,
  ): Promise<GetOrCreateNotebookResult> {
    try {
      const remote = await this.resolveOrCreateRemote({
        provider: input.provider,
        mapping: this.toMapping(row),
        preferredName: input.preferredName,
        page: input.page,
      });
      await input.provider.openNotebook(remote.name);
      const persisted = this.persistBinding({
        projectId: input.projectId,
        accountId: input.accountId,
        notebookName: input.preferredName,
        role,
        editionId: input.editionId,
        notebookId: row.notebook_id,
        notebookUrl: remote.url,
        status:
          row.status === 'assisted_setup' || row.status === 'unavailable'
            ? 'provisioning'
            : (row.status as NotebookStatus),
        instructionsHash: input.instructionsHash,
        lastError: null,
        assistedStep: null,
      });
      return {
        outcome: 'reused',
        created: false,
        binding: this.toBinding(persisted),
        remote: {
          name: remote.name,
          id: persisted.notebook_id,
          url: remote.url,
        },
        row: persisted,
      };
    } catch (error) {
      const technical =
        error instanceof Error
          ? error.message
          : `NotebookLM access failed for bound project ${row.notebook_id}`;
      const inaccessible = notebookBindingInaccessiblePayload(
        `Bound NotebookLM project needs reconnect/relink: ${technical}`,
      );
      // HR13: mark unavailable — never create a replacement NotebookLM project.
      const unavailable = this.persistBinding({
        projectId: input.projectId,
        accountId: input.accountId,
        notebookName: input.preferredName,
        role,
        editionId: input.editionId,
        notebookId: row.notebook_id,
        notebookUrl: row.resource_url,
        status: 'unavailable',
        lastError: inaccessible.technicalDetail,
        instructionsHash: input.instructionsHash,
      });
      return {
        outcome: 'needs_reconnect',
        created: false,
        binding: this.toBinding(unavailable),
        row: unavailable,
        userMessage: inaccessible.userMessage,
        technicalDetail: inaccessible.technicalDetail,
        actions: inaccessible.actions,
        message: inaccessible.technicalDetail,
      };
    }
  }

  private async createAndPersistBinding(
    input: {
      projectId: string;
      accountId: string;
      preferredName: string;
      editionId?: string | null;
      provider: NotebookProvider;
      page: Page;
      instructionsHash?: string | null;
    },
    role: NotebookRole,
    row: NotebookResourceRow | null,
  ): Promise<GetOrCreateNotebookResult> {
    const remote = await this.resolveOrCreateRemote({
      provider: input.provider,
      mapping: {
        notebook_id: null,
        notebook_name: row?.notebook_name ?? null,
        resource_url: null,
      },
      preferredName: input.preferredName,
      page: input.page,
    });
    await input.provider.openNotebook(remote.name);
    const persisted = this.persistBinding({
      projectId: input.projectId,
      accountId: input.accountId,
      notebookName: input.preferredName,
      role,
      editionId: input.editionId,
      notebookId: remote.id,
      notebookUrl: remote.url,
      status: 'provisioning',
      instructionsHash: input.instructionsHash,
      lastError: null,
      assistedStep: null,
    });
    return {
      outcome: 'created',
      created: true,
      binding: this.toBinding(persisted),
      remote,
      row: persisted,
    };
  }

  /**
   * Persist durable story ↔ NotebookLM relationship immediately.
   * Call right after remote create/reuse so mid-provision crash still keeps IDs.
   */
  persistBinding(input: {
    projectId: string;
    accountId: string;
    notebookName: string;
    role?: NotebookRole;
    editionId?: string | null;
    notebookId?: string | null;
    notebookUrl?: string | null;
    status?: NotebookStatus;
    lastVerifiedAt?: string | null;
    instructionsHash?: string | null;
    assistedStep?: null;
    lastError?: string | null;
  }): NotebookResourceRow {
    this.assertStoryProjectOwner(input.projectId);
    return this.requireDb().notebooks.upsert({
      project_id: input.projectId,
      google_account_id: input.accountId,
      notebook_name: input.notebookName,
      notebook_role: input.role ?? DEFAULT_NOTEBOOK_ROLE,
      edition_id: input.editionId ?? null,
      notebook_id: input.notebookId,
      resource_url: input.notebookUrl,
      status: input.status,
      last_verified_at: input.lastVerifiedAt,
      instructions_hash: input.instructionsHash,
      assisted_step: input.assistedStep,
      last_error: input.lastError,
    });
  }

  toBinding(row: NotebookResourceRow): NotebookBinding {
    return {
      projectId: row.project_id,
      accountId: row.google_account_id,
      notebookId: row.notebook_id,
      notebookUrl: row.resource_url,
      notebookName: row.notebook_name,
      role: coerceNotebookRole(row.notebook_role),
      status: (row.status ?? '').trim() || 'pending',
      createdAt: row.created_at || '1970-01-01T00:00:00.000Z',
      lastVerifiedAt: row.last_verified_at,
    };
  }

  toMapping(row: NotebookResourceRow): NotebookBindingMapping {
    return {
      notebook_id: row.notebook_id,
      notebook_name: row.notebook_name,
      resource_url: row.resource_url,
    };
  }

  /**
   * ONE STORY = ONE NOTEBOOKLM PROJECT.
   * If SQLite already stores notebook_id, open/reuse it.
   * Never create a new remote notebook when a binding already exists.
   */
  async resolveOrCreateRemote(input: {
    provider: NotebookProvider;
    mapping: NotebookBindingMapping;
    preferredName: string;
    page: Page;
  }): Promise<NotebookRemoteBinding> {
    const { provider, mapping, preferredName, page } = input;

    if (mapping.notebook_id) {
      const namesToTry = [mapping.notebook_name, preferredName].filter(
        (n): n is string => Boolean(n && n.trim()),
      );

      for (const name of namesToTry) {
        const byName = await provider.findNotebookByName(name);
        if (byName) {
          return {
            name: byName.name,
            id: mapping.notebook_id,
            url: byName.url ?? mapping.resource_url ?? page.url(),
          };
        }
      }

      if (mapping.resource_url) {
        await page.goto(mapping.resource_url, {
          waitUntil: 'domcontentloaded',
          timeout: 45_000,
        });
        return {
          name: mapping.notebook_name ?? preferredName,
          id: mapping.notebook_id,
          url: page.url(),
        };
      }

      throw new Error(
        `Bound NotebookLM project ${mapping.notebook_id} not found; refusing to create a duplicate for this story`,
      );
    }

    return NotebookProvider.runOwnedCreate(async () => {
      const created = await provider.ensureNotebook(preferredName);
      return {
        name: created.name,
        id: created.id,
        url: created.url ?? page.url(),
      };
    });
  }

  /** Open an already-bound notebook by URL or name. Never creates. */
  async openBound(input: {
    provider: NotebookProvider;
    mapping: NotebookBindingMapping;
    preferredName: string;
    page: Page;
  }): Promise<NotebookRemoteBinding> {
    const { provider, mapping, preferredName, page } = input;
    const url = mapping.resource_url?.startsWith('http') ? mapping.resource_url : null;
    if (url) {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });
      return {
        name: mapping.notebook_name ?? preferredName,
        id: mapping.notebook_id,
        url: page.url(),
      };
    }

    const name = mapping.notebook_name ?? preferredName;
    const found = await provider.findNotebookByName(name);
    if (found) {
      await provider.openNotebook(found.name);
      return {
        name: found.name,
        id: mapping.notebook_id ?? found.id,
        url: found.url ?? page.url(),
      };
    }

    throw new Error(
      `NotebookLM binding missing for "${name}" — request via NotebookBindingService.getOrCreateNotebookBinding first`,
    );
  }
}
