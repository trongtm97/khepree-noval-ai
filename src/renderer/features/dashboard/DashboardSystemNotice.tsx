import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui';
import { useT } from '../../i18n';
import type { DashboardSystemNotice } from './resolve-dashboard-home';

export interface DashboardSystemNoticeBannerProps {
  notice: DashboardSystemNotice;
  onDismiss?: () => void;
}

/** Single inline banner — never opens a modal on top of other modals. */
export function DashboardSystemNoticeBanner({
  notice,
  onDismiss,
}: DashboardSystemNoticeBannerProps) {
  const t = useT();
  const navigate = useNavigate();

  return (
    <div
      className={`dashboard-system-notice dashboard-system-notice--${notice.kind}`}
      role="status"
    >
      <div className="dashboard-system-notice__text">
        <strong>{t(notice.titleKey, notice.params)}</strong>
        {notice.bodyKey ? (
          <p className="muted">{t(notice.bodyKey, notice.params)}</p>
        ) : null}
      </div>
      <div className="btn-row">
        {notice.actionKey && notice.actionRoute ? (
          <Button
            size="sm"
            onClick={() => {
              navigate(notice.actionRoute!);
            }}
          >
            {t(notice.actionKey)}
          </Button>
        ) : null}
        {onDismiss ? (
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            {t('actions.close')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
