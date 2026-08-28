import { useT } from '../../i18n';

interface TranslationIssueCounterProps {
  count: number;
  onJump: () => void;
}

/** Compact QA issue counter — hidden when zero. */
export function TranslationIssueCounter({ count, onJump }: TranslationIssueCounterProps) {
  const t = useT();
  if (count <= 0) return null;

  return (
    <button type="button" className="translation-issue-counter" onClick={onJump}>
      {t('translation.qaIssueCount', { count: String(count) })}
    </button>
  );
}
