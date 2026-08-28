import { Brain } from 'lucide-react';
import type { EditorContextResponseSchema } from '@shared/schemas/translation-editor';
import type { z } from 'zod';
import { useT } from '../../i18n';
import { EditorContextPanel } from '../editor/EditorContextPanel';
import { Button, IconButton } from '../ui';

type EditorContext = z.infer<typeof EditorContextResponseSchema>;

export interface ContextDrawerProps {
  context: EditorContext | null;
  collapsed: boolean;
  onToggle: () => void;
}

/** Right context panel — collapsed icon rail by default. */
export function ContextDrawer({ context, collapsed, onToggle }: ContextDrawerProps) {
  const t = useT();

  if (collapsed) {
    return (
      <div className="translation-context-rail-wrap">
        <IconButton
          label={t('translation.contextTooltip')}
          className="translation-context-rail"
          onClick={onToggle}
        >
          <Brain size={18} aria-hidden />
        </IconButton>
      </div>
    );
  }

  return (
    <aside className="translation-context" aria-label={t('translation.contextTooltip')}>
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
