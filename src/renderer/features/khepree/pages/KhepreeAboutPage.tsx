import { ExternalLink, Globe, Package } from 'lucide-react';
import { useT } from '../../../i18n';
import type { GetInfoResponse } from '@shared/schemas/ipc';
import { Button, Card } from '../../../components/ui';
import { OfficialContactCards } from '../../../components/contact/OfficialContactCards';
import { openKhepreeExternal } from '../khepree-external';
import { formatKhepreeProductDisplayName } from '../khepree-display';

interface KhepreeAboutPageProps {
  appInfo: GetInfoResponse;
}

export function KhepreeAboutPage({ appInfo }: KhepreeAboutPageProps) {
  const t = useT();

  return (
    <Card className="khepree-panel">
      <div className="khepree-about__hero">
        <div className="khepree-about__mark" aria-hidden="true">
          K
        </div>
        <div>
          <p className="khepree-about__brand">{t('khepree.about.brand')}</p>
          <p className="khepree-about__tagline">{t('khepree.about.tagline')}</p>
          <p className="khepree-about__body">{t('khepree.about.body')}</p>
        </div>
      </div>

      <div className="khepree-about__product">
        <p className="khepree-about__product-name">{formatKhepreeProductDisplayName(t)}</p>
        <p className="khepree-about__product-meta">
          {t('khepree.about.versionLine', { version: appInfo.version })}
        </p>
        <p className="khepree-about__product-meta">{t('khepree.about.byline')}</p>
      </div>

      <div className="khepree-about__actions">
        <article className="khepree-about__action-card">
          <Globe size={20} strokeWidth={1.75} aria-hidden="true" />
          <h3>{t('khepree.about.websiteTitle')}</h3>
          <p>{t('khepree.about.websiteDesc')}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              openKhepreeExternal('website');
            }}
          >
            {t('khepree.about.websiteAction')}
            <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </article>
        <article className="khepree-about__action-card">
          <Package size={20} strokeWidth={1.75} aria-hidden="true" />
          <h3>{t('khepree.about.productsTitle')}</h3>
          <p>{t('khepree.about.productsDesc')}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              openKhepreeExternal('products');
            }}
          >
            {t('khepree.about.productsAction')}
            <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </article>
      </div>

      <div className="khepree-about__contacts">
        <h2 className="khepree-about__contacts-title">{t('khepree.about.contactsTitle')}</h2>
        <p className="khepree-about__contacts-desc">{t('khepree.about.contactsDesc')}</p>
        <OfficialContactCards />
      </div>
    </Card>
  );
}
