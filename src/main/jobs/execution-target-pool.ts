import type { DatabaseManager } from '../db/database-manager';
import type { JobRow } from '../db/repositories/job-repository';
import type { ConcurrencyPolicy } from '@shared/constants/concurrency-policy';
import { browserProfileManager } from '../automation/browser-runner/profile-manager';
import {
  canAdmitJob,
  type ConcurrencySnapshot,
} from './concurrency-policy';
import { providerKindForTarget } from './execution-target-utils';
import {
  AiExecutionWorkerResolver,
  type ListAvailableTargetsOptions,
} from '../ai/execution-worker-resolver';
import type { AiExecutionTarget } from '../ai/execution-target';

export interface SelectedExecutionTarget {
  target: AiExecutionTarget;
  profilePath: string;
}

export interface FairSelectExecutionOptions {
  policy: ConcurrencyPolicy;
  snapshot: ConcurrencySnapshot;
  projectId?: string | null;
  busyAccountIds?: ReadonlySet<string>;
}

/**
 * Fair pool over provider-neutral execution targets (Google + ai_accounts).
 */
export class ExecutionTargetPool {
  private readonly resolver: AiExecutionWorkerResolver;

  constructor(private readonly db: DatabaseManager) {
    this.resolver = new AiExecutionWorkerResolver(db);
  }

  listAvailable(options?: ListAvailableTargetsOptions): AiExecutionTarget[] {
    return this.resolver.listAvailableTargets(options ?? {});
  }

  listAvailableFair(options?: {
    projectId?: string | null;
    busyAccountIds?: ReadonlySet<string>;
  }): AiExecutionTarget[] {
    const busy = options?.busyAccountIds ?? new Set<string>();
    return this.resolver.listAvailableTargets({
      projectId: options?.projectId,
      busyAccountIds: busy,
    });
  }

  selectForJob(
    job: JobRow,
    fair?: FairSelectExecutionOptions,
  ): SelectedExecutionTarget | null {
    const busy = fair?.busyAccountIds ?? new Set<string>();
    const available = this.listAvailableFair({
      projectId: job.project_id,
      busyAccountIds: busy,
    });

    if (job.worker_mode === 'PINNED' && job.pinned_account_id) {
      const pinned = available.find((t) => t.accountId === job.pinned_account_id);
      if (!pinned) return null;
      if (fair && !this.passesAdmit(fair, pinned, job.project_id)) return null;
      return this.toSelected(pinned);
    }

    if (job.execution_account_id && job.execution_provider_id) {
      const pinned = available.find(
        (t) =>
          t.accountId === job.execution_account_id &&
          t.providerId === job.execution_provider_id,
      );
      if (pinned) {
        if (fair && !this.passesAdmit(fair, pinned, job.project_id)) return null;
        return this.toSelected(pinned);
      }
    }

    for (const target of available) {
      if (fair && !this.passesAdmit(fair, target, job.project_id)) continue;
      const selected = this.toSelected(target);
      if (selected) return selected;
    }
    return null;
  }

  private passesAdmit(
    fair: FairSelectExecutionOptions,
    target: AiExecutionTarget,
    projectId: string,
  ): boolean {
    return canAdmitJob(fair.policy, fair.snapshot, {
      projectId,
      accountId: target.concurrencyKey,
      providerKind: providerKindForTarget(target),
    });
  }

  private toSelected(target: AiExecutionTarget): SelectedExecutionTarget | null {
    let profilePath: string;
    if (target.profileDirName) {
      profilePath = browserProfileManager.resolveProfilePath(target.profileDirName);
    } else if (target.accountKind === 'GOOGLE_ACCOUNT') {
      const profile = this.db.googleAccounts.getProfile(target.accountId);
      if (!profile?.profile_dir_name) return null;
      profilePath = browserProfileManager.resolveProfilePath(profile.profile_dir_name);
    } else {
      // Web API — no browser profile; use synthetic path for lock noop
      profilePath = '';
    }
    return { target, profilePath };
  }
}
