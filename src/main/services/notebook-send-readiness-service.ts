import type { PackMode } from '@shared/constants/pack-mode';
import type { DatabaseManager } from '../db/database-manager';
import type { NotebookResourceRow } from '../db/repositories/notebook-repository';
import { logger } from '../logging/logger';
import {
  healLegacyTranslationNotebookMappings,
  PLAYWRIGHT_SEND_READY_STATUSES,
  resolvePlaywrightSendTarget,
} from '../notebook/playwright-send-target';
import type { ProvisionNotebookResult } from './notebook-service';

export interface NotebookSendReadinessResult {
  ok: boolean;
  needsAssisted: boolean;
  message: string;
  notebookUrl: string;
  notebookRowId: string | null;
  mapping: NotebookResourceRow | null;
  usedWebChatFallback: boolean;
  bindingInaccessible?: boolean;
  userMessage?: string;
  technicalDetail?: string | null;
  actions?: import('@shared/constants/notebook-binding-access').NotebookBindingAccessAction[];
}

export interface NotebookSendReadinessDeps {
  provision?: (input: {
    projectId: string;
    accountId: string;
    role: 'SINGLE';
  }) => Promise<ProvisionNotebookResult>;
  resumeAssisted?: (input: {
    projectId: string;
    accountId: string;
    role: 'SINGLE';
  }) => Promise<ProvisionNotebookResult>;
  openBrowser?: (accountId: string, target: 'notebook') => Promise<unknown>;
}

function viMessageAssistedSetup(): string {
  return 'NotebookLM chưa sẵn sàng — app đang tự thiết lập. Hoàn tất trong trình duyệt rồi bấm Thử lại.';
}

function findAssistedOrPendingMapping(
  db: DatabaseManager,
  projectId: string,
  accountId: string,
): NotebookResourceRow | null {
  const rows = db.notebooks.listByProjectAndWorker(projectId, accountId);
  return (
    rows.find(
      (r) =>
        (r.notebook_role === 'SINGLE' || r.notebook_role === 'TRANSLATION') &&
        !r.deprecated_at &&
        (r.status === 'assisted_setup' ||
          r.status === 'pending' ||
          r.status === 'provisioning' ||
          r.status === 'error'),
    ) ?? null
  );
}

export class NotebookSendReadinessService {
  constructor(
    private readonly db: DatabaseManager,
    private readonly deps: NotebookSendReadinessDeps = {},
  ) {}

  async ensureForSend(input: {
    projectId: string;
    accountId: string;
    packMode: PackMode;
  }): Promise<NotebookSendReadinessResult> {
    healLegacyTranslationNotebookMappings(this.db, input.projectId);

    if (input.packMode === 'local_context') {
      const target = resolvePlaywrightSendTarget(
        this.db,
        input.projectId,
        input.accountId,
        input.packMode,
      );
      if (target.usedWebChatFallback) {
        this.db.knowledgeSyncEvents.insert({
          projectId: input.projectId,
          eventType: 'TRANSLATION_NOTEBOOK_OPENED',
          message: 'Playwright dịch qua Gemini web chat (local_context).',
          metadata: { packMode: input.packMode, reason: target.reason },
        });
      }
      return {
        ok: true,
        needsAssisted: false,
        message: 'Sẵn sàng dịch qua Gemini web chat.',
        notebookUrl: target.notebookUrl,
        notebookRowId: target.notebookRowId,
        mapping: target.mapping,
        usedWebChatFallback: target.usedWebChatFallback,
      };
    }

    let target = resolvePlaywrightSendTarget(
      this.db,
      input.projectId,
      input.accountId,
      input.packMode,
    );

    if (
      target.mapping &&
      PLAYWRIGHT_SEND_READY_STATUSES.has(target.mapping.status)
    ) {
      return {
        ok: true,
        needsAssisted: false,
        message: 'NotebookLM sẵn sàng cho dịch.',
        notebookUrl: target.notebookUrl,
        notebookRowId: target.notebookRowId,
        mapping: target.mapping,
        usedWebChatFallback: false,
      };
    }

    const existing = findAssistedOrPendingMapping(
      this.db,
      input.projectId,
      input.accountId,
    );

    // HR12: story already has a remote NotebookLM binding → resume/reuse only.
    // Use this.db (not global singleton) so unit tests with injected mocks work.
    const { NotebookBindingService } = await import('./notebook-binding-service');
    const storyBound = new NotebookBindingService(this.db).getNotebookForStory(
      input.projectId,
    );
    const mustReuseOnly = Boolean(
      storyBound?.notebookId ?? existing?.notebook_id,
    );

    try {
      let provisionResult: ProvisionNotebookResult;
      if (existing?.status === 'assisted_setup' || mustReuseOnly) {
        const resume =
          this.deps.resumeAssisted ??
          (async (req) => {
            const { getNotebookService } = await import('./notebook-service-singleton');
            return getNotebookService().resumeAssisted(req);
          });
        provisionResult = await resume({
          projectId: input.projectId,
          accountId: input.accountId,
          role: 'SINGLE',
        });
      } else {
        const provision =
          this.deps.provision ??
          (async (req) => {
            const { getNotebookService } = await import('./notebook-service-singleton');
            return getNotebookService().provision(req);
          });
        provisionResult = await provision({
          projectId: input.projectId,
          accountId: input.accountId,
          role: 'SINGLE',
        });
      }

      if (provisionResult.assisted) {
        await this.tryOpenBrowser(input.accountId);
        const afterAssisted = resolvePlaywrightSendTarget(
          this.db,
          input.projectId,
          input.accountId,
          input.packMode,
        );
        const inaccessible = Boolean(provisionResult.bindingInaccessible);
        return {
          ok: false,
          needsAssisted: true,
          bindingInaccessible: inaccessible,
          userMessage: provisionResult.userMessage,
          technicalDetail: provisionResult.technicalDetail ?? null,
          actions: provisionResult.actions,
          message: inaccessible
            ? (provisionResult.userMessage ?? provisionResult.message)
            : provisionResult.message || viMessageAssistedSetup(),
          notebookUrl: afterAssisted.notebookUrl,
          notebookRowId: afterAssisted.notebookRowId,
          mapping: afterAssisted.mapping,
          usedWebChatFallback: afterAssisted.usedWebChatFallback,
        };
      }

      target = resolvePlaywrightSendTarget(
        this.db,
        input.projectId,
        input.accountId,
        input.packMode,
      );
      if (
        target.mapping &&
        PLAYWRIGHT_SEND_READY_STATUSES.has(target.mapping.status)
      ) {
        return {
          ok: true,
          needsAssisted: false,
          message: provisionResult.message || 'NotebookLM đã sẵn sàng.',
          notebookUrl: target.notebookUrl,
          notebookRowId: target.notebookRowId,
          mapping: target.mapping,
          usedWebChatFallback: false,
        };
      }
    } catch (error) {
      logger.warn('NotebookSendReadiness ensureForSend failed', {
        projectId: input.projectId,
        accountId: input.accountId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        ok: false,
        needsAssisted: true,
        message:
          error instanceof Error
            ? `${viMessageAssistedSetup()} (${error.message})`
            : viMessageAssistedSetup(),
        notebookUrl: target.notebookUrl,
        notebookRowId: target.notebookRowId,
        mapping: target.mapping,
        usedWebChatFallback: target.usedWebChatFallback,
      };
    }

    return {
      ok: false,
      needsAssisted: true,
      message: viMessageAssistedSetup(),
      notebookUrl: target.notebookUrl,
      notebookRowId: target.notebookRowId,
      mapping: target.mapping,
      usedWebChatFallback: target.usedWebChatFallback,
    };
  }

  private async tryOpenBrowser(accountId: string): Promise<void> {
    try {
      if (this.deps.openBrowser) {
        await this.deps.openBrowser(accountId, 'notebook');
        return;
      }
      const { getAccountWorkerService } = await import('./account-worker-singleton');
      await getAccountWorkerService().openBrowser(accountId, 'notebook');
    } catch (error) {
      logger.warn('NotebookSendReadiness openBrowser failed', {
        accountId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
