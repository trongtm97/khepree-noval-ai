/**
 * Re-exports shared access state machine helpers for main-process imports.
 */
export {
  KHEPREE_ACCESS_STATES,
  type KhepreeAccessStatus,
  isKhepreeActive,
  resolveStatusFromEntitlement,
  canUseKhepreeWorkspace,
  isBlockingWorkspaceStatus,
} from '@shared/constants/khepree-access-states';
