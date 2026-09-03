import { useNavigate } from 'react-router-dom';
import { ModalPortal } from '../../components/overlay/ModalPortal';
import { Button } from '../../components/ui';
import { useT } from '../../i18n';
import { FEATURE_INTRO_CTA_ROUTE } from '@shared/constants/feature-intro';

interface WhatsNewModalProps {
  open: boolean;
  onClose: () => void;
  onNeverShow: () => void;
}

export function WhatsNewModal({ open, onClose, onNeverShow }: WhatsNewModalProps) {
  const t = useT();
  const navigate = useNavigate();

  const goProduction = () => {
    onClose();
    navigate(FEATURE_INTRO_CTA_ROUTE);
  };

  return (
    <ModalPortal
      open={open}
      onBackdropClick={onClose}
      contentClassName="nt-dialog feature-intro-modal"
      ariaLabelledBy="whats-new-title"
    >
      <h2 id="whats-new-title">{t('whatsNew.title')}</h2>
      <p className="feature-intro-modal__body">{t('whatsNew.body')}</p>
      <p className="muted feature-intro-modal__cost">{t('whatsNew.costNote')}</p>
      <div className="feature-intro-modal__features">
        <p className="muted">{t('whatsNew.featuresHeading')}</p>
        <ul>
          <li>{t('whatsNew.feature.campaign')}</li>
          <li>{t('whatsNew.feature.batchImport')}</li>
          <li>{t('whatsNew.feature.productionCenter')}</li>
          <li>{t('whatsNew.feature.attentionInbox')}</li>
          <li>{t('whatsNew.feature.recipe')}</li>
          <li>{t('whatsNew.feature.wholeBookAudit')}</li>
          <li>{t('whatsNew.feature.series')}</li>
        </ul>
      </div>
      <div className="nt-dialog-actions feature-intro-modal__actions">
        <Button variant="ghost" onClick={onNeverShow}>
          {t('whatsNew.neverShow')}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          {t('actions.close')}
        </Button>
        <Button onClick={goProduction}>{t('whatsNew.cta')}</Button>
      </div>
    </ModalPortal>
  );
}
