import { formatLanguagePairLabel } from '@shared/constants/language-profile';

/** Compact language pair for UI — never raw BCP-47 codes for normal users. */
export function LanguagePairLabel({
  sourceLanguage,
  targetLanguage,
  className,
}: {
  sourceLanguage: string;
  targetLanguage: string;
  className?: string;
}) {
  return (
    <span className={className ?? 'language-pair-label'} dir="auto">
      {formatLanguagePairLabel(sourceLanguage, targetLanguage)}
    </span>
  );
}
