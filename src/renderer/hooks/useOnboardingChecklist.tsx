import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle } from 'lucide-react';
import { useT } from '../i18n';
import { Button, Card, SectionHeader } from '../components/ui';
import { useUiShellStore } from '../stores/ui-shell-store';
import {
  resolveOnboardingSteps,
  type OnboardingStep,
} from '../features/dashboard/dashboard-readiness';

export interface OnboardingChecklistItem {
  id: string;
  label: string;
  done: boolean;
  actionLabel?: string;
  actionTo?: string;
}

const STEP_TO_ITEM: Record<
  OnboardingStep['id'],
  { labelKey: string; actionKey: string; route: (projectId: string | null) => string }
> = {
  ai: {
    labelKey: 'dashboard.check.aiReady',
    actionKey: 'dashboard.check.actionAccount',
    route: () => '/accounts',
  },
  project: {
    labelKey: 'dashboard.check.hasProject',
    actionKey: 'dashboard.check.actionProject',
    route: () => '/projects',
  },
  source: {
    labelKey: 'dashboard.check.hasSource',
    actionKey: 'dashboard.check.actionSource',
    route: (projectId) =>
      projectId ? `/projects/${projectId}/chapters` : '/projects',
  },
  translation: {
    labelKey: 'dashboard.check.firstTranslation',
    actionKey: 'dashboard.check.actionTranslate',
    route: (projectId) =>
      projectId ? `/projects/${projectId}/translate` : '/projects',
  },
};

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
      const [accountsRes, projectsRes, jobsRes] = await Promise.all([
        window.novelTrans.accounts.list(),
        window.novelTrans.projects.list(),
        window.novelTrans.jobs.list(undefined),
      ]);

      const projects = projectsRes.projects;
      const hasCompletedJob = jobsRes.jobs.some(
        (j) => j.state === 'COMPLETED' || j.state === 'ACCEPTED_WITH_WARNINGS',
      );
      const priorityProject = projects.find((p) => p.status !== 'archived') ?? null;
      const steps = resolveOnboardingSteps({
        projects,
        accounts: accountsRes.accounts,
        hasCompletedJob,
        priorityProject,
      });

      setItems(
        steps.map((step) => {
          const meta = STEP_TO_ITEM[step.id];
          return {
            id: step.id,
            label: tr(meta.labelKey),
            done: step.done,
            actionLabel: tr(meta.actionKey),
            actionTo: meta.route(currentProjectId ?? priorityProject?.id ?? null),
          };
        }),
      );
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
    <Card as="section" className="dashboard-onboarding">
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
