import { useNavigate } from 'react-router-dom';
import { Button, Card } from '../../components/ui';
import { useT } from '../../i18n';
import {
  accountLaneLabelKey,
  type SimpleAccountStatus,
} from './resolve-dashboard-home';

export interface DashboardAccountStatusProps {
  lanes: SimpleAccountStatus[];
  hasReady: boolean;
}

const LANE_ICON: Record<SimpleAccountStatus['lane'], string> = {
  ready: '●',
  running: '▶',
  needsLogin: '!',
  resting: '○',
};

export function DashboardAccountStatus({
  lanes,
  hasReady,
}: DashboardAccountStatusProps) {
  const t = useT();
  const navigate = useNavigate();

  return (
    <section aria-labelledby="dashboard-accounts-heading">
      <h2 id="dashboard-accounts-heading" className="dashboard-section-title">
        {t('dashboard.accountsTitle')}
      </h2>
      {!hasReady ? (
        <Card className="dashboard-home-card dashboard-home-card--warn">
          <div className="dashboard-home-card__row">
            <div>
              <strong>{t('dashboard.noReadyAccountTitle')}</strong>
              <p className="muted">{t('dashboard.noReadyAccountBody')}</p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                navigate('/accounts');
              }}
            >
              {t('dashboard.noReadyAccountAction')}
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="dashboard-home-card">
          <ul className="dashboard-account-lanes" aria-label={t('dashboard.accountsTitle')}>
            {lanes.map((row) => (
              <li key={row.lane} className="dashboard-account-lanes__item">
                <span aria-hidden>{LANE_ICON[row.lane]}</span>
                <span>
                  {t(accountLaneLabelKey(row.lane))} · {row.count}
                </span>
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              navigate('/accounts');
            }}
          >
            {t('dashboard.manageAccounts')}
          </Button>
        </Card>
      )}
    </section>
  );
}
