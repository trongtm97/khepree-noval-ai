import { ChevronRight } from 'lucide-react';
import { useT } from '../../i18n';
import { Button } from '../ui';

interface TranslationChapterStatusProps {
  translated: boolean;
  hasNext: boolean;
  onNextChapter?: () => void;
}

export function TranslationChapterStatus({
  translated,
  hasNext,
  onNextChapter,
}: TranslationChapterStatusProps) {
  const t = useT();
  if (!translated) return null;

  return (
    <div className="translation-chapter-status" role="status">
      <span>{t('translation.chapterTranslatedStatus')}</span>
      {hasNext && onNextChapter ? (
        <Button size="sm" variant="ghost" onClick={onNextChapter}>
          {t('translation.nextChapterCta')}
          <ChevronRight size={14} aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
