import type { DatabaseManager } from '../db/database-manager';
import {
  AI_PROVIDER_IDS,
} from '@shared/constants/ai-provider';
import type { AiAutoSetupResult, AiStatusSnapshot } from '@shared/schemas/ai-auto-setup';
import { assessBrowserDependencyHealth } from '../automation/browser-runner/browser-dependency-health';
import { getAccountAvailabilityService } from '../services/account-availability-service';
import { getAccountWorkerService } from '../services/account-worker-singleton';
import type { AiProviderService } from './ai-provider-service';
import {
  applyRecommendedProviderOrder,
  mergeAutoSetupResult,
} from './ai-auto-setup-policy';
import { workerProcessManager } from './worker-process-manager';

export class AiAutoSetupService {
  constructor(
    private readonly db: DatabaseManager,
    private readonly ai: AiProviderService,
  ) {}

  statusSnapshot(): AiStatusSnapshot {
    const availabilitySvc = getAccountAvailabilityService(this.db);
    const summary = availabilitySvc.summarize();
    const resolved = availabilitySvc.resolveAll();
    const accounts = getAccountWorkerService().listAccounts();
    const active = accounts.filter((a) => {
      const av = resolved.get(a.id);
      return av && av.availability !== 'PAUSED';
    });
    const usableCount = active.filter((a) => resolved.get(a.id)?.usableForNewJob).length;

    const list = this.ai.listProviders();
    const webApiReady =
      list.providers.find((p) => p.id === AI_PROVIDER_IDS.GEMINI_WEB_API)?.status === 'READY';
    const browserReady =
      list.providers.find((p) => p.id === AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI)?.status === 'READY';
    const geminiOk = webApiReady || browserReady || summary.ready > 0;

    const ready = usableCount > 0 && geminiOk;

    return {
      ready,
      usableAccountCount: usableCount,
      geminiOk,
      statusLine: ready ? 'Sẵn sàng' : summary.ready > 0 ? 'Cần kiểm tra' : 'Chưa sẵn sàng',
      detailLine: ready
        ? 'Gemini hoạt động bình thường'
        : usableCount === 0
          ? 'Chưa có tài khoản Google sẵn sàng'
          : null,
    };
  }

  async run(): Promise<AiAutoSetupResult> {
    const steps: AiAutoSetupResult['steps'] = [];
    const technical: NonNullable<AiAutoSetupResult['technical']> = {};

    const availabilitySvc = getAccountAvailabilityService(this.db);
    const resolved = availabilitySvc.resolveAll();
    const accounts = getAccountWorkerService().listAccounts();
    const activeAccounts = accounts.filter((a) => {
      const av = resolved.get(a.id);
      return av && av.availability !== 'PAUSED';
    });
    const usableAccounts = activeAccounts.filter((a) => resolved.get(a.id)?.usableForNewJob);
    const needsLogin = activeAccounts.some(
      (a) => resolved.get(a.id)?.availability === 'LOGIN_REQUIRED',
    );

    steps.push({
      id: 'google_accounts',
      ok: usableAccounts.length > 0,
      message:
        usableAccounts.length > 0
          ? `${usableAccounts.length} tài khoản có thể sử dụng`
          : activeAccounts.length > 0
            ? 'Tài khoản cần đăng nhập lại'
            : 'Chưa có tài khoản Google',
    });

    if (usableAccounts.length === 0) {
      return mergeAutoSetupResult(steps, technical, {
        usableAccountCount: 0,
        needsLogin,
        hasAnyAccount: activeAccounts.length > 0,
        geminiOk: false,
        workerOk: false,
      });
    }

    const browser = assessBrowserDependencyHealth('AUTO');
    technical.browserUsable = browser.browserUsable;
    technical.browserEngine = browser.preferredEngine;
    steps.push({
      id: 'browser_engine',
      ok: browser.browserUsable,
      message: browser.message,
    });

    let workerOk = false;
    let install = workerProcessManager.detectInstall();
    technical.workerInstalled = install.ok;
    if (!install.ok) {
      install = await workerProcessManager.install();
      steps.push({
        id: 'worker_install',
        ok: install.ok,
        message: install.message,
      });
    } else {
      steps.push({
        id: 'worker_runtime',
        ok: true,
        message: 'Worker đã cài',
      });
    }

    if (install.ok) {
      try {
        await workerProcessManager.ensureStarted();
        workerOk = workerProcessManager.isRunning();
        steps.push({
          id: 'worker_start',
          ok: workerOk,
          message: workerOk ? 'Worker đang chạy' : 'Worker chưa khởi động',
        });
      } catch (error) {
        steps.push({
          id: 'worker_start',
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    applyRecommendedProviderOrder(this.ai);
    steps.push({
      id: 'provider_order',
      ok: true,
      message: 'Đã áp dụng cấu hình nhà cung cấp khuyên dùng',
    });

    steps.push({
      id: 'fallback',
      ok: true,
      message: 'Tự động dùng phương án dự phòng khi cần',
    });

    let geminiOk = false;
    for (const providerId of [
      AI_PROVIDER_IDS.GEMINI_WEB_API,
      AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
    ]) {
      try {
        const check = await this.ai.checkProvider(providerId);
        technical[`provider_${providerId}`] = check.status;
        if (check.ok) geminiOk = true;
        steps.push({
          id: `health_${providerId}`,
          ok: check.ok,
          message: check.message,
        });
      } catch (error) {
        steps.push({
          id: `health_${providerId}`,
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const health = await this.ai.healthReport();
    const webApi = health.providers.find((p) => p.id === AI_PROVIDER_IDS.GEMINI_WEB_API);
    if (webApi) {
      technical.webApiStatus = webApi.status;
      if (webApi.ok) geminiOk = true;
    }

    return mergeAutoSetupResult(steps, technical, {
      usableAccountCount: usableAccounts.length,
      needsLogin,
      hasAnyAccount: activeAccounts.length > 0,
      geminiOk,
      workerOk,
    });
  }
}
