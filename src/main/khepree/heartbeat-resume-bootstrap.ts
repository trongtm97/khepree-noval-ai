import { powerMonitor } from 'electron';
import { KHEPREE_RESUME_HEARTBEAT_DEBOUNCE_MS } from '@shared/constants/khepree';
import { triggerKhepreeHeartbeatNow } from './khepree-access-singleton';
import { logger } from '../logging/logger';

let installed = false;
let lastResumeTriggerAt = 0;

function onSystemResume(source: string): void {
  const now = Date.now();
  if (now - lastResumeTriggerAt < KHEPREE_RESUME_HEARTBEAT_DEBOUNCE_MS) {
    return;
  }
  lastResumeTriggerAt = now;
  logger.info('Khepree heartbeat triggered after system resume', { source });
  triggerKhepreeHeartbeatNow();
}

/** Windows sleep/resume — validate license promptly instead of waiting full interval. */
export function installKhepreeHeartbeatResumeHandlers(): void {
  if (installed) return;
  installed = true;
  powerMonitor.on('resume', () => onSystemResume('powerMonitor.resume'));
  powerMonitor.on('unlock-screen', () => onSystemResume('powerMonitor.unlock-screen'));
}

export function resetKhepreeHeartbeatResumeHandlersForTests(): void {
  installed = false;
  lastResumeTriggerAt = 0;
}
