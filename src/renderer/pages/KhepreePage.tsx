import type { GetInfoResponse } from '@shared/schemas/ipc';
import { useT } from '../i18n';
import { useKhepreeAccessState } from '../features/khepree/useKhepreeAccessState';
import { Button, Card } from '../components/ui';

interface KhepreePageProps {
  appInfo: GetInfoResponse;
}

export function KhepreePage({ appInfo }: KhepreePageProps) {
  const t = useT();
  const { state } = useKhepreeAccessState();

  const open = (target: Parameters<typeof window.novelTrans.khepree.openExternal>[0]['target']) => {
    void window.novelTrans.khepree.openExternal({ target });
  };

  return (
    <div className="page page--settings">
      <header className="page-header">
        <h1>{t('khepree.menu.title')}</h1>
        <p>{t('khepree.menu.subtitle')}</p>
      </header>

      <div className="settings-grid">
        <Card>
          <h2>{t('khepree.menu.about')}</h2>
          <p>{t('khepree.menu.aboutBody', { version: appInfo.version })}</p>
        </Card>

        <Card>
          <h2>{t('khepree.menu.account')}</h2>
          <p>{state?.user?.email ?? t('khepree.menu.notSignedIn')}</p>
          <Button type="button" variant="secondary" onClick={() => open('account')}>
            {t('khepree.menu.myAccount')}
          </Button>
        </Card>

        <Card>
          <h2>{t('khepree.menu.plan')}</h2>
          <p>{state?.plan?.planName ?? t('khepree.menu.noPlan')}</p>
          <div className="khepree-gate__actions">
            <Button type="button" variant="secondary" onClick={() => open('plans')}>
              {t('khepree.menu.myPlan')}
            </Button>
            <Button type="button" variant="primary" onClick={() => void window.novelTrans.khepree.startCheckout()}>
              {t('khepree.menu.upgrade')}
            </Button>
          </div>
        </Card>

        <Card>
          <h2>{t('khepree.menu.devices')}</h2>
          <p>
            {t('khepree.menu.devicesBody', {
              used: state?.devicesUsed ?? '?',
              max: state?.devicesMax ?? '?',
            })}
          </p>
          <Button type="button" variant="secondary" onClick={() => open('devices')}>
            {t('khepree.menu.manageDevices')}
          </Button>
        </Card>

        <Card>
          <h2>{t('khepree.menu.website')}</h2>
          <Button type="button" variant="secondary" onClick={() => open('website')}>
            {t('khepree.menu.visitWebsite')}
          </Button>
        </Card>

        {state?.signedIn ? (
          <Card>
            <Button type="button" variant="ghost" onClick={() => void window.novelTrans.khepree.signOut()}>
              {t('khepree.menu.signOut')}
            </Button>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
