import { t } from './index';

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
};

export function statusLabel(status: string | null | undefined): string {
  if (!status) return t('status.unknown');
  const key = STATUS_KEY[status] ?? STATUS_KEY[status.toUpperCase()];
  return key ? t(key) : status;
}

export function statusTone(
  status: string | null | undefined,
): 'ready' | 'running' | 'waiting' | 'warning' | 'error' | 'paused' | 'completed' {
  const s = (status ?? '').toUpperCase();
  if (s === 'READY' || s === 'CONNECTED' || s === 'COMPLETED') return s === 'COMPLETED' ? 'completed' : 'ready';
  if (
    s === 'RUNNING' ||
    s === 'TRANSLATING' ||
    s === 'SENDING' ||
    s === 'WAITING_AI' ||
    s === 'PARSING' ||
    s === 'QA' ||
    s === 'REPAIRING' ||
    s === 'PREPARING'
  ) {
    return 'running';
  }
  if (s === 'NEEDS_ATTENTION' || s === 'LIMITED' || s === 'LOGIN_REQUIRED' || s === 'BROWSER_NOT_SECURE' || s === 'ACCEPTED_WITH_WARNINGS') {
    return 'warning';
  }
  if (s === 'FAILED') return 'error';
  if (s === 'PAUSED' || s === 'CANCELLED' || s === 'SKIPPED') return 'paused';
  return 'waiting';
}
