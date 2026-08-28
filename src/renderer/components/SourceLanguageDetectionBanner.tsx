import type { SourceLanguageDetection } from '@shared/schemas/source-language';
import { formatLanguagePickerStacked } from '@shared/constants/language-profile';
import { useT } from '../i18n';

export function SourceLanguageDetectionBanner({
  detection,
  detecting,
}: {
  detection: SourceLanguageDetection | null;
  detecting?: boolean;
}) {
  const t = useT();

  if (detecting) {
    return (
      <p className="muted source-language-detection-banner">
        {t('createProjectWizard.sourceDetecting')}
      </p>
    );
  }

  if (!detection) return null;

  const stacked = formatLanguagePickerStacked({
    internationalName: detection.internationalName,
    nativeName: detection.nativeName,
    code: detection.detectedLanguage,
  });
  const confidencePct = Math.round(detection.confidence * 100);

  return (
    <div
      className={`source-language-detection-banner${detection.hintMismatch ? ' is-mismatch' : ''}`}
    >
      <p style={{ margin: '0 0 0.35rem', fontWeight: 600 }}>
        {detection.hintMismatch
          ? t('createProjectWizard.sourceHintMismatchTitle')
          : t('createProjectWizard.sourceDetectedTitle')}
      </p>
      <p style={{ margin: 0 }}>
        <span className="language-picker-intl">{stacked.internationalName}</span>
        <br />
        <span className="language-picker-native">{stacked.nativeLine}</span>
      </p>
      <p className="muted" style={{ margin: '0.35rem 0 0' }}>
        {t('createProjectWizard.sourceConfidence', { pct: String(confidencePct) })}
      </p>
      {detection.hintMismatch && detection.hintCode ? (
        <p className="banner banner-warn" style={{ marginTop: '0.5rem' }}>
          {t('createProjectWizard.sourceHintMismatchBody', {
            hint: detection.hintCode,
            detected: detection.nativeName,
          })}
        </p>
      ) : null}
    </div>
  );
}
