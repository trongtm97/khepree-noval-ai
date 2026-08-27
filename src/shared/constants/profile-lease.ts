/** Process-aware browser profile lease lock. */

export const PROFILE_LEASE_FILENAME = '.noveltrans.lock';

/** Lease time-to-live; must be renewed via heartbeat while work runs. */
export const PROFILE_LEASE_TTL_MS = 60_000;

/** Default heartbeat interval while an operation holds the lease. */
export const PROFILE_LEASE_HEARTBEAT_MS = 15_000;

export const PROFILE_LEASE_OPERATIONS = [
  'translation',
  'full_preprocess',
  'notebook_setup',
  'manual_browser',
  'runtime',
  'diagnostics_repair',
  'legacy',
] as const;

export type ProfileLeaseOperation = (typeof PROFILE_LEASE_OPERATIONS)[number];

export interface ProfileLeaseMeta {
  profilePath: string;
  ownerId: string;
  accountId: string;
  operation: ProfileLeaseOperation;
  pid: number;
  processInstanceId: string;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
  /** Human-readable status, e.g. "Dịch chương 51–53". */
  label: string;
}

export function defaultLeaseLabel(operation: ProfileLeaseOperation): string {
  switch (operation) {
    case 'translation':
      return 'Đang dịch';
    case 'full_preprocess':
      return 'Khởi tạo AI memory (full preprocess)';
    case 'notebook_setup':
      return 'Thiết lập Notebook';
    case 'manual_browser':
      return 'Mở trình duyệt thủ công';
    case 'runtime':
      return 'Browser runtime persistent';
    case 'diagnostics_repair':
      return 'Sửa selector (diagnostics)';
    default:
      return 'Tác vụ browser';
  }
}
