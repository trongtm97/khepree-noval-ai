/**
 * HARD REQUIREMENT 14 — audit historical duplicate NotebookLM bindings per story.
 *
 * Local SQLite only. NEVER deletes or modifies remote NotebookLM projects.
 * High-confidence secondaries → mark deprecated_at locally.
 * Ambiguous cases → Attention Inbox for user resolution (remote kept).
 */
import type Database from 'better-sqlite3';
import { newId } from '../db/utils/uuid';
import { utcNow } from '../db/utils/timestamps';
import { buildAttentionDedupeKey } from '@shared/constants/attention-inbox';

export interface NotebookBindingAuditRow {
  id: string;
  project_id: string;
  google_account_id: string | null;
  notebook_id: string | null;
  resource_url: string | null;
  notebook_name: string | null;
  notebook_role: string;
  status: string;
  knowledge_version: number;
  last_verified_at: string | null;
  updated_at: string;
  deprecated_at: string | null;
}

export interface DuplicateBindingGroupResult {
  projectId: string;
  role: string;
  primaryId: string | null;
  deprecatedIds: string[];
  candidateIds: string[];
  resolution: 'auto_primary' | 'needs_user';
  reason: string;
}

export interface DuplicateBindingAuditReport {
  projectsTouched: number;
  groupsFound: number;
  autoRetainedPrimary: number;
  locallyDeprecated: number;
  needsUserResolution: number;
  groups: DuplicateBindingGroupResult[];
}

const READY_STATUSES = new Set(['ready', 'sync_pending', 'stale']);

function scoreRow(row: NotebookBindingAuditRow): number {
  let score = 0;
  if (READY_STATUSES.has(row.status)) score += 100;
  else if (row.status === 'provisioning') score += 40;
  else if (row.status === 'unavailable' || row.status === 'assisted_setup') score += 20;
  else if (row.status === 'error') score += 5;

  if (row.resource_url?.startsWith('http')) score += 40;
  if (row.last_verified_at) score += 30;
  if (row.knowledge_version > 0) score += 20;
  if (row.notebook_role === 'SINGLE') score += 10;

  // Mild recency boost from updated_at lexicographic ISO
  const t = Date.parse(row.updated_at);
  if (!Number.isNaN(t)) {
    score += Math.min(15, Math.floor((t - 1_700_000_000_000) / (86_400_000 * 30)));
  }
  return score;
}

function loadActiveBindings(db: Database.Database): NotebookBindingAuditRow[] {
  return db
    .prepare(
      `SELECT id, project_id, google_account_id, notebook_id, resource_url,
              notebook_name, notebook_role, status, knowledge_version,
              last_verified_at, updated_at, deprecated_at
       FROM notebook_resources
       WHERE deprecated_at IS NULL
         AND notebook_id IS NOT NULL
         AND trim(notebook_id) != ''`,
    )
    .all() as NotebookBindingAuditRow[];
}

function groupKey(row: NotebookBindingAuditRow): string {
  return `${row.project_id}::${row.notebook_role}`;
}

/**
 * Pick primary when confidence is high:
 * - Same remote notebook_id on all rows → keep newest (local row dupes only)
 * - Distinct remote ids → primary wins if score gap >= 50 OR unique ready+url winner
 */
function resolveGroup(rows: NotebookBindingAuditRow[]): DuplicateBindingGroupResult {
  const projectId = rows[0]!.project_id;
  const role = rows[0]!.notebook_role;
  const candidateIds = rows.map((r) => r.id);
  const remoteIds = [...new Set(rows.map((r) => r.notebook_id!).filter(Boolean))];

  if (remoteIds.length === 1) {
    const sorted = [...rows].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const primary = sorted[0]!;
    return {
      projectId,
      role,
      primaryId: primary.id,
      deprecatedIds: sorted.slice(1).map((r) => r.id),
      candidateIds,
      resolution: 'auto_primary',
      reason: 'same_remote_notebook_id_local_row_dupes',
    };
  }

  const scored = rows
    .map((r) => ({ row: r, score: scoreRow(r) }))
    .sort((a, b) => b.score - a.score || b.row.updated_at.localeCompare(a.row.updated_at));

  const top = scored[0]!;
  const second = scored[1];
  const gap = second ? top.score - second.score : 999;
  const uniqueStrong =
    READY_STATUSES.has(top.row.status) &&
    Boolean(top.row.resource_url?.startsWith('http')) &&
    (!second ||
      !READY_STATUSES.has(second.row.status) ||
      !second.row.resource_url?.startsWith('http'));

  if (gap >= 50 || uniqueStrong) {
    return {
      projectId,
      role,
      primaryId: top.row.id,
      deprecatedIds: scored.slice(1).map((s) => s.row.id),
      candidateIds,
      resolution: 'auto_primary',
      reason: uniqueStrong ? 'unique_ready_http_binding' : `score_gap_${gap}`,
    };
  }

  return {
    projectId,
    role,
    primaryId: null,
    deprecatedIds: [],
    candidateIds,
    resolution: 'needs_user',
    reason: `ambiguous_distinct_remotes_${remoteIds.length}_gap_${gap}`,
  };
}

function markDeprecatedLocal(
  db: Database.Database,
  id: string,
  now: string,
  note: string,
): void {
  db.prepare(
    `UPDATE notebook_resources SET
       deprecated_at = COALESCE(deprecated_at, ?),
       last_error = CASE
         WHEN last_error IS NULL OR last_error = '' THEN ?
         ELSE last_error
       END,
       updated_at = ?
     WHERE id = ?`,
  ).run(now, note, now, id);
}

function insertUserAttention(
  db: Database.Database,
  group: DuplicateBindingGroupResult,
  rows: NotebookBindingAuditRow[],
  now: string,
): void {
  const table = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='attention_inbox_items'`)
    .get() as { name: string } | undefined;
  if (!table) return;

  const remotes = [
    ...new Set(rows.map((r) => r.notebook_id).filter(Boolean)),
  ] as string[];
  const dedupeKey = buildAttentionDedupeKey({
    type: 'PIPELINE_BLOCKED',
    projectId: group.projectId,
    causeCode: 'NOTEBOOK_BINDING_DUPLICATE',
  });

  const existing = db
    .prepare(
      `SELECT id FROM attention_inbox_items
       WHERE dedupe_key = ? AND status IN ('OPEN', 'SNOOZED')`,
    )
    .get(dedupeKey) as { id: string } | undefined;
  if (existing) return;

  const id = newId();
  const tech = JSON.stringify({
    role: group.role,
    candidateRowIds: group.candidateIds,
    remoteNotebookIds: remotes,
    reason: group.reason,
    note: 'Remote NotebookLM projects were NOT deleted. Choose primary in AI Memory.',
  });

  db.prepare(
    `INSERT INTO attention_inbox_items (
      id, type, status, severity, title_en, title_vi, description_en, description_vi,
      cause_code, primary_action, secondary_actions_json, project_id,
      affected_scope_json, dedupe_key, tech_detail, created_at, updated_at
    ) VALUES (?, 'PIPELINE_BLOCKED', 'OPEN', 'high', ?, ?, ?, ?,
      'NOTEBOOK_BINDING_DUPLICATE', 'CHOOSE_SOURCE', ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    'Multiple Notebooks linked to one story',
    'Nhiều Notebook gắn với một truyện',
    'This story has more than one NotebookLM project binding. Remote notebooks were kept. Choose one primary binding — others stay on Google unused by NovelTrans.',
    'Truyện này có nhiều Notebook được liên kết. NovelTrans chỉ dùng một Notebook mỗi truyện để tránh vượt giới hạn NotebookLM. Chọn Notebook chính — các Notebook khác trên Google không bị xóa.',
    JSON.stringify(['CHOOSE_SOURCE', 'VIEW_ERROR', 'SKIP']),
    group.projectId,
    JSON.stringify({
      jobIds: [],
      projectIds: [group.projectId],
      chapterIds: [],
      notebookRowIds: group.candidateIds,
      remoteNotebookIds: remotes,
    }),
    dedupeKey,
    tech,
    now,
    now,
  );

  // Soft-mark candidates so UI can show conflict without dropping remote ids.
  for (const row of rows) {
    db.prepare(
      `UPDATE notebook_resources SET
         last_error = CASE
           WHEN last_error IS NULL OR last_error = '' THEN ?
           ELSE last_error
         END,
         updated_at = ?
       WHERE id = ?`,
    ).run('duplicate_binding_needs_user_choice', now, row.id);
  }
}

function insertSyncEvent(
  db: Database.Database,
  projectId: string,
  message: string,
  metadata: Record<string, unknown>,
  now: string,
): void {
  const table = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_sync_events'`)
    .get() as { name: string } | undefined;
  if (!table) return;
  db.prepare(
    `INSERT INTO knowledge_sync_events (id, project_id, event_type, knowledge_type, message, metadata_json, created_at)
     VALUES (?, ?, 'NOTEBOOK_BINDING_DUPLICATE_AUDIT', NULL, ?, ?, ?)`,
  ).run(newId(), projectId, message, JSON.stringify(metadata), now);
}

/**
 * Idempotent audit. Safe to re-run. Never touches remote NotebookLM.
 */
export function auditHistoricalNotebookBindingDuplicates(
  db: Database.Database,
): DuplicateBindingAuditReport {
  const now = utcNow();
  const rows = loadActiveBindings(db);
  const byGroup = new Map<string, NotebookBindingAuditRow[]>();
  for (const row of rows) {
    const key = groupKey(row);
    const list = byGroup.get(key) ?? [];
    list.push(row);
    byGroup.set(key, list);
  }

  const report: DuplicateBindingAuditReport = {
    projectsTouched: 0,
    groupsFound: 0,
    autoRetainedPrimary: 0,
    locallyDeprecated: 0,
    needsUserResolution: 0,
    groups: [],
  };

  const projects = new Set<string>();

  for (const [, groupRows] of byGroup) {
    if (groupRows.length < 2) continue;
    report.groupsFound += 1;
    projects.add(groupRows[0]!.project_id);

    const resolved = resolveGroup(groupRows);
    report.groups.push(resolved);

    if (resolved.resolution === 'auto_primary' && resolved.primaryId) {
      report.autoRetainedPrimary += 1;
      const note = `duplicate_binding_audit:secondary_of:${resolved.primaryId} (${resolved.reason})`;
      for (const id of resolved.deprecatedIds) {
        markDeprecatedLocal(db, id, now, note);
        report.locallyDeprecated += 1;
      }
      insertSyncEvent(
        db,
        resolved.projectId,
        `Retained primary Notebook binding; deprecated ${resolved.deprecatedIds.length} local duplicate(s). Remote notebooks were not deleted.`,
        {
          primaryId: resolved.primaryId,
          deprecatedIds: resolved.deprecatedIds,
          reason: resolved.reason,
          role: resolved.role,
        },
        now,
      );
    } else {
      report.needsUserResolution += 1;
      insertUserAttention(db, resolved, groupRows, now);
      insertSyncEvent(
        db,
        resolved.projectId,
        `Ambiguous duplicate Notebook bindings — user must choose primary. Remote notebooks were not deleted.`,
        {
          candidateIds: resolved.candidateIds,
          reason: resolved.reason,
          role: resolved.role,
        },
        now,
      );
    }
  }

  report.projectsTouched = projects.size;
  return report;
}

export interface DuplicateBindingCandidateDto {
  id: string;
  projectId: string;
  notebookId: string | null;
  notebookName: string | null;
  resourceUrl: string | null;
  role: string;
  status: string;
  lastVerifiedAt: string | null;
  updatedAt: string;
  locallyBound: boolean;
  deprecatedAt: string | null;
}

/** List active (and soft-conflict) candidates for user primary selection. */
export function listDuplicateBindingCandidates(
  db: Database.Database,
  projectId: string,
): DuplicateBindingCandidateDto[] {
  const rows = db
    .prepare(
      `SELECT id, project_id, google_account_id, notebook_id, resource_url,
              notebook_name, notebook_role, status, knowledge_version,
              last_verified_at, updated_at, deprecated_at
       FROM notebook_resources
       WHERE project_id = ?
         AND notebook_id IS NOT NULL
         AND trim(notebook_id) != ''
         AND (
           deprecated_at IS NULL
           OR last_error LIKE '%duplicate_binding%'
         )
       ORDER BY deprecated_at IS NULL DESC, updated_at DESC`,
    )
    .all(projectId) as NotebookBindingAuditRow[];

  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    notebookId: r.notebook_id,
    notebookName: r.notebook_name,
    resourceUrl: r.resource_url,
    role: r.notebook_role,
    status: r.status,
    lastVerifiedAt: r.last_verified_at,
    updatedAt: r.updated_at,
    locallyBound: r.deprecated_at == null,
    deprecatedAt: r.deprecated_at,
  }));
}

/**
 * User picks primary local binding. Never deletes remote NotebookLM.
 * Other local rows for same project+role → deprecated_at.
 */
export function resolvePrimaryNotebookBinding(
  db: Database.Database,
  input: { projectId: string; primaryRowId: string },
): { ok: true; primaryId: string; deprecatedIds: string[] } {
  const now = utcNow();
  const primary = db
    .prepare(
      `SELECT id, project_id, google_account_id, notebook_id, resource_url,
              notebook_name, notebook_role, status, knowledge_version,
              last_verified_at, updated_at, deprecated_at
       FROM notebook_resources WHERE id = ?`,
    )
    .get(input.primaryRowId) as NotebookBindingAuditRow | undefined;
  if (primary?.project_id !== input.projectId) {
    throw new Error('NOTEBOOK_BINDING_NOT_FOUND');
  }

  // Clear deprecation on primary
  db.prepare(
    `UPDATE notebook_resources SET
       deprecated_at = NULL,
       last_error = CASE
         WHEN last_error LIKE '%duplicate_binding%' THEN NULL
         ELSE last_error
       END,
       updated_at = ?
     WHERE id = ?`,
  ).run(now, primary.id);

  const siblings = db
    .prepare(
      `SELECT id FROM notebook_resources
       WHERE project_id = ?
         AND notebook_role = ?
         AND id != ?
         AND deprecated_at IS NULL
         AND notebook_id IS NOT NULL
         AND trim(notebook_id) != ''`,
    )
    .all(input.projectId, primary.notebook_role, primary.id) as { id: string }[];

  const deprecatedIds: string[] = [];
  const note = `user_chose_primary:${primary.id}`;
  for (const s of siblings) {
    markDeprecatedLocal(db, s.id, now, note);
    deprecatedIds.push(s.id);
  }

  // Resolve matching attention inbox items
  const table = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='attention_inbox_items'`)
    .get() as { name: string } | undefined;
  if (table) {
    const dedupeKey = buildAttentionDedupeKey({
      type: 'PIPELINE_BLOCKED',
      projectId: input.projectId,
      causeCode: 'NOTEBOOK_BINDING_DUPLICATE',
    });
    db.prepare(
      `UPDATE attention_inbox_items
       SET status = 'RESOLVED', updated_at = ?
       WHERE dedupe_key = ? AND status IN ('OPEN', 'SNOOZED')`,
    ).run(now, dedupeKey);
  }

  insertSyncEvent(
    db,
    input.projectId,
    `User selected primary Notebook binding. ${deprecatedIds.length} local duplicate(s) marked inactive. Remote notebooks were not deleted.`,
    {
      primaryId: primary.id,
      deprecatedIds,
      role: primary.notebook_role,
    },
    now,
  );

  return { ok: true, primaryId: primary.id, deprecatedIds };
}
