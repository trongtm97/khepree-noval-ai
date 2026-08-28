import type { GoogleAccountDetail } from '../db/repositories/google-account-repository';
import type { GoogleAccountDto } from '@shared/schemas/account';
import type { GoogleAccountPlan, GoogleAccountStatus } from '@shared/constants/google-account';
import { browserProfileManager } from '../automation/browser-runner/profile-manager';
import { profileLockManager } from '../automation/browser-runner/profile-lock';

export function toGoogleAccountDto(detail: GoogleAccountDetail): GoogleAccountDto {
  const browserProfilePath = detail.profile_dir_name
    ? browserProfileManager.resolveProfilePath(detail.profile_dir_name)
    : '';

  const lease = browserProfilePath ? profileLockManager.getLease(browserProfilePath) : null;

  return {
    id: detail.id,
    email: detail.email,
    displayName: detail.display_name ?? detail.label,
    label: detail.label,
    avatarUrl: detail.avatar_url,
    plan: detail.plan as GoogleAccountPlan,
    status: detail.status as GoogleAccountStatus,
    browserProfilePath,
    lastSeenAt: detail.last_seen_at,
    lastUsedAt: detail.last_used_at,
    notes: detail.notes,
    workerEnabled: detail.worker_enabled,
    assignedProjectIds: detail.assigned_project_ids,
    assignedProjects: detail.assigned_project_titles,
    createdAt: detail.created_at,
    updatedAt: detail.updated_at,
    profileLease: lease
      ? {
          ownerId: lease.ownerId,
          operation: lease.operation,
          label: lease.label,
          pid: lease.pid,
          expiresAt: lease.expiresAt,
        }
      : null,
  };
}
