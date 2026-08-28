import { useRef } from 'react';
import type { SourceLanguageDetection } from '@shared/schemas/source-language';
import { formatLanguagePickerStacked } from '@shared/constants/language-profile';
import { Button } from '../../components/ui';
import { TooltipPopover } from '../../components/overlay';
import { useT } from '../../i18n';

export function SourceLanguageCompact({
  detection,
  detecting,
  onRedetect,
}: {
  detection: SourceLanguageDetection;
  detecting?: boolean;
  onRedetect: () => void;
}) {
  const t = useT();
  const detailRef = useRef<HTMLSpanElement>(null);
  const stacked = formatLanguagePickerStacked({
    internationalName: detection.internationalName,
    nativeName: detection.nativeName,
    code: detection.detectedLanguage,
  });
  const confidencePct = Math.round(detection.confidence * 100);

  return (
    <div className="source-language-compact">
      <span className="muted">{t('chaptersPage.sourceLanguageLabel')}</span>
      <span ref={detailRef} className="source-language-compact__value">
        {stacked.internationalName} / {stacked.nativeLine} · {detection.detectedLanguage}
      </span>
      <TooltipPopover
        anchorRef={detailRef}
        content={
          <div className="language-pair-tooltip">
            <div>{stacked.internationalName}</div>
            <div>{stacked.nativeLine}</div>
            <div>{detection.detectedLanguage}</div>
            <div>{t('createProjectWizard.sourceConfidence', { pct: String(confidencePct) })}</div>
            {detection.method ? <div>{detection.method}</div> : null}
          </div>
        }
      />
      <Button size="sm" variant="secondary" disabled={detecting} onClick={onRedetect}>
        {detecting ? t('sourceFolder.redetectRunning') : t('chaptersPage.redetectShort')}
      </Button>
    </div>
  );
}

export function SourceLanguageRedetectBanner({
  pending,
  busy,
  onApply,
  onKeep,
}: {
  pending: { currentLanguage: string; detection: SourceLanguageDetection };
  busy: boolean;
  onApply: () => void;
  onKeep: () => void;
}) {
  const t = useT();
  return (
    <div className="banner banner-warn">
      <p style={{ margin: '0 0 0.35rem', fontWeight: 600 }}>
        {t('sourceFolder.redetectChangedTitle')}
      </p>
      <p style={{ margin: 0 }}>
        {t('sourceFolder.redetectChangedBody', {
          current: pending.currentLanguage,
          detected: pending.detection.detectedLanguage,
        })}
      </p>
      <div className="btn-row" style={{ marginTop: '0.5rem' }}>
        <Button variant="primary" disabled={busy} onClick={onApply}>
          {t('sourceFolder.redetectApply')}
        </Button>
        <Button disabled={busy} onClick={onKeep}>
          {t('sourceFolder.redetectKeepCurrent')}
        </Button>
      </div>
    </div>
  );
}
