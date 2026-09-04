import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ModalPortal } from '../../components/overlay/ModalPortal';
import { Button } from '../../components/ui';
import { useT } from '../../i18n';
import { FEATURE_INTRO_CTA_ROUTE } from '@shared/constants/feature-intro';

const STEP_KEYS = ['batchImport', 'recipeMode', 'productionCenter'] as const;

interface FeatureTourProps {
  open: boolean;
  onSkip: () => void;
  onComplete: () => void;
}

export function FeatureTour({ open, onSkip, onComplete }: FeatureTourProps) {
  const t = useT();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  if (!open) return null;

  const stepKey = STEP_KEYS[step] ?? STEP_KEYS[0];
  const isLast = step >= STEP_KEYS.length - 1;

  const finish = () => {
    onComplete();
    navigate(FEATURE_INTRO_CTA_ROUTE);
  };

  return (
    <ModalPortal
      open={open}
      onBackdropClick={onSkip}
      contentClassName="nt-dialog feature-tour-modal"
      ariaLabelledBy="feature-tour-title"
    >
      <p className="muted feature-tour-modal__progress">
        {t('featureTour.stepProgress', { current: step + 1, total: STEP_KEYS.length })}
      </p>
      <h2 id="feature-tour-title">{t(`featureTour.steps.${stepKey}.title`)}</h2>
      <p>{t(`featureTour.steps.${stepKey}.body`)}</p>
      <div className="nt-dialog-actions">
        <Button variant="ghost" onClick={onSkip}>{t('featureTour.skip')}</Button>
        {isLast ? (
          <Button onClick={finish}>{t('featureTour.finish')}</Button>
        ) : (
          <Button onClick={() => { setStep((s) => s + 1); }}>{t('featureTour.next')}</Button>
        )}
      </div>
    </ModalPortal>
  );
}
