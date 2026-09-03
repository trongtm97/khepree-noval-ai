import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { CampaignListItemDto } from '@shared/schemas/translation-campaign';
import { Button, Skeleton } from '../../components/ui';
import { useT } from '../../i18n';
import { CampaignListCard } from './CampaignListCard';

export interface CampaignListPanelProps {
  campaigns: CampaignListItemDto[];
  loading: boolean;
  error: string | null;
  onOpen: (campaignId: string) => void;
  onCreateCampaign: () => void;
  onImportMany: () => void;
  onRetry: () => void;
}

const ROW_ESTIMATE = 128;

export function CampaignListPanel({
  campaigns,
  loading,
  error,
  onOpen,
  onCreateCampaign,
  onImportMany,
  onRetry,
}: CampaignListPanelProps) {
  const t = useT();
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: campaigns.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 6,
    getItemKey: (index) => campaigns[index]?.campaignId ?? index,
  });

  if (loading) {
    return (
      <div className="production-campaign-list" aria-busy="true">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} height={110} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="production-empty" role="alert">
        <p>{t('production.listError')}</p>
        <p className="muted">{error}</p>
        <Button onClick={onRetry}>{t('production.retryLoad')}</Button>
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="production-empty">
        <h3>{t('production.emptyTitle')}</h3>
        <p className="muted">{t('production.emptyBody')}</p>
        <div className="btn-row">
          <Button onClick={onCreateCampaign}>
            {t('actions.startCampaign')}
          </Button>
          <Button variant="secondary" onClick={onImportMany}>
            {t('actions.importManyNovels')}
          </Button>
        </div>
      </div>
    );
  }

  const useVirtual = campaigns.length > 40;

  return (
    <div className="production-campaign-list">
      <div className="btn-row production-campaign-list__actions">
        <Button onClick={onCreateCampaign}>{t('actions.startCampaign')}</Button>
        <Button variant="secondary" onClick={onImportMany}>
          {t('actions.importManyNovels')}
        </Button>
      </div>
      {useVirtual ? (
        <div
          ref={parentRef}
          className="production-campaign-list__virtual"
          role="list"
        >
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((row) => {
              const item = campaigns[row.index]!;
              return (
                <div
                  key={row.key}
                  role="listitem"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${row.size}px`,
                    transform: `translateY(${row.start}px)`,
                    paddingBottom: 8,
                  }}
                >
                  <CampaignListCard item={item} onOpen={onOpen} />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="jobs-card-list" role="list">
          {campaigns.map((item) => (
            <div key={item.campaignId} role="listitem">
              <CampaignListCard item={item} onOpen={onOpen} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
