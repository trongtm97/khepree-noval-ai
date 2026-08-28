import { Brain } from 'lucide-react';
import type { EditorParagraphDto } from '@shared/schemas/translation-editor';
import { useT } from '../../i18n';
import type { EditorContext } from '../../utils/editor-context-filter';
import { EditorContextPanel } from '../editor/EditorContextPanel';
import { Button, IconButton } from '../ui';

export interface ContextDrawerProps {
  context: EditorContext | null;
  paragraph?: EditorParagraphDto | null;
  collapsed: boolean;
  onToggle: () => void;
  onTermClick?: (termId: string) => void;
  onCharacterClick?: (characterId: string, canonicalName: string) => void;
}

/** Right context panel — collapsed icon rail by default. Never auto-opens. */
export function ContextDrawer({
  context,
  paragraph = null,
  collapsed,
  onToggle,
  onTermClick,
  onCharacterClick,
}: ContextDrawerProps) {
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
        <EditorContextPanel
          context={context}
          paragraph={paragraph}
          onTermClick={onTermClick}
          onCharacterClick={onCharacterClick}
        />
      </div>
    </aside>
  );
}
