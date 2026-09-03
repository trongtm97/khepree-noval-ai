import {
  DesktopAnnouncementCtaSchema,
  SafeAnnouncementCtaSchema,
  type SafeAnnouncementCta,
} from '@shared/schemas/khepree-announcements';
import type { z } from 'zod';

type DesktopAnnouncementCta = z.infer<typeof DesktopAnnouncementCtaSchema>;
import { isAllowedKhepreeUrl } from './external-links';

const BLOCKED_URL_SCHEMES = /^(javascript|file|data|vbscript):/i;
const SHELL_METACHAR = /[;|`$]|&&|\|\||\$\(/;

/** Known safe internal paths from Khepree admin → desktop action mapping. */
const SAFE_INTERNAL_PATH_ACTIONS: Readonly<Record<string, SafeAnnouncementCta['action']>> = {
  '/settings': 'open-settings',
  '/desktop/settings': 'open-settings',
  '/release-notes': 'open-release-notes',
  '/desktop/release-notes': 'open-release-notes',
  '/account': 'open-account',
  '/desktop/account': 'open-account',
  '/updates/check': 'check-for-updates',
  '/desktop/updates/check': 'check-for-updates',
};

function normalizeInternalPath(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length > 1 && trimmed.endsWith('/')) return trimmed.slice(0, -1);
  return trimmed;
}

function isSafeInternalPath(path: string): boolean {
  const trimmed = normalizeInternalPath(path);
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return false;
  if (trimmed.includes('://') || trimmed.includes('\\')) return false;
  if (/\s/.test(trimmed)) return false;
  if (SHELL_METACHAR.test(trimmed)) return false;
  return trimmed.length <= 512;
}

function safeCtaForInternalPath(path: string): SafeAnnouncementCta | null {
  const normalizedPath = normalizeInternalPath(path);
  if (!(normalizedPath in SAFE_INTERNAL_PATH_ACTIONS)) {
    return null;
  }
  const action = SAFE_INTERNAL_PATH_ACTIONS[normalizedPath];
  switch (action) {
    case 'open-settings':
      return { action: 'open-settings' };
    case 'open-release-notes':
      return { action: 'open-release-notes' };
    case 'open-account':
      return { action: 'open-account' };
    case 'check-for-updates':
      return { action: 'check-for-updates' };
    default:
      return null;
  }
}

function mapUrlToAction(url: string): SafeAnnouncementCta | null {
  const trimmed = url.trim();
  if (!trimmed || BLOCKED_URL_SCHEMES.test(trimmed)) return null;
  if (SHELL_METACHAR.test(trimmed)) return null;
  if (!isAllowedKhepreeUrl(trimmed)) return null;

  try {
    const parsed = new URL(trimmed);
    const normalizedPath = normalizeInternalPath(parsed.pathname);
    if (normalizedPath in SAFE_INTERNAL_PATH_ACTIONS) {
      return safeCtaForInternalPath(normalizedPath);
    }
  } catch {
    return null;
  }

  return SafeAnnouncementCtaSchema.safeParse({ action: 'open-url', url: trimmed }).success
    ? { action: 'open-url', url: trimmed }
    : null;
}

/** Normalize server CTA to client-safe action; reject unknown/unsafe payloads. */
export function resolveSafeAnnouncementCta(cta: DesktopAnnouncementCta): SafeAnnouncementCta | null {
  if (cta.kind === 'none') {
    if (cta.payload != null && Object.keys(cta.payload).length > 0) return null;
    return null;
  }

  if (cta.payload == null || typeof cta.payload !== 'object' || Array.isArray(cta.payload)) {
    return null;
  }

  if (cta.kind === 'open_url') {
    const url = (cta.payload as { url?: unknown }).url;
    if (typeof url !== 'string' || !url.trim()) return null;
    return mapUrlToAction(url);
  }

  const path = (cta.payload as { path?: unknown }).path;
  if (typeof path !== 'string' || !path.trim()) return null;
  if (!isSafeInternalPath(path)) return null;
  const normalizedPath = normalizeInternalPath(path);
  if (!(normalizedPath in SAFE_INTERNAL_PATH_ACTIONS)) return null;
  return safeCtaForInternalPath(normalizedPath);
}

export function mapAnnouncementSeverityToKind(
  severity: string,
): 'SUCCESS' | 'INFO' | 'WARNING' | 'ERROR' | 'ACTION_REQUIRED' {
  switch (severity) {
    case 'success':
      return 'SUCCESS';
    case 'warning':
      return 'WARNING';
    case 'error':
      return 'ERROR';
    case 'action_required':
      return 'ACTION_REQUIRED';
    default:
      return 'INFO';
  }
}
