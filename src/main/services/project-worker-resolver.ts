import type { DatabaseManager } from '../db/database-manager';
import type {
  ProjectWorkerPurpose,
  ProjectWorkerSource,
} from '@shared/constants/project-worker';
import type { ProjectWorkerResolutionDto } from '@shared/schemas/project-worker';

export interface ResolveProjectWorkerInput {
  projectId: string;
  purpose?: ProjectWorkerPurpose;
  /** Explicit UI selection — used only after binding sources (priority 4). */
  preferredAccountId?: string | null;
  /** Prefer this job's pin / assigned worker when active. */
  jobId?: string | null;
}

function upper(value: string | null | undefined): string {
  return (value ?? '').toUpperCase();
}

function isUsable(status: string | null | undefined): boolean {
  const s = upper(status);
  return s === 'READY' || s === 'BUSY';
}

function accountEmail(
  db: DatabaseManager,
  accountId: string | null,
): { email: string | null; displayName: string | null } {
  if (!accountId) return { email: null, displayName: null };
  const row = db.googleAccounts.getById(accountId);
  return {
    email: row?.email ?? null,
    displayName: row?.display_name ?? row?.label ?? null,
  };
}

/**
 * Active / pinned job worker for this project (priority 1).
 */
export function resolveActiveJobWorkerAccountId(
  db: DatabaseManager,
  projectId: string,
  jobId?: string | null,
): string | null {
  if (jobId) {
    const job = db.jobs.getById(jobId);
    if (job?.project_id === projectId) {
      if (job.pinned_account_id) return job.pinned_account_id;
      if (job.worker_id) {
        const worker = db.workerStates.getById(job.worker_id);
        if (worker?.google_account_id) return worker.google_account_id;
      }
      try {
        const progress = JSON.parse(job.progress ?? '{}') as { accountId?: string };
        if (progress.accountId) return progress.accountId;
      } catch {
        /* ignore */
      }
    }
  }

  const active = db.jobs
    .listByProject(projectId)
    .filter((j) => {
      const s = upper(j.state);
      return (
        s === 'RUNNING' ||
        s === 'QUEUED' ||
        s === 'REPAIRING' ||
        s === 'WAITING_WORKER' ||
        s === 'WAITING_AI'
      );
    })
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));

  for (const job of active) {
    if (job.pinned_account_id) return job.pinned_account_id;
    if (job.worker_id) {
      const worker = db.workerStates.getById(job.worker_id);
      if (worker?.google_account_id) return worker.google_account_id;
    }
    try {
      const progress = JSON.parse(job.progress ?? '{}') as { accountId?: string };
      if (progress.accountId) return progress.accountId;
    } catch {
      /* ignore */
    }
  }
  return null;
}

const USABLE_NOTEBOOK_STATUSES = new Set([
  'ready',
  'sync_pending',
  'stale',
  'assisted_setup',
  'provisioning',
]);

/**
 * Translation / Research Notebook mapped account (priority 2).
 * When several accounts have notebooks, prefer the Drive-assigned worker's mapping
 * so setWorker → assignWorker correctly rebinds the project.
 */
export function resolveNotebookMappedAccountId(
  db: DatabaseManager,
  projectId: string,
  purpose: ProjectWorkerPurpose,
): string | null {
  const mappings = db.notebooks.listByProject(projectId);
  const preferRoles =
    purpose === 'research'
      ? (['RESEARCH', 'SINGLE'] as const)
      : (['TRANSLATION', 'SINGLE'] as const);
  const driveAccountId =
    db.driveSyncState.getByProject(projectId)?.google_account_id ?? null;

  const pick = (accountFilter: string | null): string | null => {
    const scoped = accountFilter
      ? mappings.filter((m) => m.google_account_id === accountFilter)
      : mappings;
    for (const role of preferRoles) {
      const hit = scoped.find(
        (m) =>
          m.notebook_role === role &&
          m.google_account_id &&
          USABLE_NOTEBOOK_STATUSES.has(m.status),
      );
      if (hit?.google_account_id) return hit.google_account_id;
    }
    const any =
      scoped.find(
        (m) =>
          (m.notebook_role === 'TRANSLATION' || m.notebook_role === 'SINGLE') &&
          m.google_account_id,
      ) ??
      (purpose === 'research'
        ? scoped.find((m) => m.notebook_role === 'RESEARCH' && m.google_account_id)
        : null);
    return any?.google_account_id ?? null;
  };

  if (driveAccountId) {
    const onDrive = pick(driveAccountId);
    if (onDrive) return onDrive;
  }
  return pick(null);
}

/**
 * Drive-assigned worker or account.assigned_project_ids (priority 3).
 */
export function resolveProjectAssignedAccountId(
  db: DatabaseManager,
  projectId: string,
): string | null {
  const drive = db.driveSyncState.getByProject(projectId);
  if (drive?.google_account_id && db.googleAccounts.getById(drive.google_account_id)) {
    return drive.google_account_id;
  }

  const accounts = db.googleAccounts.listDetails();
  for (const a of accounts) {
    if (a.assigned_project_ids.includes(projectId)) return a.id;
  }
  return null;
}

function projectHasBinding(db: DatabaseManager, projectId: string): boolean {
  return (
    resolveNotebookMappedAccountId(db, projectId, 'translation') != null ||
    resolveNotebookMappedAccountId(db, projectId, 'research') != null ||
    resolveProjectAssignedAccountId(db, projectId) != null
  );
}

function resolveReadyFallbackAccountId(db: DatabaseManager): string | null {
  const workers = db.workerStates.listEnabled();
  const readyWorker = workers.find((w) => upper(w.health) === 'READY');
  if (readyWorker) return readyWorker.google_account_id;
  const busyWorker = workers.find((w) => upper(w.health) === 'BUSY');
  if (busyWorker) return busyWorker.google_account_id;
  const attentionWorker = workers.find((w) => {
    const h = upper(w.health);
    return h === 'LOGIN_REQUIRED' || h === 'NEEDS_ATTENTION';
  });
  if (attentionWorker) return attentionWorker.google_account_id;

  const accounts = db.googleAccounts.list();
  const readyAcc = accounts.find((a) => isUsable(a.status));
  if (readyAcc) return readyAcc.id;
  const loginAcc = accounts.find((a) => {
    const s = upper(a.status);
    return s === 'LOGIN_REQUIRED' || s === 'NEEDS_ATTENTION';
  });
  return loginAcc?.id ?? null;
}

/**
 * Canonical project worker resolver.
 *
 * Priority:
 * 1. pinned / current active job worker
 * 2. Translation Notebook mapped account (or Research for research purpose)
 * 3. project assigned worker (Drive + assigned_project_ids)
 * 4. explicit user preferredAccountId
 * 5. READY fallback — only when project has no binding
 */
export function resolveProjectWorker(
  db: DatabaseManager,
  input: ResolveProjectWorkerInput,
): ProjectWorkerResolutionDto {
  const purpose = input.purpose ?? 'translation';
  const hasBinding = projectHasBinding(db, input.projectId);

  const finish = (
    accountId: string | null,
    source: ProjectWorkerSource,
  ): ProjectWorkerResolutionDto => {
    const meta = accountEmail(db, accountId);
    return {
      projectId: input.projectId,
      purpose,
      accountId,
      email: meta.email,
      displayName: meta.displayName,
      source,
      hasProjectBinding: hasBinding,
      readyFallbackUsed: source === 'ready_fallback',
    };
  };

  const fromJob = resolveActiveJobWorkerAccountId(
    db,
    input.projectId,
    input.jobId,
  );
  if (fromJob) return finish(fromJob, 'active_job');

  const fromNotebook = resolveNotebookMappedAccountId(db, input.projectId, purpose);
  if (fromNotebook) return finish(fromNotebook, 'translation_notebook');

  const fromAssigned = resolveProjectAssignedAccountId(db, input.projectId);
  if (fromAssigned) return finish(fromAssigned, 'project_assigned');

  if (
    input.preferredAccountId &&
    db.googleAccounts.getById(input.preferredAccountId)
  ) {
    return finish(input.preferredAccountId, 'explicit_preferred');
  }

  if (!hasBinding) {
    const fallback = resolveReadyFallbackAccountId(db);
    if (fallback) return finish(fallback, 'ready_fallback');
  }

  return finish(null, 'none');
}

export class ProjectWorkerResolver {
  constructor(private readonly db: DatabaseManager) {}

  resolve(input: ResolveProjectWorkerInput): ProjectWorkerResolutionDto {
    return resolveProjectWorker(this.db, input);
  }

  /**
   * Persist project→worker binding and optionally ensure Translation Notebook.
   */
  async setWorker(input: {
    projectId: string;
    accountId: string;
    ensureNotebook?: boolean;
  }): Promise<{
    resolution: ProjectWorkerResolutionDto;
    notebookStatus: string | null;
    needsAssisted: boolean;
    message: string;
  }> {
    const account = this.db.googleAccounts.getById(input.accountId);
    if (!account) throw new Error(`Account not found: ${input.accountId}`);
    if (!this.db.projects.getById(input.projectId)) {
      throw new Error(`Project not found: ${input.projectId}`);
    }

    this.db.driveSyncState.assignWorker(input.projectId, input.accountId);

    let notebookStatus: string | null = null;
    let needsAssisted = false;
    let message = `Đã gắn tài khoản dịch ${account.email ?? account.label}.`;

    if (input.ensureNotebook !== false) {
      const { NotebookBootstrapService } = await import(
        '../notebook/notebook-bootstrap-service'
      );
      const prepared = await new NotebookBootstrapService(this.db).prepareForTranslate(
        input.projectId,
        { accountId: input.accountId },
      );
      notebookStatus = prepared.notebookStatus;
      needsAssisted = prepared.needsAssisted;
      message = prepared.message || message;
    }

    const resolution = resolveProjectWorker(this.db, {
      projectId: input.projectId,
      purpose: 'translation',
      preferredAccountId: input.accountId,
    });

    return { resolution, notebookStatus, needsAssisted, message };
  }
}
