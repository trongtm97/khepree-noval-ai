import { useT } from '../../../i18n';
import { useKhepreeAccessState } from '../useKhepreeAccessState';
import { Button, Card } from '../../../components/ui';
import { openKhepreeExternal } from '../khepree-external';
import {
  formatKhepreeDevicesCount,
  formatKhepreeDevicesRemaining,
} from '../khepree-display';

export function KhepreeDevicesPage() {
  const t = useT();
  const { state } = useKhepreeAccessState();

  const devicesUsed = state?.devicesUsed ?? null;
  const devicesMax = state?.devicesMax ?? null;
  const hasUsageData = devicesUsed != null && devicesMax != null && devicesMax > 0;
  const devicesPct = hasUsageData
    ? Math.min(100, Math.round((devicesUsed / devicesMax) * 100))
    : 0;
  const slotsRemaining = formatKhepreeDevicesRemaining(t, devicesUsed, devicesMax);

  return (
    <Card className="khepree-panel">
      <div className="khepree-panel__inner">
        <h2 className="khepree-panel__section-title">{t('khepree.devices.title')}</h2>
        <p className="setup-wizard__hint">{t('khepree.devices.subtitle')}</p>
      </div>

      <div className="khepree-devices-summary">
        <p className="khepree-eyebrow">{t('khepree.devices.usageTitle')}</p>

        {!state?.signedIn ? (
          <p className="khepree-devices-summary__unknown">{t('khepree.devices.notSignedIn')}</p>
        ) : hasUsageData ? (
          <>
            <p className="khepree-devices-summary__count">
              {formatKhepreeDevicesCount(t, devicesUsed, devicesMax)}
            </p>
            <div
              className="khepree-devices-summary__bar"
              role="progressbar"
              aria-valuenow={devicesUsed}
              aria-valuemin={0}
              aria-valuemax={devicesMax}
              aria-label={t('khepree.devices.usageTitle')}
            >
              <div
                className="khepree-devices-summary__fill"
                style={{ width: `${devicesPct}%` }}
              />
            </div>
            {slotsRemaining ? (
              <p className="khepree-devices-summary__hint">{slotsRemaining}</p>
            ) : null}
          </>
        ) : (
          <p className="khepree-devices-summary__unknown">{t('khepree.devices.limitUnknown')}</p>
        )}

        <p className="khepree-devices-summary__help">{t('khepree.devices.help')}</p>
      </div>

      <div className="khepree-gate__actions">
        <Button
          type="button"
          variant="primary"
          onClick={() => {
            openKhepreeExternal('devices');
          }}
        >
          {t('khepree.devices.manageAction')}
        </Button>
        {state?.signedIn ? (
          <Button type="button" variant="secondary" onClick={() => void window.khepreeNovelAI.khepree.retryActivation()}>
            {t('khepree.deviceLimit.retry')}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
