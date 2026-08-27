import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle } from 'lucide-react';
import { useT } from '../i18n';
import { Button, Card, SectionHeader } from '../components/ui';
import { useUiShellStore } from '../stores/ui-shell-store';

export interface OnboardingChecklistItem {
  id: string;
  label: string;
  done: boolean;
  actionLabel?: string;
  actionTo?: string;
}

/** Real-state first-run checklist (no fake/static checks). */
export function useOnboardingChecklist(): {
  items: OnboardingChecklistItem[];
  loading: boolean;
  error: string | null;
  allDone: boolean;
  refresh: () => void;
} {
  const tr = useT();
  const currentProjectId = useUiShellStore((s) => s.currentProjectId);
  const [items, setItems] = useState<OnboardingChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadChecklist = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accountsRes, projectsRes, setupRes, jobsRes] = await Promise.all([
        window.novelTrans.accounts.list(),
        window.novelTrans.projects.list(),
        window.novelTrans.setup.getStatus(),
        window.novelTrans.jobs.list(undefined),
      ]);

      const accounts = accountsRes.accounts;
      const projects = projectsRes.projects;
      const hasAccount = accounts.length > 0;
      const geminiReady = accounts.some((a) => a.status === 'READY' && a.workerEnabled);
      const hasProject = projects.length > 0;
      const notebookReady = setupRes.notebookReadyCount > 0;
      const hasCompletedJob = jobsRes.jobs.some((j) => j.state === 'COMPLETED');
      const firstProjectId = projects[0]?.id ?? currentProjectId;

      setItems([
        {
          id: 'account',
          label: tr('dashboard.check.hasAccount'),
          done: hasAccount,
          actionLabel: tr('dashboard.check.actionAccount'),
          actionTo: '/accounts',
        },
        {
          id: 'gemini',
          label: tr('dashboard.check.geminiReady'),
          done: geminiReady,
          actionLabel: tr('dashboard.check.actionAccount'),
          actionTo: '/accounts',
        },
        {
          id: 'project',
          label: tr('dashboard.check.hasProject'),
          done: hasProject,
          actionLabel: tr('dashboard.check.actionProject'),
          actionTo: '/projects',
        },
        {
          id: 'aiMemory',
          label: tr('dashboard.check.aiMemory'),
          done: notebookReady,
          actionLabel: tr('dashboard.check.actionAiMemory'),
          actionTo: firstProjectId
            ? `/projects/${firstProjectId}/ai-memory`
            : '/projects',
        },
        {
          id: 'firstTranslation',
          label: tr('dashboard.check.firstTranslation'),
          done: hasCompletedJob,
          actionLabel: tr('dashboard.check.actionTranslate'),
          actionTo: firstProjectId
            ? `/projects/${firstProjectId}/translate`
            : '/projects',
        },
      ]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : tr('dashboard.checkError'));
    } finally {
      setLoading(false);
    }
  }, [tr, currentProjectId]);

  const refresh = useCallback(() => {
    void loadChecklist();
  }, [loadChecklist]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const allDone = items.length > 0 && items.every((i) => i.done);

  return { items, loading, error, allDone, refresh };
}

export function OnboardingChecklistPanel() {
  const t = useT();
  const navigate = useNavigate();
  const { items, loading, error, allDone, refresh } = useOnboardingChecklist();

  if (allDone && !loading) {
    return null;
  }

  return (
    <Card as="section" style={{ marginBottom: '1.5rem' }}>
      <SectionHeader title={t('dashboard.checklistTitle')} />
      {loading ? <p className="muted">{t('common.loading')}</p> : null}
      {error ? (
        <div className="btn-row">
          <p className="error-text">{error}</p>
          <Button size="sm" onClick={refresh}>
            {t('app.tryAgain')}
          </Button>
        </div>
      ) : null}
      {!loading && !error ? (
        <ul className="onboarding-checklist" aria-label={t('dashboard.checklistTitle')}>
          {items.map((item) => (
            <li
              key={item.id}
              className={
                item.done
                  ? 'onboarding-checklist-item onboarding-checklist-item--done'
                  : 'onboarding-checklist-item'
              }
            >
              {item.done ? (
                <CheckCircle2 size={18} aria-hidden />
              ) : (
                <Circle size={18} aria-hidden />
              )}
              <span>{item.label}</span>
              {!item.done && item.actionLabel && item.actionTo ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (item.actionTo) navigate(item.actionTo);
                  }}
                >
                  {item.actionLabel}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
