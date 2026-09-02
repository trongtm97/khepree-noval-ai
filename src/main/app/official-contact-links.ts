import { shell } from 'electron';
import {
  APPROVED_OFFICIAL_CONTACT_HOSTS,
  isOfficialContactChannel,
  resolveOfficialContactUrl,
} from '@shared/constants/official-contacts';
import { logger } from '../logging/logger';
import { sanitizeUrlForLog } from '../security/log-sanitize';

export function isAllowedOfficialContactUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return APPROVED_OFFICIAL_CONTACT_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export async function openOfficialContact(channel: string): Promise<boolean> {
  if (!isOfficialContactChannel(channel)) {
    logger.warn('Blocked invalid official contact channel', { channel });
    return false;
  }

  const url = resolveOfficialContactUrl(channel);
  if (!isAllowedOfficialContactUrl(url)) {
    logger.warn('Blocked official contact URL', {
      channel,
      url: sanitizeUrlForLog(url),
    });
    return false;
  }

  try {
    await shell.openExternal(url);
    return true;
  } catch (error) {
    logger.warn('Failed to open official contact URL', {
      channel,
      url: sanitizeUrlForLog(url),
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
