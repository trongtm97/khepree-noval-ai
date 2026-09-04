import type { CampaignListItemDto } from '@shared/schemas/translation-campaign';
import { shouldShowCampaignEta } from '@shared/utils/campaign-production';
import { Button, Card } from '../../components/ui';
import { useT } from '../../i18n';

export interface CampaignListCardProps {
  item: CampaignListItemDto;
  onOpen: (campaignId: string) => void;
}

function statusIcon(status: string): string {
  switch (status) {
    case 'RUNNING':
    case 'STARTING':
      return '▶';
    case 'PAUSED':
      return '⏸';
    case 'COMPLETED':
      return '✓';
    case 'CANCELLED':
      return '■';
    case 'FAILED':
    case 'PARTIAL_FAILED':
      return '!';
    default:
      return '○';
  }
}

export function formatEtaMinutes(
  min: number | null,
  max: number | null,
  t: (key: string, params?: Record<string, string | number>) => string,
): string | null {
  if (max == null) return null;
  if (min != null && min !== max) {
    return t('production.etaRange', { min: String(Math.round(min)), max: String(Math.round(max)) });
  }
  return t('production.etaSingle', { n: String(Math.round(max)) });
}

export function CampaignListCard({ item, onOpen }: CampaignListCardProps) {
  const t = useT();
  const showEta = shouldShowCampaignEta(item);
  const eta = showEta
    ? formatEtaMinutes(item.estimatedMinutesMin, item.estimatedMinutesMax, t)
    : null;

  return (
    <Card className="production-campaign-card">
      <div className="production-campaign-card__row">
        <div className="production-campaign-card__main">
          <div className="production-campaign-card__title-row">
            <span
              className="production-campaign-card__status-icon"
              aria-hidden
            >
              {statusIcon(item.status)}
            </span>
            <strong>{item.title}</strong>
          </div>
          <p className="muted production-campaign-card__meta">
            <span>
              {t(`production.status.${item.status}`, {}) !==
              `production.status.${item.status}`
                ? t(`production.status.${item.status}`)
                : item.status}
            </span>
            {' · '}
            <span>
              {item.recipeName} ({item.recipeMode})
            </span>
          </p>
          <div
            className="production-progress"
            role="progressbar"
            aria-valuenow={item.progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('production.progressAria', {
              n: String(item.progressPercent),
            })}
          >
            <div
              className="production-progress__bar"
              style={{ width: `${item.progressPercent}%` }}
            />
            <span className="production-progress__label">
              {item.progressPercent}%
            </span>
          </div>
          <p className="muted production-campaign-card__counts">
            {t('production.countsLine', {
              done: String(item.completedCount),
              running: String(item.runningCount),
              attention: String(item.attentionCount),
              total: String(item.projectCount),
            })}
            {eta ? (
              <>
                {' · '}
                <span title={t('production.etaEstimateHint')}>
                  {t('production.etaEstimateLabel')}: {eta}
                </span>
              </>
            ) : null}
          </p>
        </div>
        <div className="btn-row">
          <Button size="sm" onClick={() => { onOpen(item.campaignId); }}>
            {t('production.openCampaign')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
