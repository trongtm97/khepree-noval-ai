import { useNavigate } from 'react-router-dom';
import { CircleAlert } from 'lucide-react';
import { Button, Card, SectionHeader } from '../../components/ui';
import { useT } from '../../i18n';
import type { DashboardActionItem } from './resolve-dashboard-actions';

export interface ActionRequiredSectionProps {
  actions: DashboardActionItem[];
}

export function ActionRequiredSection({ actions }: ActionRequiredSectionProps) {
  const t = useT();
  const navigate = useNavigate();

  if (actions.length === 0) return null;

  return (
    <section className="dashboard-section" aria-labelledby="dashboard-actions-heading">
      <SectionHeader id="dashboard-actions-heading" title={t('dashboard.actionRequired')} />
      <ul className="dashboard-action-list">
        {actions.map((action) => (
          <li key={action.id}>
            <Card className={`dashboard-action-card dashboard-action-card--${action.severity.toLowerCase()}`}>
              <div className="dashboard-action-card__row">
                <CircleAlert size={18} aria-hidden className="dashboard-action-card__icon" />
                <span className="dashboard-action-card__message">
                  {action.messageParams
                    ? t(action.messageKey, action.messageParams)
                    : t(action.messageKey)}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    navigate(action.route);
                  }}
                >
                  {t(action.actionKey)}
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
