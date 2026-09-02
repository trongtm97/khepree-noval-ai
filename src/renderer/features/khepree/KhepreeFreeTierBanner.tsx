import { Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n';
import { Button } from '../../components/ui';

export function KhepreeFreeTierBanner() {
  const t = useT();
  const navigate = useNavigate();

  return (
    <div className="khepree-free-banner" role="status">
      <div className="khepree-free-banner__icon" aria-hidden="true">
        <Sparkles size={20} strokeWidth={1.75} />
      </div>
      <div className="khepree-free-banner__copy">
        <p className="khepree-free-banner__title">{t('khepree.freeTier.bannerTitle')}</p>
        <p className="khepree-free-banner__desc">{t('khepree.freeTier.bannerDesc')}</p>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => {
          navigate('/khepree/plan');
        }}
      >
        {t('khepree.freeTier.upgrade')}
      </Button>
    </div>
  );
}
