import type { EditorContextResponseSchema } from '@shared/schemas/translation-editor';
import type { z } from 'zod';
import { useT } from '../../i18n';
import { EditorContextPanel } from '../editor/EditorContextPanel';
import { Button } from '../ui';

type EditorContext = z.infer<typeof EditorContextResponseSchema>;

export interface ContextDrawerProps {
  context: EditorContext | null;
  collapsed: boolean;
  onToggle: () => void;
}

/** Right drawer — collapsed by default for translator focus. */
export function ContextDrawer({ context, collapsed, onToggle }: ContextDrawerProps) {
  const t = useT();

  if (collapsed) {
    return (
      <button
        type="button"
        className="translation-context-rail"
        onClick={onToggle}
        aria-expanded={false}
      >
        {t('translation.showContext')}
      </button>
    );
  }

  return (
    <aside className="translation-context" aria-label={t('translation.info')}>
      <div className="translation-context__header">
        <strong>{t('translation.info')}</strong>
        <Button size="sm" variant="ghost" onClick={onToggle}>
          {t('translation.hideContext')}
        </Button>
      </div>
      <div className="translation-context__body">
        <EditorContextPanel context={context} />
      </div>
    </aside>
  );
}
