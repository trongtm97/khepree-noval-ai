import { useCallback, useEffect, useRef, useState } from 'react';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import { useNotificationStore } from '../stores/notification-store';
import { t } from '../i18n';
import {
  evaluateStartupAiReadiness,
  STARTUP_AI_NOTIFY_ID,
  type StartupAiIssue,
  type StartupAiReadinessResult,
} from '../utils/startup-ai-readiness';

export interface StartupAiReadinessState {
  checking: boolean;
  result: StartupAiReadinessResult | null;
  title: string | null;
  description: string | null;
  refresh: () => Promise<void>;
  dismiss: () => void;
  dismissed: boolean;
}

function issueTitle(issues: StartupAiIssue[]): string {
  if (issues.includes('check_failed')) {
    return t('notifications.startupAiNotReady');
  }
  if (issues.includes('google_needs_login') || issues.includes('no_google_account')) {
    if (issues.includes('web_api_not_ready') || issues.includes('no_ai_provider')) {
      return t('notifications.startupAiNotReady');
    }
    return t('notifications.startupGoogleNotReady');
  }
  return t('notifications.startupProvidersNotReady');
}

function issueBody(issues: StartupAiIssue[], detail: string | null): string {
  const parts: string[] = [];
  if (issues.includes('check_failed')) {
    parts.push(t('notifications.startupCheckFailedBody'));
    if (detail) parts.push(detail);
    return parts.join(' ');
  }
  if (issues.includes('no_ai_account')) {
    parts.push(t('notifications.startupNoAiAccountBody'));
  } else if (issues.includes('no_google_account')) {
    parts.push(t('notifications.startupNoGoogleBody'));
  } else if (issues.includes('google_needs_login')) {
    parts.push(t('notifications.startupGoogleLoginBody'));
  }
  if (issues.includes('no_ai_provider')) {
    parts.push(t('notifications.startupNoProviderBody'));
  } else if (issues.includes('web_api_not_ready')) {
    parts.push(t('notifications.startupWebApiBody'));
  }
  if (detail) {
    parts.push(detail);
  }
  return parts.join(' ');
}

function settledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null;
}

/**
 * On shell mount: health-check Google + Web API provider and toast if not READY.
 * Re-runs periodically so orphan-worker / login expiry surfaces without clicking Translate.
 */
export function useStartupAiReadiness(intervalMs = 60_000): StartupAiReadinessState {
  const add = useNotificationStore((s) => s.add);
  const remove = useNotificationStore((s) => s.remove);
  const [checking, setChecking] = useState(true);
  const [result, setResult] = useState<StartupAiReadinessResult | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const cancelledRef = useRef(false);
  /** null = never checked; true/false = last known ok. */
  const wasOkRef = useRef<boolean | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [accountsSettled, healthSettled, listSettled, aiAccSettled, chatGptAccSettled, metaAccSettled] =
        await Promise.allSettled([
          window.khepreeNovelAI.accounts.list(),
          window.khepreeNovelAI.aiProviders.health(),
          window.khepreeNovelAI.aiProviders.list(),
          window.khepreeNovelAI.aiAccounts.list({
            providerId: AI_PROVIDER_IDS.GEMINI_WEB_API,
          }),
          window.khepreeNovelAI.aiAccounts.list({
            providerId: AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
          }),
          window.khepreeNovelAI.aiAccounts.list({
            providerId: AI_PROVIDER_IDS.PLAYWRIGHT_META_AI,
          }),
        ]);

      if (cancelledRef.current) return;

      const accountsRes = settledValue(accountsSettled);
      const healthRes = settledValue(healthSettled);
      const listRes = settledValue(listSettled);
      const aiAccRes = settledValue(aiAccSettled);
      const chatGptAccRes = settledValue(chatGptAccSettled);
      const metaAccRes = settledValue(metaAccSettled);

      const browserAiAccounts = [
        ...(chatGptAccRes?.accounts ?? []),
        ...(metaAccRes?.accounts ?? []),
      ];
      const browserAiReady = browserAiAccounts.some((a) => a.status === 'READY');

      const ipcFailed =
        !accountsRes && !healthRes && !listRes && !aiAccRes;
      const listOrHealthMissing = !listRes && !healthRes;

      if (ipcFailed || listOrHealthMissing) {
        const detail = [accountsSettled, healthSettled, listSettled, aiAccSettled]
          .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
          .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)))
          .filter(Boolean)
          .slice(0, 2)
          .join(' ');
        const next = {
          ok: false as const,
          issues: ['check_failed'] as StartupAiIssue[],
          detail: detail || null,
        };
        setResult(next);
        setChecking(false);
        const nextTitle = issueTitle(next.issues);
        const nextBody = issueBody(next.issues, next.detail);
        setTitle(nextTitle);
        setDescription(nextBody);
        const toast = wasOkRef.current !== false;
        remove(STARTUP_AI_NOTIFY_ID);
        add({
          id: STARTUP_AI_NOTIFY_ID,
          kind: 'ACTION_REQUIRED',
          title: nextTitle,
          description: nextBody,
          toast,
        });
        if (toast) setDismissed(false);
        wasOkRef.current = false;
        return;
      }

      const webApiHealth =
        healthRes?.providers.find((p) => p.id === AI_PROVIDER_IDS.GEMINI_WEB_API) ??
        healthRes?.providers.find((p) => p.type === 'GEMINI_WEB_API') ??
        null;

      const next = evaluateStartupAiReadiness({
        googleAccounts: (accountsRes?.accounts ?? []).map((a) => ({
          availability: a.availability,
        })),
        webApiHealth: webApiHealth
          ? {
              ok: webApiHealth.ok,
              status: webApiHealth.status,
              message: webApiHealth.message,
            }
          : null,
        webApiAccounts: (aiAccRes?.accounts ?? []).map((a) => ({ status: a.status })),
        workerRunning: listRes?.workerRunning ?? false,
        hasEnabledProvider:
          listRes?.providers.some((p) => p.enabled) ??
          (healthRes?.providers.length ?? 0) > 0,
        providerRows: (listRes?.providers ?? []).map((p) => ({
          id: p.id,
          status: p.status,
          enabled: p.enabled,
        })),
        primaryProviderId: listRes?.primaryProviderId ?? null,
        fallbackEnabled: listRes?.fallbackEnabled ?? true,
        browserAiReady,
      });

      setResult(next);
      setChecking(false);

      if (next.ok) {
        remove(STARTUP_AI_NOTIFY_ID);
        setTitle(null);
        setDescription(null);
        setDismissed(false);
        wasOkRef.current = true;
        return;
      }

      const nextTitle = issueTitle(next.issues);
      const nextBody = issueBody(next.issues, next.detail);
      setTitle(nextTitle);
      setDescription(nextBody);

      const toast = wasOkRef.current !== false;
      remove(STARTUP_AI_NOTIFY_ID);
      add({
        id: STARTUP_AI_NOTIFY_ID,
        kind: 'ACTION_REQUIRED',
        title: nextTitle,
        description: nextBody,
        toast,
      });
      if (toast) setDismissed(false);
      wasOkRef.current = false;
    } catch (error) {
      if (cancelledRef.current) return;
      const detail = error instanceof Error ? error.message : String(error);
      setResult({ ok: false, issues: ['check_failed'], detail });
      const nextTitle = t('notifications.startupAiNotReady');
      const nextBody = issueBody(['check_failed'], detail);
      setTitle(nextTitle);
      setDescription(nextBody);
      setChecking(false);
      const toast = wasOkRef.current !== false;
      remove(STARTUP_AI_NOTIFY_ID);
      add({
        id: STARTUP_AI_NOTIFY_ID,
        kind: 'ACTION_REQUIRED',
        title: nextTitle,
        description: nextBody,
        toast,
      });
      if (toast) setDismissed(false);
      wasOkRef.current = false;
    }
  }, [add, remove]);

  useEffect(() => {
    cancelledRef.current = false;
    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, intervalMs);
    return () => {
      cancelledRef.current = true;
      window.clearInterval(id);
    };
  }, [refresh, intervalMs]);

  return {
    checking,
    result,
    title,
    description,
    refresh,
    dismiss: () => {
      setDismissed(true);
      remove(STARTUP_AI_NOTIFY_ID);
    },
    dismissed,
  };
}
