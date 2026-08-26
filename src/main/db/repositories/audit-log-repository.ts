import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { utcNow } from '../utils/timestamps';

export const AUDIT_EVENT_TYPES = [
  'account_added',
  'account_removed',
  'project_deleted',
  'credentials_changed',
  'translation_started',
  'export',
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export interface AuditEventRow {
  id: string;
  event_type: string;
  actor: string;
  resource_type: string | null;
  resource_id: string | null;
  summary: string;
  metadata: string | null;
  created_at: string;
}

export interface CreateAuditEventInput {
  eventType: AuditEventType;
  summary: string;
  actor?: string;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
}

const FORBIDDEN_METADATA_KEYS = [
  'token',
  'access_token',
  'refresh_token',
  'cookie',
  'cookies',
  'password',
  'secret',
  'ciphertext',
  'encrypted_blob',
  'authorization',
  'raw_response',
  'gemini_response',
];

export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!metadata) {
    return null;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const lower = key.toLowerCase();
    if (FORBIDDEN_METADATA_KEYS.some((forbidden) => lower.includes(forbidden))) {
      sanitized[key] = '[REDACTED]';
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

export class AuditLogRepository extends BaseRepository {
  append(input: CreateAuditEventInput): AuditEventRow {
    const id = newId();
    const createdAt = utcNow();
    const metadata = sanitizeAuditMetadata(input.metadata ?? null);

    this.db
      .prepare(
        `INSERT INTO audit_events (
          id, event_type, actor, resource_type, resource_id, summary, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.eventType,
        input.actor ?? 'system',
        input.resourceType ?? null,
        input.resourceId ?? null,
        input.summary,
        metadata ? JSON.stringify(metadata) : null,
        createdAt,
      );

    return this.assertRow(this.getById(id), 'audit_event', id);
  }

  getById(id: string): AuditEventRow | null {
    return (
      (this.db.prepare(`SELECT * FROM audit_events WHERE id = ?`).get(id) as
        | AuditEventRow
        | undefined) ?? null
    );
  }

  listRecent(limit = 100): AuditEventRow[] {
    return this.db
      .prepare(`SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as AuditEventRow[];
  }

  listByType(eventType: AuditEventType, limit = 100): AuditEventRow[] {
    return this.db
      .prepare(
        `SELECT * FROM audit_events WHERE event_type = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .all(eventType, limit) as AuditEventRow[];
  }
}
