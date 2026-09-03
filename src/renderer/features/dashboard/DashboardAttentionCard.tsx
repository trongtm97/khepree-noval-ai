import { useNavigate } from 'react-router-dom';
import { Button, Card } from '../../components/ui';
import { useT } from '../../i18n';
import type { AttentionSummary } from './resolve-dashboard-home';

export interface DashboardAttentionCardProps {
  attention: AttentionSummary;
}

export function DashboardAttentionCard({ attention }: DashboardAttentionCardProps) {
  const t = useT();
  const navigate = useNavigate();
  if (attention.openCount <= 0) return null;

  return (
    <section aria-labelledby="dashboard-attention-heading">
      <h2 id="dashboard-attention-heading" className="dashboard-section-title">
        {t('dashboard.attentionTitle')}
      </h2>
      <Card className="dashboard-home-card dashboard-home-card--attention">
        <div className="dashboard-home-card__row">
          <div>
            <strong>
              {t('dashboard.attentionCount', { n: String(attention.openCount) })}
            </strong>
            {attention.nextTitle ? (
              <p className="muted">
                {t('dashboard.attentionNext')}: {attention.nextTitle}
              </p>
            ) : null}
          </div>
          <Button
            size="sm"
            onClick={() => {
              navigate('/jobs?tab=attention');
            }}
          >
            {t('dashboard.attentionAction')}
          </Button>
        </div>
      </Card>
    </section>
  );
}
