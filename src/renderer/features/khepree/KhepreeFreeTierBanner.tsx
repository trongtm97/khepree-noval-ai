import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n';
import { Button } from '../../components/ui';

export function KhepreeFreeTierBanner() {
  const t = useT();
  const navigate = useNavigate();

  return (
    <div className="banner banner-info khepree-free-tier-banner" role="status">
      <p>{t('khepree.freeTier.banner')}</p>
      <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/khepree/plan')}>
        {t('khepree.freeTier.upgrade')}
      </Button>
    </div>
  );
}
