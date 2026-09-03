import { useNavigate } from 'react-router-dom';
import { Button, Card } from '../../components/ui';
import { useT } from '../../i18n';
import type { ActiveCampaignSummary } from './resolve-dashboard-home';
import { formatEtaMinutes } from '../production/CampaignListCard';

export interface DashboardActiveCampaignProps {
  campaign: ActiveCampaignSummary;
}

export function DashboardActiveCampaign({ campaign }: DashboardActiveCampaignProps) {
  const t = useT();
  const navigate = useNavigate();
  const eta = campaign.showEta
    ? formatEtaMinutes(
        campaign.estimatedMinutesMin,
        campaign.estimatedMinutesMax,
        t,
      )
    : null;

  return (
    <section aria-labelledby="dashboard-campaign-heading">
      <h2 id="dashboard-campaign-heading" className="dashboard-section-title">
        {t('dashboard.activeCampaignTitle')}
      </h2>
      <Card className="dashboard-home-card">
        <div className="dashboard-home-card__row">
          <div>
            <strong>{campaign.title}</strong>
            <p className="muted">
              {t(`production.status.${campaign.status}`, {}) !==
              `production.status.${campaign.status}`
                ? t(`production.status.${campaign.status}`)
                : campaign.status}
              {' · '}
              {campaign.progressPercent}%
              {campaign.currentNovelTitle
                ? ` · ${t('dashboard.activeCampaignCurrent', {
                    title: campaign.currentNovelTitle,
                  })}`
                : ''}
              {eta ? (
                <>
                  {' · '}
                  <span title={t('production.etaEstimateHint')}>
                    {t('production.etaEstimateLabel')}: {eta}
                  </span>
                </>
              ) : null}
            </p>
            <div
              className="production-progress"
              role="progressbar"
              aria-valuenow={campaign.progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="production-progress__bar"
                style={{ width: `${campaign.progressPercent}%` }}
              />
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => {
              navigate(`/jobs/campaigns/${campaign.campaignId}`);
            }}
          >
            {t('dashboard.openCampaign')}
          </Button>
        </div>
      </Card>
    </section>
  );
}
