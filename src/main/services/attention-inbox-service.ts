import { getDatabase } from '../db/connection';
import type { DatabaseManager } from '../db/database-manager';
import {
  parseAffectedScope,
  sanitizeTechDetail,
  type AttentionInboxItemRow,
} from '../db/repositories/attention-inbox-repository';
import {
  ATTENTION_INBOX_COPY,
  ATTENTION_INBOX_PROACTIVE_TYPES,
  ATTENTION_INBOX_RETRYABLE_TYPES,
  buildAttentionDedupeKey,
  defaultPrimaryAction,
  defaultSeverity,
  mapBrowserKindToInboxType,
  type AttentionInboxPrimaryAction,
  type AttentionInboxType,
} from '@shared/constants/attention-inbox';
import type { AttentionInboxItemDto } from '@shared/schemas/attention-inbox';
import { logger } from '../logging/logger';
import { utcNow } from '../db/utils/timestamps';
import { getJobService } from './job-service-singleton';

function toDto(row: AttentionInboxItemRow): AttentionInboxItemDto {
  let secondary: AttentionInboxPrimaryAction[] = [];
  try {
    secondary = JSON.parse(row.secondary_actions_json ?? '[]') as AttentionInboxPrimaryAction[];
  } catch {
    secondary = [];
  }
  return {
    id: row.id,
    type: row.type as AttentionInboxItemDto['type'],
    status: row.status as AttentionInboxItemDto['status'],
    severity: row.severity as AttentionInboxItemDto['severity'],
    titleEn: row.title_en,
    titleVi: row.title_vi,
    descriptionEn: row.description_en,
    descriptionVi: row.description_vi,
    causeCode: row.cause_code,
    primaryAction: row.primary_action as AttentionInboxPrimaryAction,
    secondaryActions: secondary,
    campaignId: row.campaign_id,
    projectId: row.project_id,
    chapterId: row.chapter_id,
    jobId: row.job_id,
    accountId: row.account_id,
    accountKind: row.account_kind,
    affectedScope: parseAffectedScope(row.affected_scope_json),
    dedupeKey: row.dedupe_key,
    techDetail: row.tech_detail,
    snoozedUntil: row.snoozed_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  };
}

export class AttentionInboxService {
  constructor(private readonly db: DatabaseManager) {}

  listOpen(limit = 100): AttentionInboxItemDto[] {
    return this.db.attentionInbox.listOpen(limit).map(toDto);
  }

  countOpen(): number {
    return this.db.attentionInbox.countOpen();
  }

  upsert(input: {
    type: AttentionInboxType;
    causeCode?: string | null;
    campaignId?: string | null;
    projectId?: string | null;
    chapterId?: string | null;
    jobId?: string | null;
    accountId?: string | null;
    accountKind?: string | null;
    techDetail?: string | null;
    titleOverrideEn?: string;
    titleOverrideVi?: string;
    descriptionOverrideEn?: string;
    descriptionOverrideVi?: string;
    primaryAction?: AttentionInboxPrimaryAction;
  }): AttentionInboxItemDto {
    const copy = ATTENTION_INBOX_COPY[input.type];
    // Account-scoped issues (login/captcha/quota): one row per account+cause,
    // many jobs merge into affectedScope — UI stays compact.
    const accountScoped =
      Boolean(input.accountId) &&
      (ATTENTION_INBOX_PROACTIVE_TYPES.has(input.type) ||
        input.type === 'QUOTA_EXHAUSTED' ||
        input.type === 'PROVIDER_UNAVAILABLE');
    const dedupeKey = buildAttentionDedupeKey({
      type: input.type,
      accountId: input.accountId,
      projectId: accountScoped ? null : input.projectId,
      campaignId: accountScoped ? null : input.campaignId,
      chapterId: accountScoped ? null : input.chapterId,
      causeCode: input.causeCode,
    });
    const row = this.db.attentionInbox.upsertOpen({
      type: input.type,
      severity: defaultSeverity(input.type),
      titleEn: input.titleOverrideEn ?? copy.titleEn,
      titleVi: input.titleOverrideVi ?? copy.titleVi,
      descriptionEn: input.descriptionOverrideEn ?? copy.descriptionEn,
      descriptionVi: input.descriptionOverrideVi ?? copy.descriptionVi,
      causeCode: input.causeCode,
      primaryAction: input.primaryAction ?? defaultPrimaryAction(input.type),
      secondaryActions: ['VIEW_ERROR', 'SKIP'],
      campaignId: input.campaignId,
      projectId: input.projectId,
      chapterId: input.chapterId,
      jobId: input.jobId,
      accountId: input.accountId,
      accountKind: input.accountKind,
      dedupeKey,
      techDetail: sanitizeTechDetail(input.techDetail),
      affectedScope: {
        jobIds: input.jobId ? [input.jobId] : [],
        projectIds: input.projectId ? [input.projectId] : [],
        chapterIds: input.chapterId ? [input.chapterId] : [],
      },
    });
    return toDto(row);
  }

  upsertFromBrowserAttention(input: {
    kind: string;
    accountId: string;
    accountKind: string;
    summary: string;
    causeCode?: string | null;
  }): AttentionInboxItemDto {
    const type = mapBrowserKindToInboxType(input.kind);
    return this.upsert({
      type,
      accountId: input.accountId,
      accountKind: input.accountKind,
      causeCode: input.causeCode ?? input.kind,
      techDetail: input.summary,
    });
  }

  upsertFromJob(input: {
    jobId: string;
    projectId: string;
    reason?: string | null;
    error?: string | null;
    accountId?: string | null;
    accountKind?: string | null;
  }): AttentionInboxItemDto {
    const reason = (input.reason ?? '').toUpperCase();
    let type: AttentionInboxType = 'PIPELINE_BLOCKED';
    if (reason.includes('CAPTCHA')) type = 'CAPTCHA_REQUIRED';
    else if (reason.includes('LOGIN')) type = 'LOGIN_REQUIRED';
    else if (reason.includes('QUOTA') || reason.includes('LIMIT'))
      type = 'QUOTA_EXHAUSTED';
    else if (reason.includes('PROVIDER')) type = 'PROVIDER_UNAVAILABLE';
    else if (reason.includes('SOURCE')) type = 'SOURCE_CONFLICT';
    else if (reason.includes('QA') || reason.includes('AUDIT'))
      type = 'QA_CRITICAL';
    else if (reason.includes('LICENSE')) type = 'LICENSE_REQUIRED';
    else if (reason.includes('EXPORT')) type = 'EXPORT_FAILED';

    return this.upsert({
      type,
      jobId: input.jobId,
      projectId: input.projectId,
      accountId: input.accountId,
      accountKind: input.accountKind,
      causeCode: input.reason ?? 'JOB_NEEDS_ATTENTION',
      techDetail: input.error ?? input.reason,
      primaryAction: ATTENTION_INBOX_PROACTIVE_TYPES.has(type)
        ? defaultPrimaryAction(type)
        : 'RETRY',
    });
  }

  upsertFromQaCritical(input: {
    projectId: string;
    campaignId?: string | null;
    findingId?: string | null;
    message?: string | null;
    paragraphId?: string | null;
  }): AttentionInboxItemDto {
    return this.upsert({
      type: 'QA_CRITICAL',
      projectId: input.projectId,
      campaignId: input.campaignId,
      causeCode: 'QA_CRITICAL',
      techDetail: [
        input.findingId ? `finding=${input.findingId}` : null,
        input.paragraphId ? `paragraph=${input.paragraphId}` : null,
        input.message,
      ]
        .filter(Boolean)
        .join(' · '),
    });
  }

  act(
    itemId: string,
    action: string,
    opts?: { snoozeMinutes?: number },
  ): AttentionInboxItemDto | null {
    const row = this.db.attentionInbox.getById(itemId);
    if (!row) return null;

    switch (action) {
      case 'RESOLVE':
      case 'DISMISS':
        this.db.attentionInbox.setStatus(
          itemId,
          action === 'RESOLVE' ? 'RESOLVED' : 'DISMISSED',
        );
        break;
      case 'SNOOZE': {
        const mins = opts?.snoozeMinutes ?? 60;
        const until = new Date(Date.now() + mins * 60_000).toISOString();
        this.db.attentionInbox.setStatus(itemId, 'SNOOZED', {
          snoozedUntil: until,
        });
        break;
      }
      case 'RETRY':
        void this.retryItem(row);
        break;
      case 'SKIP':
        if (row.job_id) {
          try {
            getJobService().applyAttentionAction(row.job_id, 'skip');
          } catch (err) {
            logger.warn('Attention skip failed', {
              message: err instanceof Error ? err.message : String(err),
            });
          }
        }
        this.db.attentionInbox.setStatus(itemId, 'DISMISSED');
        break;
      default:
        // OPEN_LOGIN / VIEW_ERROR / etc. — UI navigates; keep OPEN
        break;
    }
    return toDto(this.db.attentionInbox.getById(itemId)!);
  }

  /**
   * Bulk retry OPEN retryable items. Never includes CAPTCHA/LOGIN/LICENSE.
   */
  bulkRetry(opts?: {
    itemIds?: string[];
    allRetryable?: boolean;
  }): { attempted: number; skippedProactive: number; retriedJobIds: string[] } {
    let rows = opts?.allRetryable
      ? this.db.attentionInbox.listRetryableOpen(100)
      : (opts?.itemIds ?? [])
          .map((id) => this.db.attentionInbox.getById(id))
          .filter((r): r is AttentionInboxItemRow => Boolean(r));

    let skippedProactive = 0;
    const retriedJobIds: string[] = [];
    let attempted = 0;

    for (const row of rows) {
      const type = row.type as AttentionInboxType;
      if (ATTENTION_INBOX_PROACTIVE_TYPES.has(type)) {
        skippedProactive += 1;
        continue;
      }
      if (!ATTENTION_INBOX_RETRYABLE_TYPES.has(type) && row.primary_action !== 'RETRY') {
        skippedProactive += 1;
        continue;
      }
      attempted += 1;
      const ids = this.retryItem(row);
      retriedJobIds.push(...ids);
    }

    return { attempted, skippedProactive, retriedJobIds };
  }

  private retryItem(row: AttentionInboxItemRow): string[] {
    const scope = parseAffectedScope(row.affected_scope_json);
    const jobIds = [
      ...new Set([
        ...(row.job_id ? [row.job_id] : []),
        ...scope.jobIds,
      ]),
    ];
    const retried: string[] = [];
    try {
      const jobs = getJobService();
      for (const jobId of jobIds) {
        const job = this.db.jobs.getById(jobId);
        if (!job) continue;
        if (job.state === 'NEEDS_ATTENTION' || job.state === 'FAILED') {
          jobs.applyAttentionAction(jobId, 'retry');
          retried.push(jobId);
        }
      }
    } catch (err) {
      logger.warn('Attention retry failed', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return retried;
  }

  /**
   * Auto-resolve when cause gone (job completed / account healthy).
   */
  reconcile(): { resolved: number } {
    let resolved = 0;
    const open = this.db.attentionInbox.listOpen(200);
    for (const row of open) {
      if (this.shouldAutoResolve(row)) {
        resolved += this.db.attentionInbox.resolveByDedupeKey(
          row.dedupe_key,
          `reconcile@${utcNow()}`,
        );
      }
    }
    return { resolved };
  }

  private shouldAutoResolve(row: AttentionInboxItemRow): boolean {
    const type = row.type as AttentionInboxType;

    if (type === 'LOGIN_REQUIRED' || type === 'CAPTCHA_REQUIRED') {
      if (!row.account_id) return false;
      if (row.account_kind === 'GOOGLE_ACCOUNT') {
        const acc = this.db.googleAccounts.getById(row.account_id);
        return acc?.status === 'ACTIVE' || acc?.status === 'READY';
      }
      if (row.account_kind === 'AI_ACCOUNT') {
        const acc = this.db.aiAccounts.getById(row.account_id);
        return acc?.status === 'READY' || acc?.status === 'ACTIVE';
      }
      return false;
    }

    if (row.job_id) {
      const job = this.db.jobs.getById(row.job_id);
      if (job && ['COMPLETED', 'ACCEPTED_WITH_WARNINGS', 'SKIPPED', 'CANCELLED'].includes(job.state)) {
        return true;
      }
      // Scope: all affected jobs terminal success
      const scope = parseAffectedScope(row.affected_scope_json);
      if (scope.jobIds.length > 0) {
        const allOk = scope.jobIds.every((id) => {
          const j = this.db.jobs.getById(id);
          return (
            j &&
            ['COMPLETED', 'ACCEPTED_WITH_WARNINGS', 'SKIPPED', 'CANCELLED'].includes(
              j.state,
            )
          );
        });
        if (allOk) return true;
      }
    }

    if (type === 'QA_CRITICAL' && row.project_id) {
      const openQa = this.db.translationQaFindings.countOpen(row.project_id);
      return openQa === 0;
    }

    return false;
  }
}

let singleton: AttentionInboxService | null = null;

export function getAttentionInboxService(
  db?: DatabaseManager,
): AttentionInboxService {
  if (!singleton || db) {
    singleton = new AttentionInboxService(db ?? getDatabase());
  }
  return singleton;
}

export function resetAttentionInboxServiceForTests(): void {
  singleton = null;
}
