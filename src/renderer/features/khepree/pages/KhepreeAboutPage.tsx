import { useT } from '../../../i18n';
import type { GetInfoResponse } from '@shared/schemas/ipc';
import { Button, Card } from '../../../components/ui';
import { openKhepreeExternal } from '../khepree-external';

interface KhepreeAboutPageProps {
  appInfo: GetInfoResponse;
}

export function KhepreeAboutPage({ appInfo }: KhepreeAboutPageProps) {
  const t = useT();

  return (
    <Card className="khepree-panel">
      <p className="khepree-about__brand">{t('khepree.about.brand')}</p>
      <p className="khepree-about__tagline">{t('khepree.about.tagline')}</p>
      <p>{t('khepree.about.body')}</p>
      <p>{t('khepree.about.explore')}</p>
      <p className="setup-wizard__hint">{t('khepree.about.version', { version: appInfo.version })}</p>
      <div className="khepree-gate__actions">
        <Button type="button" variant="primary" onClick={() => openKhepreeExternal('website')}>
          {t('khepree.about.exploreAction')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => openKhepreeExternal('products')}>
          {t('khepree.about.productsAction')}
        </Button>
      </div>
    </Card>
  );
}
