import type { DatabaseManager } from '../db/database-manager';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import type { AiAutoSetupResult, AiStatusSnapshot } from '@shared/schemas/ai-auto-setup';
import type { AiProviderPreference } from '@shared/constants/ai-preference';
import { AI_PROVIDER_PREFERENCES } from '@shared/constants/ai-preference';
import { assessBrowserDependencyHealth } from '../automation/browser-runner/browser-dependency-health';
import { getAccountAvailabilityService } from '../services/account-availability-service';
import { getAccountWorkerService } from '../services/account-worker-singleton';
import type { AiProviderService } from './ai-provider-service';
import {
  applyRecommendedProviderOrder,
  mergeAutoSetupResult,
} from './ai-auto-setup-policy';
import { readAiPreference } from './ai-preference-policy';
import { workerProcessManager } from './worker-process-manager';

function countBrowserAiAccounts(
  db: DatabaseManager,
  providerId: string,
): { total: number; ready: number; needsLogin: boolean } {
  const accounts = db.aiAccounts.listByProvider(providerId);
  const ready = accounts.filter((a) => a.status === 'READY').length;
  const needsLogin = accounts.some((a) => a.status === 'LOGIN_REQUIRED');
  return { total: accounts.length, ready, needsLogin };
}

export class AiAutoSetupService {
  constructor(
    private readonly db: DatabaseManager,
    private readonly ai: AiProviderService,
  ) {}

  statusSnapshot(): AiStatusSnapshot {
    const preference = readAiPreference(this.db);
    const groupReady = this.ai.getGroupAccountReadiness();
    const providers = this.ai.listProviders().providers;

    const providerHealth = AI_PROVIDER_PREFERENCES.map((kind) => {
      const accountCount =
        kind === 'GEMINI'
          ? getAccountWorkerService().listAccounts().length
          : countBrowserAiAccounts(
              this.db,
              kind === 'CHATGPT'
                ? AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT
                : AI_PROVIDER_IDS.PLAYWRIGHT_META_AI,
            ).total;

      const row = providers.find((p) => {
        if (kind === 'GEMINI') {
          return (
            p.id === AI_PROVIDER_IDS.GEMINI_WEB_API ||
            p.id === AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI
          );
        }
        if (kind === 'CHATGPT') return p.id === AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT;
        return p.id === AI_PROVIDER_IDS.PLAYWRIGHT_META_AI;
      });

      const ok = groupReady[kind] && (row?.status === 'READY' || groupReady[kind]);
      return {
        preference: kind,
        ok: Boolean(ok && row?.enabled !== false),
        accountCount,
      };
    });

    let loginRequired: AiProviderPreference | null = null;
    const availabilitySvc = getAccountAvailabilityService(this.db);
    const resolved = availabilitySvc.resolveAll();
    const googleNeedsLogin = [...resolved.values()].some(
      (av) => av.availability === 'LOGIN_REQUIRED',
    );
    if (googleNeedsLogin) loginRequired = 'GEMINI';
    if (!loginRequired) {
      if (
        countBrowserAiAccounts(this.db, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT).needsLogin
      ) {
        loginRequired = 'CHATGPT';
      } else if (
        countBrowserAiAccounts(this.db, AI_PROVIDER_IDS.PLAYWRIGHT_META_AI).needsLogin
      ) {
        loginRequired = 'META_AI';
      }
    }

    const ready = providerHealth.some((p) => p.ok) && !loginRequired;
    const usableAccountCount = providerHealth.reduce((n, p) => n + p.accountCount, 0);

    return {
      ready,
      usableAccountCount,
      aiPreference: preference,
      providerHealth,
      loginRequired,
      geminiOk: groupReady.GEMINI,
    };
  }

  async run(): Promise<AiAutoSetupResult> {
    const steps: AiAutoSetupResult['steps'] = [];
    const technical: NonNullable<AiAutoSetupResult['technical']> = {};
    const preference = readAiPreference(this.db);
    const groupReady = this.ai.getGroupAccountReadiness();

    const availabilitySvc = getAccountAvailabilityService(this.db);
    const resolved = availabilitySvc.resolveAll();
    const googleAccounts = getAccountWorkerService().listAccounts();
    const chatgptCounts = countBrowserAiAccounts(
      this.db,
      AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
    );
    const metaCounts = countBrowserAiAccounts(this.db, AI_PROVIDER_IDS.PLAYWRIGHT_META_AI);

    const anyAccount =
      googleAccounts.length > 0 || chatgptCounts.total > 0 || metaCounts.total > 0;

    let needsLogin: AiProviderPreference | null = null;
    if ([...resolved.values()].some((av) => av.availability === 'LOGIN_REQUIRED')) {
      needsLogin = 'GEMINI';
    } else if (chatgptCounts.needsLogin) {
      needsLogin = 'CHATGPT';
    } else if (metaCounts.needsLogin) {
      needsLogin = 'META_AI';
    }

    steps.push({
      id: 'ai_accounts',
      ok: anyAccount,
      message: anyAccount ? 'Đã có tài khoản AI' : 'Chưa có tài khoản AI',
    });

    if (!anyAccount) {
      return mergeAutoSetupResult(steps, technical, {
        preference,
        providerReady: groupReady,
        anyAccount: false,
        usableAccountCount: 0,
        needsLogin: null,
        workerOk: false,
        anyProviderOk: false,
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
      steps.push({ id: 'worker_runtime', ok: true, message: 'Worker đã cài' });
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

    this.ai.setFallback(true);
    steps.push({
      id: 'fallback',
      ok: true,
      message: 'Tự động dùng phương án dự phòng khi cần',
    });

    let anyProviderOk = false;
    for (const providerId of [
      AI_PROVIDER_IDS.GEMINI_WEB_API,
      AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
      AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
      AI_PROVIDER_IDS.PLAYWRIGHT_META_AI,
    ]) {
      try {
        const check = await this.ai.checkProvider(providerId);
        technical[`provider_${providerId}`] = check.status;
        if (check.ok) anyProviderOk = true;
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

    const usableAccountCount =
      googleAccounts.length + chatgptCounts.ready + metaCounts.ready;

    return mergeAutoSetupResult(steps, technical, {
      preference,
      providerReady: groupReady,
      anyAccount,
      usableAccountCount,
      needsLogin,
      workerOk,
      anyProviderOk,
    });
  }
}
