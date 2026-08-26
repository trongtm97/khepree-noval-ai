import type {
  GoogleAccountPlan,
  GoogleAccountStatus,
} from '@shared/constants/google-account';
import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';

export interface GoogleAccountRow {
  id: string;
  label: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  plan: string;
  status: string;
  drive_connected: number;
  last_seen_at: string | null;
  last_used_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrowserProfileRow {
  id: string;
  google_account_id: string;
  profile_dir_name: string;
  last_session_check_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkerStateRow {
  id: string;
  google_account_id: string;
  provider_type: string;
  quota_state: string;
  quota_reset_at: string | null;
  is_enabled: number;
  priority: number;
  config: string | null;
  last_active_at: string | null;
  health: string;
  current_job_id: string | null;
  busy_since: string | null;
  limited_until: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoogleAccountDetail extends GoogleAccountRow {
  profile_dir_name: string;
  worker_id: string;
  worker_enabled: boolean;
  assigned_project_ids: string[];
  assigned_project_titles: string[];
}

export interface CreateGoogleAccountRecordInput {
  id?: string;
  label: string;
  email?: string | null;
  displayName?: string | null;
  profileDirName: string;
  plan?: GoogleAccountPlan;
  status?: GoogleAccountStatus;
  notes?: string | null;
}

export class GoogleAccountRepository extends BaseRepository {
  create(input: CreateGoogleAccountRecordInput): GoogleAccountRow {
    const id = input.id ?? newId();
    const ts = touchTimestamps();
    const displayName = input.displayName ?? input.label;

    this.db
      .prepare(
        `INSERT INTO google_accounts (
          id, label, email, display_name, avatar_url, plan, status,
          drive_connected, last_seen_at, last_used_at, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, ?, ?, 0, NULL, NULL, ?, ?, ?)`,
      )
      .run(
        id,
        input.label,
        input.email ?? null,
        displayName,
        input.plan ?? 'UNKNOWN',
        input.status ?? 'NEW',
        input.notes ?? null,
        ts.created_at,
        ts.updated_at,
      );

    this.db
      .prepare(
        `INSERT INTO google_browser_profiles (
          id, google_account_id, profile_dir_name, last_session_check_at, created_at, updated_at
        ) VALUES (?, ?, ?, NULL, ?, ?)`,
      )
      .run(newId(), id, input.profileDirName, ts.created_at, ts.updated_at);

    this.db
      .prepare(
        `INSERT INTO worker_states (
          id, google_account_id, provider_type, quota_state, quota_reset_at,
          is_enabled, priority, config, last_active_at, created_at, updated_at
        ) VALUES (?, ?, 'gemini', 'ok', NULL, 1, 100, NULL, NULL, ?, ?)`,
      )
      .run(newId(), id, ts.created_at, ts.updated_at);

    return this.assertRow(this.getById(id), 'google_account', id);
  }

  getById(id: string): GoogleAccountRow | null {
    return (
      (this.db.prepare(`SELECT * FROM google_accounts WHERE id = ?`).get(id) as
        | GoogleAccountRow
        | undefined) ?? null
    );
  }

  list(): GoogleAccountRow[] {
    return this.db
      .prepare(`SELECT * FROM google_accounts ORDER BY created_at DESC`)
      .all() as GoogleAccountRow[];
  }

  listDetails(): GoogleAccountDetail[] {
    const accounts = this.list();
    return accounts.map((account) => this.toDetail(account));
  }

  getDetail(id: string): GoogleAccountDetail | null {
    const account = this.getById(id);
    return account ? this.toDetail(account) : null;
  }

  getProfile(accountId: string): BrowserProfileRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM google_browser_profiles WHERE google_account_id = ?`)
        .get(accountId) as BrowserProfileRow | undefined) ?? null
    );
  }

  getWorker(accountId: string): WorkerStateRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM worker_states WHERE google_account_id = ?`)
        .get(accountId) as WorkerStateRow | undefined) ?? null
    );
  }

  update(
    id: string,
    patch: {
      label?: string;
      email?: string | null;
      displayName?: string | null;
      avatarUrl?: string | null;
      plan?: GoogleAccountPlan;
      status?: GoogleAccountStatus;
      driveConnected?: boolean;
      notes?: string | null;
      lastSeenAt?: string | null;
      lastUsedAt?: string | null;
    },
  ): GoogleAccountRow | null {
    const existing = this.getById(id);
    if (!existing) {
      return null;
    }

    this.db
      .prepare(
        `UPDATE google_accounts SET
          label = ?,
          email = ?,
          display_name = ?,
          avatar_url = ?,
          plan = ?,
          status = ?,
          drive_connected = ?,
          notes = ?,
          last_seen_at = ?,
          last_used_at = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        patch.label ?? existing.label,
        patch.email !== undefined ? patch.email : existing.email,
        patch.displayName !== undefined ? patch.displayName : existing.display_name,
        patch.avatarUrl !== undefined ? patch.avatarUrl : existing.avatar_url,
        patch.plan ?? existing.plan,
        patch.status ?? existing.status,
        patch.driveConnected !== undefined
          ? patch.driveConnected
            ? 1
            : 0
          : existing.drive_connected,
        patch.notes !== undefined ? patch.notes : existing.notes,
        patch.lastSeenAt !== undefined ? patch.lastSeenAt : existing.last_seen_at,
        patch.lastUsedAt !== undefined ? patch.lastUsedAt : existing.last_used_at,
        utcNow(),
        id,
      );

    return this.getById(id);
  }

  touchSessionCheck(accountId: string): void {
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE google_browser_profiles SET last_session_check_at = ?, updated_at = ? WHERE google_account_id = ?`,
      )
      .run(now, now, accountId);
    this.db
      .prepare(`UPDATE google_accounts SET last_seen_at = ?, updated_at = ? WHERE id = ?`)
      .run(now, now, accountId);
  }

  setWorkerEnabled(accountId: string, enabled: boolean): void {
    this.db
      .prepare(
        `UPDATE worker_states SET is_enabled = ?, updated_at = ? WHERE google_account_id = ?`,
      )
      .run(enabled ? 1 : 0, utcNow(), accountId);
  }

  /** Clear stale NEEDS_ATTENTION / idle BUSY when account setup is done. */
  markWorkerReadyIfIdle(accountId: string): void {
    const worker = this.getWorker(accountId);
    if (!worker) return;
    if (worker.health === 'READY' || worker.health === 'DISABLED') return;
    if (worker.health === 'BUSY' && worker.current_job_id) return;
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE worker_states SET
          health = 'READY',
          current_job_id = NULL,
          busy_since = NULL,
          updated_at = ?,
          last_active_at = ?
        WHERE google_account_id = ?`,
      )
      .run(now, now, accountId);
  }

  listAssignedProjects(accountId: string): { id: string; title: string }[] {
    return this.db
      .prepare(
        `SELECT p.id, p.title
         FROM project_account_assignments a
         JOIN projects p ON p.id = a.project_id
         WHERE a.google_account_id = ? AND p.deleted_at IS NULL
         ORDER BY p.title ASC`,
      )
      .all(accountId) as { id: string; title: string }[];
  }

  assignProject(accountId: string, projectId: string): void {
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO project_account_assignments (id, project_id, google_account_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(project_id, google_account_id) DO UPDATE SET updated_at = excluded.updated_at`,
      )
      .run(newId(), projectId, accountId, ts.created_at, ts.updated_at);
  }

  delete(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM google_accounts WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  private toDetail(account: GoogleAccountRow): GoogleAccountDetail {
    const profile = this.getProfile(account.id);
    const worker = this.getWorker(account.id);
    const projects = this.listAssignedProjects(account.id);

    return {
      ...account,
      profile_dir_name: profile?.profile_dir_name ?? '',
      worker_id: worker?.id ?? '',
      worker_enabled: worker ? worker.is_enabled === 1 : false,
      assigned_project_ids: projects.map((p) => p.id),
      assigned_project_titles: projects.map((p) => p.title),
    };
  }
}
