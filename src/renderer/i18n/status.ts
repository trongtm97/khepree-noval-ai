import { t } from './index';
import { LEGACY_KNOWLEDGE_SYNC_PENDING_EVENT } from '@shared/constants/legacy-knowledge-events';

const STATUS_KEY: Record<string, string> = {
  READY: 'status.ready',
  ready: 'status.ready',
  RUNNING: 'status.running',
  running: 'status.running',
  WAITING: 'status.waiting',
  waiting: 'status.waiting',
  PAUSED: 'status.paused',
  paused: 'status.paused',
  COMPLETED: 'status.completed',
  completed: 'status.completed',
  FAILED: 'status.failed',
  failed: 'status.failed',
  NEEDS_ATTENTION: 'status.needsAttention',
  needs_attention: 'status.needsAttention',
  LIMITED: 'status.limited',
  limited: 'status.limited',
  DISCONNECTED: 'status.disconnected',
  disconnected: 'status.disconnected',
  CONNECTED: 'status.connected',
  connected: 'status.connected',
  BUSY: 'status.running',
  busy: 'status.running',
  LOGIN_REQUIRED: 'status.loginRequired',
  login_required: 'status.loginRequired',
  BROWSER_NOT_SECURE: 'accounts.browserNotSecureStatus',
  browser_not_secure: 'accounts.browserNotSecureStatus',
  NEW: 'status.new',
  new: 'status.new',
  CANCELLED: 'status.cancelled',
  cancelled: 'status.cancelled',
  TRANSLATING: 'status.translating',
  translating: 'status.translating',
  QUEUED: 'status.queued',
  queued: 'status.queued',
  PREPARING: 'status.preparing',
  preparing: 'status.preparing',
  WAITING_WORKER: 'status.waitingWorker',
  waiting_worker: 'status.waitingWorker',
  SENDING: 'status.sending',
  sending: 'status.sending',
  WAITING_AI: 'status.waitingAi',
  waiting_ai: 'status.waitingAi',
  PARSING: 'status.parsing',
  parsing: 'status.parsing',
  QA: 'status.qa',
  qa: 'status.qa',
  REPAIRING: 'status.repairing',
  repairing: 'status.repairing',
  ACCEPTED_WITH_WARNINGS: 'status.acceptedWithWarnings',
  accepted_with_warnings: 'status.acceptedWithWarnings',
  SKIPPED: 'status.skipped',
  skipped: 'status.skipped',
  // Notebook / memory bootstrap (never show raw enums to users)
  NOT_STARTED: 'status.notStarted',
  not_started: 'status.notStarted',
  ANALYZING: 'status.analyzing',
  analyzing: 'status.analyzing',
  PROCESSING: 'status.processing',
  processing: 'status.processing',
  COMPLETED_WITH_WARNINGS: 'status.completedWithWarnings',
  completed_with_warnings: 'status.completedWithWarnings',
  SYNC_PENDING: 'status.syncPending',
  sync_pending: 'status.syncPending',
  KNOWLEDGE_SYNC_PENDING: 'status.syncPending',
  [LEGACY_KNOWLEDGE_SYNC_PENDING_EVENT]: 'status.syncPending',
  SYNCING: 'status.syncing',
  syncing: 'status.syncing',
  STALE: 'status.stale',
  stale: 'status.stale',
  UNAVAILABLE: 'status.unavailable',
  unavailable: 'status.unavailable',
  ASSISTED_SETUP: 'status.assistedSetup',
  assisted_setup: 'status.assistedSetup',
  PENDING: 'status.pending',
  pending: 'status.pending',
  SOURCE_READY: 'status.sourceReady',
  source_ready: 'status.sourceReady',
  SOURCE_MISSING: 'status.sourceMissing',
  source_missing: 'status.sourceMissing',
  SOURCE_STALE: 'status.sourceStale',
  source_stale: 'status.sourceStale',
  ERROR: 'status.failed',
  error: 'status.failed',
  ENABLED: 'status.enabled',
  enabled: 'status.enabled',
  DISABLED: 'status.disabled',
  disabled: 'status.disabled',
  UNKNOWN: 'status.unknown',
  unknown: 'status.unknown',
};

/**
 * Human Vietnamese label for machine status codes.
 * Never returns raw enums (SYNC_PENDING, READY, …) to the UI.
 */
export function statusLabel(status: string | null | undefined): string {
  if (!status) return t('status.unknown');
  const key = STATUS_KEY[status] ?? STATUS_KEY[status.toUpperCase()];
  return key ? t(key) : t('status.unknown');
}

export function statusTone(
  status: string | null | undefined,
): 'ready' | 'running' | 'waiting' | 'warning' | 'error' | 'paused' | 'completed' {
  const s = (status ?? '').toUpperCase();
  if (s === 'READY' || s === 'CONNECTED' || s === 'ENABLED' || s === 'SOURCE_READY') {
    return 'ready';
  }
  if (s === 'COMPLETED') return 'completed';
  if (
    s === 'RUNNING' ||
    s === 'TRANSLATING' ||
    s === 'SENDING' ||
    s === 'WAITING_AI' ||
    s === 'PARSING' ||
    s === 'QA' ||
    s === 'REPAIRING' ||
    s === 'PREPARING' ||
    s === 'ANALYZING' ||
    s === 'PROCESSING' ||
    s === 'SYNCING' ||
    s === 'BUSY'
  ) {
    return 'running';
  }
  if (
    s === 'NEEDS_ATTENTION' ||
    s === 'LIMITED' ||
    s === 'LOGIN_REQUIRED' ||
    s === 'BROWSER_NOT_SECURE' ||
    s === 'ACCEPTED_WITH_WARNINGS' ||
    s === 'COMPLETED_WITH_WARNINGS' ||
    s === 'STALE' ||
    s === 'SYNC_PENDING' ||
    s === 'KNOWLEDGE_SYNC_PENDING' ||
    s === LEGACY_KNOWLEDGE_SYNC_PENDING_EVENT ||
    s === 'ASSISTED_SETUP' ||
    s === 'SOURCE_STALE'
  ) {
    return 'warning';
  }
  if (s === 'FAILED' || s === 'ERROR' || s === 'UNAVAILABLE' || s === 'SOURCE_MISSING') {
    return 'error';
  }
  if (s === 'PAUSED' || s === 'CANCELLED' || s === 'SKIPPED' || s === 'DISABLED') {
    return 'paused';
  }
  return 'waiting';
}
