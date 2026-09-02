import { Outlet } from 'react-router-dom';
import { useT } from '../../i18n';
import { PageHeader } from '../../components/ui';
import { KhepreeTabs } from './components/KhepreeTabs';
import { KhepreeFreeTierBanner } from './KhepreeFreeTierBanner';
import { useKhepreeAccessState } from './useKhepreeAccessState';

export function KhepreeLayout() {
  const t = useT();
  const { state } = useKhepreeAccessState();
  const showFreeBanner = state?.status === 'FREE';

  return (
    <div className="khepree-hub">
      <PageHeader title={t('khepree.hub.title')} description={t('khepree.hub.subtitle')} />
      {showFreeBanner ? <KhepreeFreeTierBanner /> : null}
      <KhepreeTabs />
      <main className="khepree-hub__content">
        <Outlet />
      </main>
    </div>
  );
}
