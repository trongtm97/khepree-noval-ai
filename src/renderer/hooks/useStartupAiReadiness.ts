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
  if (issues.includes('no_google_account')) {
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
      const [accountsRes, healthRes, listRes, aiAccRes] = await Promise.all([
        window.novelTrans.accounts.list(),
        window.novelTrans.aiProviders.health(),
        window.novelTrans.aiProviders.list(),
        window.novelTrans.aiAccounts.list({
          providerId: AI_PROVIDER_IDS.GEMINI_WEB_API,
        }),
      ]);

      if (cancelledRef.current) return;

      const webApiHealth =
        healthRes.providers.find((p) => p.id === AI_PROVIDER_IDS.GEMINI_WEB_API) ??
        healthRes.providers.find((p) => p.type === 'GEMINI_WEB_API') ??
        null;

      const next = evaluateStartupAiReadiness({
        googleAccounts: accountsRes.accounts.map((a) => ({
          status: a.status,
          workerEnabled: a.workerEnabled,
        })),
        webApiHealth: webApiHealth
          ? {
              ok: webApiHealth.ok,
              status: webApiHealth.status,
              message: webApiHealth.message,
            }
          : null,
        webApiAccounts: aiAccRes.accounts.map((a) => ({ status: a.status })),
        workerRunning: listRes.workerRunning,
        hasEnabledProvider: listRes.providers.some((p) => p.enabled),
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
    } catch {
      if (cancelledRef.current) return;
      setResult({ ok: false, issues: ['no_ai_provider'], detail: null });
      const nextTitle = t('notifications.startupAiNotReady');
      const nextBody = t('notifications.startupCheckFailedBody');
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
