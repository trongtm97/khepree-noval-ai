import { useT } from '../../i18n';
import { Button } from '../ui';

interface TranslationInterruptStripProps {
  paragraphSequence: number;
  onResume: () => void;
  onShowDetails: () => void;
}

/** Top strip when translation stops mid-chapter. */
export function TranslationInterruptStrip({
  paragraphSequence,
  onResume,
  onShowDetails,
}: TranslationInterruptStripProps) {
  const t = useT();

  return (
    <div className="translation-interrupt-strip banner banner-warning" role="alert">
      <span>{t('translation.interruptAtParagraph', { n: String(paragraphSequence) })}</span>
      <div className="btn-row">
        <Button size="sm" variant="primary" onClick={onResume}>
          {t('translation.resumeFromParagraph', { n: String(paragraphSequence) })}
        </Button>
        <Button size="sm" variant="ghost" onClick={onShowDetails}>
          {t('translation.viewInterruptDetails')}
        </Button>
      </div>
    </div>
  );
}
