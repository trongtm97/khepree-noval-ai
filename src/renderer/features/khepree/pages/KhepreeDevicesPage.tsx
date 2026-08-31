import { useT } from '../../../i18n';
import { useKhepreeAccessState } from '../useKhepreeAccessState';
import { Button, Card } from '../../../components/ui';
import { openKhepreeExternal } from '../khepree-external';

export function KhepreeDevicesPage() {
  const t = useT();
  const { state } = useKhepreeAccessState();

  return (
    <Card className="khepree-panel">
      <h2>{t('khepree.devices.title')}</h2>
      <p>{t('khepree.devices.subtitle')}</p>

      {state?.signedIn ? (
        <p className="khepree-devices__count">
          {t('khepree.devices.count', {
            used: state.devicesUsed ?? '?',
            max: state.devicesMax ?? '?',
          })}
        </p>
      ) : (
        <p>{t('khepree.devices.notSignedIn')}</p>
      )}

      <p className="setup-wizard__hint">{t('khepree.devices.manageHint')}</p>

      <div className="khepree-gate__actions">
        <Button type="button" variant="primary" onClick={() => openKhepreeExternal('devices')}>
          {t('khepree.devices.manageAction')}
        </Button>
        {state?.signedIn ? (
          <Button type="button" variant="secondary" onClick={() => void window.novelTrans.khepree.retryActivation()}>
            {t('khepree.deviceLimit.retry')}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
