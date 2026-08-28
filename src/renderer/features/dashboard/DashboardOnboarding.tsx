import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle } from 'lucide-react';
import { Button, Card } from '../../components/ui';
import { useT } from '../../i18n';
import { useUiShellStore } from '../../stores/ui-shell-store';
import { resolveOnboardingSteps, type OnboardingStep } from './dashboard-readiness';

export interface DashboardOnboardingProps {
  steps: OnboardingStep[];
  loading?: boolean;
  showReadyBanner?: boolean;
  onDismissReady?: () => void;
}

const STEP_LABEL: Record<OnboardingStep['id'], string> = {
  ai: 'dashboard.check.aiReady',
  project: 'dashboard.check.hasProject',
  source: 'dashboard.check.hasSource',
  translation: 'dashboard.check.firstTranslation',
};

const STEP_ACTION: Record<
  OnboardingStep['id'],
  { labelKey: string; route: string | ((projectId: string | null) => string) }
> = {
  ai: { labelKey: 'dashboard.check.actionAccount', route: '/accounts' },
  project: { labelKey: 'dashboard.check.actionProject', route: '/projects' },
  source: {
    labelKey: 'dashboard.check.actionSource',
    route: (projectId) =>
      projectId ? `/projects/${projectId}/chapters` : '/projects',
  },
  translation: {
    labelKey: 'dashboard.check.actionTranslate',
    route: (projectId) =>
      projectId ? `/projects/${projectId}/translate` : '/projects',
  },
};

export function DashboardOnboarding({
  steps,
  loading,
  showReadyBanner,
  onDismissReady,
}: DashboardOnboardingProps) {
  const t = useT();
  const navigate = useNavigate();
  const currentProjectId = useUiShellStore((s) => s.currentProjectId);

  const allDone = steps.length > 0 && steps.every((s) => s.done);

  if (showReadyBanner) {
    return (
      <div className="dashboard-ready-banner" role="status">
        <CheckCircle2 size={18} aria-hidden />
        <span>{t('dashboard.readyMessage')}</span>
        {onDismissReady ? (
          <Button size="sm" variant="ghost" onClick={onDismissReady}>
            {t('actions.close')}
          </Button>
        ) : null}
      </div>
    );
  }

  if (allDone || loading) return null;

  return (
    <Card as="section" className="dashboard-onboarding" aria-labelledby="dashboard-onboarding-title">
      <h2 id="dashboard-onboarding-title" className="dashboard-onboarding__title">
        {t('dashboard.checklistTitle')}
      </h2>
      <ul className="onboarding-checklist">
        {steps.map((step) => {
          const action = STEP_ACTION[step.id];
          const route =
            typeof action.route === 'function'
              ? action.route(currentProjectId)
              : action.route;
          return (
            <li
              key={step.id}
              className={
                step.done
                  ? 'onboarding-checklist-item onboarding-checklist-item--done'
                  : 'onboarding-checklist-item'
              }
            >
              {step.done ? <CheckCircle2 size={18} aria-hidden /> : <Circle size={18} aria-hidden />}
              <span>{t(STEP_LABEL[step.id])}</span>
              {!step.done ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    navigate(route);
                  }}
                >
                  {t(action.labelKey)}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function useDashboardOnboardingSteps(
  readinessInput: Parameters<typeof resolveOnboardingSteps>[0],
): OnboardingStep[] {
  return resolveOnboardingSteps(readinessInput);
}
