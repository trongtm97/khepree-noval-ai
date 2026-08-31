import type { KhepreeAccessState } from '@shared/schemas/khepree';
import type { KhepreeAccessStatus } from '@shared/constants/khepree';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

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
