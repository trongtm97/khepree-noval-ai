import { shell } from 'electron';
import {
  KHEPREE_EXTERNAL_URLS,
  type KhepreeExternalLinkTarget,
} from '@shared/constants/khepree';
import { logger } from '../logging/logger';

const ALLOWED_HOSTS = new Set(['khepree.com', 'account.khepree.com']);

export function resolveKhepreeExternalUrl(target: KhepreeExternalLinkTarget): string {
  return KHEPREE_EXTERNAL_URLS[target];
}

export function isAllowedKhepreeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export async function openKhepreeExternal(target: KhepreeExternalLinkTarget): Promise<boolean> {
  const url = resolveKhepreeExternalUrl(target);
  if (!isAllowedKhepreeUrl(url)) {
    logger.warn('Blocked Khepree external URL', { target, url });
    return false;
  }
  await shell.openExternal(url);
  return true;
}

export async function openValidatedKhepreeUrl(url: string): Promise<boolean> {
  if (!isAllowedKhepreeUrl(url)) {
    logger.warn('Blocked arbitrary Khepree URL from opening', { url });
    return false;
  }
  await shell.openExternal(url);
  return true;
}
