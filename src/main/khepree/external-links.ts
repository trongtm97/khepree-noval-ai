import { shell } from 'electron';
import {
  KHEPREE_EXTERNAL_URLS,
  type KhepreeExternalLinkTarget,
} from '@shared/constants/khepree';
import { isKhepreeDevMockEnabled } from './config';
import { logger } from '../logging/logger';
import { sanitizeUrlForLog } from '../security/log-sanitize';

const PRODUCTION_ALLOWED_HOSTS = new Set(['khepree.com', 'account.khepree.com']);

function isDevLocalhostHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function resolveKhepreeExternalUrl(target: KhepreeExternalLinkTarget): string {
  return KHEPREE_EXTERNAL_URLS[target];
}

export function isAllowedKhepreeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!isKhepreeDevMockEnabled() && parsed.protocol !== 'https:') return false;
    if (isKhepreeDevMockEnabled() && parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    if (PRODUCTION_ALLOWED_HOSTS.has(parsed.hostname)) return true;
    return isKhepreeDevMockEnabled() && isDevLocalhostHost(parsed.hostname);
  } catch {
    return false;
  }
}

export async function openKhepreeExternal(target: KhepreeExternalLinkTarget): Promise<boolean> {
  const url = resolveKhepreeExternalUrl(target);
  if (!isAllowedKhepreeUrl(url)) {
    logger.warn('Blocked Khepree external URL', { target, url: sanitizeUrlForLog(url) });
    return false;
  }
  await shell.openExternal(url);
  return true;
}

export async function openValidatedKhepreeUrl(url: string): Promise<boolean> {
  if (!isAllowedKhepreeUrl(url)) {
    logger.warn('Blocked arbitrary Khepree URL from opening', { url: sanitizeUrlForLog(url) });
    return false;
  }
  await shell.openExternal(url);
  return true;
}
