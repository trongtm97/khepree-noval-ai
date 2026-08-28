import {
  formatLanguagePairLabel,
  formatLanguagePairStacked,
} from '@shared/constants/language-profile';

/** Language pair for UI — stacked (full) or compact (native names only). */
export function LanguagePairLabel({
  sourceLanguage,
  targetLanguage,
  className,
  variant = 'stacked',
}: {
  sourceLanguage: string;
  targetLanguage: string;
  className?: string;
  variant?: 'stacked' | 'compact';
}) {
  if (variant === 'compact') {
    return (
      <span className={className ?? 'language-pair-label'} dir="auto">
        {formatLanguagePairLabel(sourceLanguage, targetLanguage)}
      </span>
    );
  }

  const { internationalLine, nativeLine } = formatLanguagePairStacked(
    sourceLanguage,
    targetLanguage,
  );

  return (
    <span
      className={[className ?? 'language-pair-label', 'language-pair-label--stacked']
        .filter(Boolean)
        .join(' ')}
      dir="auto"
    >
      <span className="language-pair-intl">{internationalLine}</span>
      <span className="language-pair-native">{nativeLine}</span>
    </span>
  );
}
