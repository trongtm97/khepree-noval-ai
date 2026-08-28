import {
  formatLanguagePairInline,
  formatLanguagePairLabel,
  formatLanguagePairStacked,
} from '@shared/constants/language-profile';

/** Language pair for UI — stacked, compact, or inline (project list). */
export function LanguagePairLabel({
  sourceLanguage,
  targetLanguage,
  className,
  variant = 'stacked',
}: {
  sourceLanguage: string;
  targetLanguage: string;
  className?: string;
  variant?: 'stacked' | 'compact' | 'inline';
}) {
  if (variant === 'compact') {
    return (
      <span className={className ?? 'language-pair-label'} dir="auto">
        {formatLanguagePairLabel(sourceLanguage, targetLanguage)}
      </span>
    );
  }

  if (variant === 'inline') {
    return (
      <span
        className={[className ?? 'language-pair-label', 'language-pair-label--inline']
          .filter(Boolean)
          .join(' ')}
        dir="auto"
        title={formatLanguagePairInline(sourceLanguage, targetLanguage)}
      >
        {formatLanguagePairInline(sourceLanguage, targetLanguage)}
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
