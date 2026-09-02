import type { KhepreeAccessState } from '@shared/schemas/khepree';
import type { KhepreeAccessStatus } from '@shared/constants/khepree';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export function formatKhepreeProductDisplayName(t: TranslateFn): string {
  const key = 'khepree.account.productDisplayName';
  const label = t(key);
  return label === key ? 'Khepree Novel AI' : label;
}

/** Device count with semantic fallbacks — never renders "? / ?". */
export function formatKhepreeDevicesCount(
  t: TranslateFn,
  used: number | null | undefined,
  max: number | null | undefined,
): string {
  if (used == null && max == null) {
    return t('khepree.devices.unavailable');
  }
  if (used == null || max == null) {
    return '—';
  }
  return t('khepree.account.devicesCount', { used, max });
}

export function formatKhepreeDevicesRemaining(
  t: TranslateFn,
  used: number | null | undefined,
  max: number | null | undefined,
): string | null {
  if (used == null || max == null || max <= 0) return null;
  const remaining = Math.max(0, max - used);
  return t('khepree.devices.slotsRemaining', { count: remaining });
}

export type KhepreeConnectionTone = 'success' | 'warning' | 'error';

export function khepreeAccountConnectionTone(
  state: Pick<KhepreeAccessState, 'status' | 'entitlement' | 'signedIn'>,
): KhepreeConnectionTone {
  if (!state.signedIn) return 'warning';
  if (state.entitlement === 'expired') return 'error';
  if (state.entitlement === 'suspended') return 'warning';
  if (state.status === 'ACTIVE' || state.status === 'FREE') return 'success';
  return 'warning';
}

export function formatKhepreeAccountConnectionLabel(
  t: TranslateFn,
  state: Pick<KhepreeAccessState, 'status' | 'entitlement' | 'signedIn'>,
): string {
  if (khepreeAccountConnectionTone(state) === 'success') {
    return t('khepree.account.connected');
  }
  return formatKhepreeAccessStatus(t, state.status);
}

/** Initials for profile avatar — first + last word, or first two chars. */
export function khepreeDisplayInitials(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

export function khepreeEntitlementBadgeVariant(
  entitlement: KhepreeAccessState['entitlement'],
): 'success' | 'warning' | 'error' | 'info' {
  switch (entitlement) {
    case 'active':
      return 'success';
    case 'suspended':
      return 'warning';
    case 'expired':
      return 'error';
    default:
      return 'info';
  }
}

/** Mask email for display — first char + domain visible. */
export function maskKhepreeEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 1) return `*${domain}`;
  return `${local[0]}${'*'.repeat(Math.min(3, local.length - 1))}${domain}`;
}

export function formatKhepreeAccessStatus(
  t: TranslateFn,
  status: KhepreeAccessStatus,
): string {
  const key = `khepree.accessStatus.${status}`;
  const label = t(key);
  return label === key ? status : label;
}

export function formatKhepreeEntitlement(
  t: TranslateFn,
  entitlement: KhepreeAccessState['entitlement'],
): string {
  const key = `khepree.entitlementState.${entitlement}`;
  const label = t(key);
  return label === key ? entitlement : label;
}

/** Renewal/expiry line only when server supplied lease expiry. */
export function formatKhepreeRenewalLine(
  t: TranslateFn,
  state: Pick<KhepreeAccessState, 'leaseExpiresAt' | 'graceUntil' | 'leaseValid'>,
): string | null {
  if (!state.leaseExpiresAt) return null;
  const expires = new Date(state.leaseExpiresAt);
  if (Number.isNaN(expires.getTime())) return null;
  const dateStr = expires.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  if (state.leaseValid) {
    return t('khepree.account.renewalActive', { date: dateStr });
  }
  if (state.graceUntil) {
    const grace = new Date(state.graceUntil);
    if (!Number.isNaN(grace.getTime())) {
      return t('khepree.account.graceUntil', {
        date: grace.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
      });
    }
  }
  return t('khepree.account.expiredOn', { date: dateStr });
}
