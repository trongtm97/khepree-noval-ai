import type { AuditLogRepository, AuditEventType, CreateAuditEventInput } from '../db/repositories/audit-log-repository';
import { logger } from '../logging/logger';
import type { AppMetaRepository } from '../db/repositories/app-meta-repository';

export class AuditLogService {
  constructor(
    private readonly repository: AuditLogRepository,
    private readonly appMeta: AppMetaRepository,
  ) {}

  record(input: CreateAuditEventInput) {
    const event = this.repository.append(input);
    logger.info('Audit event', {
      eventType: input.eventType,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      summary: input.summary,
    });
    return event;
  }

  accountAdded(accountId: string, label: string, actor = 'user'): void {
    this.record({
      eventType: 'account_added',
      actor,
      resourceType: 'google_account',
      resourceId: accountId,
      summary: `Google account added: ${label}`,
      metadata: { label },
    });
  }

  accountRemoved(accountId: string, label: string, actor = 'user'): void {
    this.record({
      eventType: 'account_removed',
      actor,
      resourceType: 'google_account',
      resourceId: accountId,
      summary: `Google account removed: ${label}`,
      metadata: { label },
    });
  }

  projectDeleted(projectId: string, title: string, actor = 'user'): void {
    this.record({
      eventType: 'project_deleted',
      actor,
      resourceType: 'project',
      resourceId: projectId,
      summary: `Project deleted: ${title}`,
      metadata: { title },
    });
  }

  credentialsChanged(
    secretKey: string,
    kind: string,
    ownerId: string | null,
    actor = 'system',
  ): void {
    this.record({
      eventType: 'credentials_changed',
      actor,
      resourceType: 'secret',
      resourceId: secretKey,
      summary: `Credentials changed (${kind})`,
      metadata: { kind, ownerId },
    });
  }

  translationStarted(jobId: string, projectId: string, actor = 'system'): void {
    this.record({
      eventType: 'translation_started',
      actor,
      resourceType: 'job',
      resourceId: jobId,
      summary: 'Translation job started',
      metadata: { projectId },
    });
  }

  exportPerformed(
    projectId: string,
    format: string,
    actor = 'user',
  ): void {
    this.record({
      eventType: 'export',
      actor,
      resourceType: 'project',
      resourceId: projectId,
      summary: `Export performed (${format})`,
      metadata: { format },
    });
  }

  isDiagnosticContentLoggingEnabled(): boolean {
    return this.appMeta.get('security.diagnostic_content_logging') === 'true';
  }

  /**
   * Log AI / automation response content only when user enabled diagnostic content logging.
   * Never log cookies or OAuth tokens regardless of setting.
   */
  logDiagnosticContent(message: string, context?: Record<string, unknown>): void {
    if (!this.isDiagnosticContentLoggingEnabled()) {
      return;
    }
    logger.debug(message, context);
  }

  listRecent(limit = 100) {
    return this.repository.listRecent(limit);
  }

  listByType(eventType: AuditEventType, limit = 100) {
    return this.repository.listByType(eventType, limit);
  }
}
