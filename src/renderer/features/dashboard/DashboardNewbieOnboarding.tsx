import { CheckCircle2, Circle } from 'lucide-react';
import { Button, Card } from '../../components/ui';
import { useT } from '../../i18n';
import type { NewbieOnboardingStep } from './resolve-dashboard-home';

export interface DashboardNewbieOnboardingProps {
  steps: NewbieOnboardingStep[];
  onImportOne: () => void;
  onConnectAccount: () => void;
  onStartTranslate: () => void;
}

const LABEL: Record<NewbieOnboardingStep['id'], string> = {
  import: 'dashboard.newbie.stepImport',
  account: 'dashboard.newbie.stepAccount',
  translate: 'dashboard.newbie.stepTranslate',
};

const ACTION_LABEL: Record<NewbieOnboardingStep['id'], string> = {
  import: 'dashboard.newbie.actionImport',
  account: 'dashboard.newbie.actionAccount',
  translate: 'dashboard.newbie.actionTranslate',
};

export function DashboardNewbieOnboarding({
  steps,
  onImportOne,
  onConnectAccount,
  onStartTranslate,
}: DashboardNewbieOnboardingProps) {
  const t = useT();
  const allDone = steps.every((s) => s.done);
  if (allDone) return null;

  const actionFor = (id: NewbieOnboardingStep['id']) => {
    if (id === 'import') return onImportOne;
    if (id === 'account') return onConnectAccount;
    return onStartTranslate;
  };

  return (
    <Card
      as="section"
      className="dashboard-onboarding"
      aria-labelledby="dashboard-newbie-title"
    >
      <h2 id="dashboard-newbie-title" className="dashboard-onboarding__title">
        {t('dashboard.newbie.title')}
      </h2>
      <p className="muted">{t('dashboard.newbie.subtitle')}</p>
      <ol className="onboarding-checklist dashboard-newbie-list">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={
              step.done
                ? 'onboarding-checklist-item onboarding-checklist-item--done'
                : 'onboarding-checklist-item'
            }
          >
            {step.done ? (
              <CheckCircle2 size={18} aria-hidden />
            ) : (
              <Circle size={18} aria-hidden />
            )}
            <span>
              {index + 1}. {t(LABEL[step.id])}
            </span>
            {!step.done ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={actionFor(step.id)}
              >
                {t(ACTION_LABEL[step.id])}
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}
