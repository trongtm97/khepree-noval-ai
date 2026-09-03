import type { DatabaseManager } from '../../db/database-manager';
import {
  automationCodeToPoolState,
  type BrowserAttentionAction,
  type BrowserAccountPoolState,
} from '@shared/constants/browser-account-pool';
import { getBrowserCircuitBreaker } from './circuit-breaker';
import { logger } from '../../logging/logger';

export interface BrowserPoolAttentionInput {
  accountKind: 'GOOGLE_ACCOUNT' | 'AI_ACCOUNT' | string;
  accountId: string;
  providerId?: string | null;
  providerType?: string | null;
  errorCode: string;
  summary: string;
  diagnosticsPath?: string | null;
}

function suggestedActionFor(
  pool: BrowserAccountPoolState,
): BrowserAttentionAction {
  switch (pool) {
    case 'LOGIN_REQUIRED':
      return 'open_login';
    case 'CAPTCHA_REQUIRED':
    case 'BLOCKED':
      return 'open_browser';
    case 'QUOTA_EXHAUSTED':
      return 'dismiss';
    default:
      return 'open_browser';
  }
}

/**
 * Stop scheduling work for this profile and open an Attention Item.
 * Never bypasses CAPTCHA / anti-bot — user must act.
 */
export function applyBrowserPoolAttention(
  db: DatabaseManager,
  input: BrowserPoolAttentionInput,
): { attentionId: string | null; poolState: BrowserAccountPoolState } {
  const mapped = automationCodeToPoolState(input.errorCode);
  const breaker = getBrowserCircuitBreaker();
  const providerKey = input.providerId ?? input.providerType ?? 'browser';
  breaker.tripForAttention(providerKey, input.accountId);

  try {
    if (input.accountKind === 'GOOGLE_ACCOUNT') {
      const account = db.googleAccounts.getById(input.accountId);
      if (account) {
        const status =
          mapped.pool === 'LOGIN_REQUIRED'
            ? 'LOGIN_REQUIRED'
            : mapped.pool === 'QUOTA_EXHAUSTED'
              ? 'LIMITED'
              : mapped.pool === 'DISABLED'
                ? 'DISABLED'
                : 'NEEDS_ATTENTION';
        db.googleAccounts.update(account.id, { status });
        const worker = db.workerStates.getByAccountId(account.id);
        if (worker) {
          db.workerStates.setHealth(worker.id, 'NEEDS_ATTENTION', {
            lastError: input.summary.slice(0, 500),
          });
        }
      }
    } else if (input.accountKind === 'AI_ACCOUNT') {
      const row = db.aiAccounts.getById(input.accountId);
      if (row) {
        const status =
          mapped.pool === 'LOGIN_REQUIRED'
            ? 'LOGIN_REQUIRED'
            : mapped.pool === 'DISABLED'
              ? 'DISABLED'
              : 'ERROR';
        db.aiAccounts.setStatus(row.id, status, input.summary.slice(0, 500));
      }
    }
  } catch (error) {
    logger.warn('applyBrowserPoolAttention account update failed', {
      accountId: input.accountId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  if (!mapped.attention) {
    return { attentionId: null, poolState: mapped.pool };
  }

  const existing = db.browserAttention.findOpen(
    input.accountKind,
    input.accountId,
    mapped.attention,
  );
  if (existing) {
    return { attentionId: existing.id, poolState: mapped.pool };
  }

  const item = db.browserAttention.create({
    accountKind: input.accountKind,
    accountId: input.accountId,
    providerId: input.providerId ?? null,
    providerType: input.providerType ?? null,
    kind: mapped.attention,
    poolState: mapped.pool,
    summary: input.summary.slice(0, 500),
    suggestedAction: suggestedActionFor(mapped.pool),
    diagnosticsPath: input.diagnosticsPath ?? null,
  });

  try {
    const { getAttentionInboxService } = require('../../services/attention-inbox-service') as typeof import('../../services/attention-inbox-service');
    getAttentionInboxService(db).upsertFromBrowserAttention({
      kind: mapped.attention,
      accountId: input.accountId,
      accountKind: input.accountKind,
      summary: input.summary.slice(0, 500),
      causeCode: input.errorCode,
    });
  } catch (err) {
    logger.warn('Attention inbox upsert from browser failed', {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  logger.info('Browser attention item opened', {
    attentionId: item.id,
    kind: item.kind,
    accountId: input.accountId,
    // no cookies / prompt / novel content
  });

  return { attentionId: item.id, poolState: mapped.pool };
}
