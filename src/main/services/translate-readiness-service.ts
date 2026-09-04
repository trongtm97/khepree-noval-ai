import type { DatabaseManager } from '../db/database-manager';
import { checkProviderForJob } from '../ai/provider-preflight';
import { healIdleWorkers } from '../jobs/heal-workers';
import { NotebookBootstrapService } from '../notebook/notebook-bootstrap-service';
import { NOTEBOOK_CHANNEL_READY } from '@shared/constants/notebook';
import { isProviderPreflightUsable } from '@shared/constants/provider-preflight';
import { logger } from '../logging/logger';
import { readPreferNotebookPack } from '@shared/constants/project-style-config';
import { resolveTranslationPackMode } from '../prompt/pack-mode-resolver';
import { resolveProjectWorker } from './project-worker-resolver';
import { getAccountAvailabilityService } from './account-availability-service';
import { getNotebookSendReadinessService } from './notebook-send-readiness-singleton';
import {
  NOTEBOOK_BINDING_INACCESSIBLE_USER_MESSAGE_VI,
  NOTEBOOK_BINDING_ACCESS_ACTIONS,
} from '@shared/constants/notebook-binding-access';

export const TRANSLATE_ENSURE_REASONS = [
  'ok',
  'no_account',
  'needs_google_login',
  'needs_notebook',
  'no_channel',
] as const;

export type TranslateEnsureReason = (typeof TRANSLATE_ENSURE_REASONS)[number];

export const TRANSLATE_ENSURE_ACTIONS = [
  'check_google',
  'open_notebook',
  'open_ai_memory',
  'retry_connect',
  'relink_notebook',
] as const;

export type TranslateEnsureAction = (typeof TRANSLATE_ENSURE_ACTIONS)[number];

export interface TranslateEnsureResult {
  ok: boolean;
  reason: TranslateEnsureReason;
  message: string;
  workerAccountId: string | null;
  notebookStatus: string | null;
  usedFallback: boolean;
  needsAssisted: boolean;
  actions: TranslateEnsureAction[];
}

export interface TranslateReadinessDeps {
  openBrowser?: (
    accountId: string,
    target: 'gemini' | 'notebook',
  ) => Promise<unknown>;
  testSession?: (accountId: string) => Promise<{ usable: boolean; reason?: string }>;
  prepareForTranslate?: (
    projectId: string,
    options?: { accountId?: string | null },
  ) => Promise<{
    ready: boolean;
    usedFallback: boolean;
    message: string;
    notebookStatus: string | null;
    needsAssisted: boolean;
  }>;
}

function upper(value: string | null | undefined): string {
  return (value ?? '').toUpperCase();
}

/**
 * Auto-heal Google worker / Notebook before translate.
 * Only returns ok:false after heal attempts when user action is still required.
 */
export class TranslateReadinessService {
  constructor(
    private readonly db: DatabaseManager,
    private readonly deps: TranslateReadinessDeps = {},
  ) {}

  async ensureForTranslate(
    projectId: string,
    preferredAccountId?: string | null,
  ): Promise<TranslateEnsureResult> {
    if (!this.db.projects.getById(projectId)) {
      throw new Error(`Project not found: ${projectId}`);
    }

    healIdleWorkers(this.db);

    let accountId = this.pickAccountId(projectId, preferredAccountId);
    const availabilitySvc = getAccountAvailabilityService(this.db);
    if (!accountId) {
      const preflight = availabilitySvc.preflightMessage();
      return {
        ok: false,
        reason: 'no_account',
        message:
          preflight ??
          'Chưa có tài khoản Google. Thêm tài khoản và đăng nhập Gemini trước khi dịch.',
        workerAccountId: null,
        notebookStatus: null,
        usedFallback: true,
        needsAssisted: false,
        actions: ['check_google'],
      };
    }

    const loginNeeded = this.accountNeedsLogin(accountId);
    if (loginNeeded) {
      await this.tryOpenBrowser(accountId, 'gemini');
      const session = await this.tryTestSession(accountId);
      const availability = availabilitySvc.resolve(accountId);
      if (!session.usable && !availability.usableForNewJob) {
        const preflight = availabilitySvc.preflightMessage();
        return {
          ok: false,
          reason: 'needs_google_login',
          message:
            preflight ??
            (session.reason === 'BUSY'
              ? 'Tài khoản Google đang bận (trình duyệt mở). Đóng xong bấm dịch lại, hoặc kiểm tra đăng nhập.'
              : 'Cần đăng nhập Google / Gemini. Đã mở trình duyệt — hoàn tất đăng nhập rồi bấm dịch lại.'),
          workerAccountId: accountId,
          notebookStatus: null,
          usedFallback: true,
          needsAssisted: false,
          actions: ['check_google'],
        };
      }
    }

    // Re-pick in case heal/testSession changed READY set
    accountId = this.pickAccountId(projectId, preferredAccountId) ?? accountId;

    const prepare =
      this.deps.prepareForTranslate ??
      ((pid: string, opts?: { accountId?: string | null }) =>
        new NotebookBootstrapService(this.db).prepareForTranslate(pid, opts));

    const prepared = await prepare(projectId, { accountId });
    const notebookStatus = prepared.notebookStatus;

    const preferNotebook = readPreferNotebookPack(
      this.db.projects.getStyleConfig(projectId),
    );
    if (preferNotebook && accountId) {
      const packMode = resolveTranslationPackMode(this.db, {
        projectId,
        accountId,
        preferNotebookPack: true,
      }).packMode;
      const sendReady = await getNotebookSendReadinessService().ensureForSend({
        projectId,
        accountId,
        packMode,
      });
      if (!sendReady.ok && sendReady.needsAssisted) {
        if (!prepared.needsAssisted && !sendReady.bindingInaccessible) {
          await this.tryOpenBrowser(accountId, 'notebook');
        }
        const inaccessible = Boolean(sendReady.bindingInaccessible);
        return {
          ok: false,
          reason: 'needs_notebook',
          message: inaccessible
            ? sendReady.userMessage || NOTEBOOK_BINDING_INACCESSIBLE_USER_MESSAGE_VI
            : sendReady.message,
          workerAccountId: accountId,
          notebookStatus: sendReady.mapping?.status ?? notebookStatus,
          usedFallback: true,
          needsAssisted: true,
          actions: inaccessible
            ? [...NOTEBOOK_BINDING_ACCESS_ACTIONS]
            : ['open_notebook', 'open_ai_memory'],
        };
      }
    }

    const webApiReady = this.hasWebApiReady();
    const notebookReady = NOTEBOOK_CHANNEL_READY.has(
      (notebookStatus ?? '').toLowerCase(),
    );
    const providerChannelReady = await this.hasUsableTranslateChannel(
      accountId,
      projectId,
    );

    if (providerChannelReady || webApiReady || notebookReady) {
      return {
        ok: true,
        reason: 'ok',
        message: prepared.message,
        workerAccountId: accountId,
        notebookStatus,
        usedFallback: prepared.usedFallback,
        needsAssisted: prepared.needsAssisted,
        actions: prepared.needsAssisted
          ? ['open_notebook', 'open_ai_memory']
          : [],
      };
    }

    // Still no channel — open NotebookLM for user if we have an account
    if (!prepared.needsAssisted) {
      await this.tryOpenBrowser(accountId, 'notebook');
    }

    return {
      ok: false,
      reason: 'needs_notebook',
      message:
        prepared.message ||
        'Chưa có kênh dịch (Web API / Notebook). Đã mở NotebookLM — hoàn tất thiết lập rồi bấm dịch lại.',
      workerAccountId: accountId,
      notebookStatus,
      usedFallback: true,
      needsAssisted: prepared.needsAssisted || true,
      actions: ['open_notebook', 'open_ai_memory', 'check_google'],
    };
  }

  private pickAccountId(
    projectId: string,
    preferred?: string | null,
  ): string | null {
    return resolveProjectWorker(this.db, {
      projectId,
      purpose: 'translation',
      preferredAccountId: preferred,
    }).accountId;
  }

  private accountNeedsLogin(accountId: string): boolean {
    const availability = getAccountAvailabilityService(this.db).resolve(accountId);
    return (
      availability.availability === 'LOGIN_REQUIRED' ||
      availability.availability === 'NEEDS_ATTENTION'
    );
  }

  private hasWebApiReady(): boolean {
    const accounts = this.db.aiAccounts.listAll();
    return accounts.some((a) => upper(a.status) === 'READY');
  }

  /** Match job send path: any enabled provider passes lightweight preflight. */
  private async hasUsableTranslateChannel(
    accountId: string,
    projectId: string,
  ): Promise<boolean> {
    const enabled = this.db.aiProviders.listEnabledOrdered();
    for (const row of enabled) {
      try {
        const report = await checkProviderForJob(this.db, {
          accountRef: {
            accountKind: 'GOOGLE_ACCOUNT',
            accountId,
            profileDirName: null,
          },
          projectId,
          providerId: row.id,
          requireNotebook: false,
          lightweight: true,
        });
        if (isProviderPreflightUsable(report.result)) {
          return true;
        }
      } catch (error) {
        logger.warn('ensureForTranslate provider preflight failed', {
          providerId: row.id,
          accountId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return false;
  }

  private async tryOpenBrowser(
    accountId: string,
    target: 'gemini' | 'notebook',
  ): Promise<void> {
    try {
      if (this.deps.openBrowser) {
        await this.deps.openBrowser(accountId, target);
        return;
      }
      const { getAccountWorkerService } = await import('./account-worker-singleton');
      await getAccountWorkerService().openBrowser(accountId, target);
    } catch (error) {
      logger.warn('ensureForTranslate openBrowser failed', {
        accountId,
        target,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async tryTestSession(
    accountId: string,
  ): Promise<{ usable: boolean; reason?: string }> {
    try {
      if (this.deps.testSession) {
        return await this.deps.testSession(accountId);
      }
      const { getAccountWorkerService } = await import('./account-worker-singleton');
      const result = await getAccountWorkerService().testSession(accountId);
      return { usable: result.usable, reason: result.reason };
    } catch (error) {
      logger.warn('ensureForTranslate testSession failed', {
        accountId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { usable: false, reason: 'TEST_FAILED' };
    }
  }
}
