import type Database from 'better-sqlite3';
import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { utcNow } from '../utils/timestamps';

export const USAGE_LEDGER_OUTCOMES = [
  'COMPLETED',
  'ACCEPTED_WITH_WARNINGS',
  'FAILED',
  'NEEDS_ATTENTION',
  'CANCELLED',
  'QUOTA_REQUEUE',
  'ERROR',
] as const;

export type UsageLedgerOutcome = (typeof USAGE_LEDGER_OUTCOMES)[number];

export interface UsageLedgerRow {
  id: string;
  project_id: string | null;
  job_id: string | null;
  account_id: string | null;
  provider_type: string | null;
  request_count: number;
  char_count: number;
  duration_ms: number;
  outcome: string;
  created_at: string;
}

export interface AppendUsageLedgerInput {
  projectId?: string | null;
  jobId?: string | null;
  accountId?: string | null;
  providerType?: string | null;
  requestCount?: number;
  charCount?: number;
  durationMs?: number;
  outcome: UsageLedgerOutcome | string;
}

/**
 * Local-only usage telemetry. Never upload content; not token billing.
 */
export class UsageLedgerRepository extends BaseRepository {
  append(input: AppendUsageLedgerInput): UsageLedgerRow {
    const id = newId();
    const createdAt = utcNow();
    this.db
      .prepare(
        `INSERT INTO usage_ledger (
          id, project_id, job_id, account_id, provider_type,
          request_count, char_count, duration_ms, outcome, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.projectId ?? null,
        input.jobId ?? null,
        input.accountId ?? null,
        input.providerType ?? null,
        Math.max(0, input.requestCount ?? 1),
        Math.max(0, Math.floor(input.charCount ?? 0)),
        Math.max(0, Math.floor(input.durationMs ?? 0)),
        input.outcome,
        createdAt,
      );
    return this.getById(id)!;
  }

  getById(id: string): UsageLedgerRow | null {
    return (
      (this.db.prepare(`SELECT * FROM usage_ledger WHERE id = ?`).get(id) as
        | UsageLedgerRow
        | undefined) ?? null
    );
  }

  listByProject(projectId: string, limit = 100): UsageLedgerRow[] {
    return this.db
      .prepare(
        `SELECT * FROM usage_ledger
         WHERE project_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(projectId, Math.min(1000, Math.max(1, limit))) as UsageLedgerRow[];
  }

  listByAccount(accountId: string, limit = 100): UsageLedgerRow[] {
    return this.db
      .prepare(
        `SELECT * FROM usage_ledger
         WHERE account_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(accountId, Math.min(1000, Math.max(1, limit))) as UsageLedgerRow[];
  }

  /** Rolling averages for ETA / slow-account detection (local only). */
  summarizeAccount(
    accountId: string,
    limit = 50,
  ): {
    samples: number;
    avgDurationMs: number | null;
    avgCharCount: number;
    failRate: number;
  } {
    const rows = this.listByAccount(accountId, limit);
    if (rows.length === 0) {
      return { samples: 0, avgDurationMs: null, avgCharCount: 0, failRate: 0 };
    }
    const fails = rows.filter((r) =>
      ['FAILED', 'NEEDS_ATTENTION', 'ERROR', 'QUOTA_REQUEUE'].includes(r.outcome),
    ).length;
    const dur = rows.reduce((s, r) => s + r.duration_ms, 0);
    const chars = rows.reduce((s, r) => s + r.char_count, 0);
    return {
      samples: rows.length,
      avgDurationMs: Math.round(dur / rows.length),
      avgCharCount: Math.round(chars / rows.length),
      failRate: fails / rows.length,
    };
  }

  countAll(): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS c FROM usage_ledger`).get() as {
      c: number;
    };
    return row.c;
  }
}

export function createUsageLedgerRepository(db: Database.Database): UsageLedgerRepository {
  return new UsageLedgerRepository(db);
}
