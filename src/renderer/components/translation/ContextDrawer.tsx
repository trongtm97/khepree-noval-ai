import { Brain, X } from 'lucide-react';
import type { EditorParagraphDto } from '@shared/schemas/translation-editor';
import { useT } from '../../i18n';
import {
  countContextItems,
  filterContextForParagraph,
  type EditorContext,
} from '../../utils/editor-context-filter';
import { EditorContextPanel } from '../editor/EditorContextPanel';
import { IconButton } from '../ui';

export interface ContextDrawerProps {
  context: EditorContext | null;
  paragraph?: EditorParagraphDto | null;
  collapsed: boolean;
  overlay?: boolean;
  onToggle: () => void;
  onTermClick?: (termId: string) => void;
  onCharacterClick?: (characterId: string, canonicalName: string) => void;
}

/** Right context panel — collapsed icon rail by default. Never auto-opens. */
export function ContextDrawer({
  context,
  paragraph = null,
  collapsed,
  overlay = false,
  onToggle,
  onTermClick,
  onCharacterClick,
}: ContextDrawerProps) {
  const t = useT();

  const filtered = context ? filterContextForParagraph(context, paragraph) : null;
  const itemCount = countContextItems(filtered);
  const tooltip =
    itemCount > 0
      ? t('translation.contextTooltipWithCount', { count: String(itemCount) })
      : t('translation.contextTooltip');

  if (collapsed && !overlay) {
    return (
      <div className="translation-context-rail-wrap">
        <IconButton
          label={tooltip}
          className="translation-context-rail"
          onClick={onToggle}
        >
          <Brain size={18} aria-hidden />
          {itemCount > 0 ? (
            <span className="translation-context-rail-badge" aria-hidden>
              {itemCount > 99 ? '99+' : itemCount}
            </span>
          ) : null}
        </IconButton>
      </div>
    );
  }

  const panel = (
    <>
      <div className="translation-context__header">
        <strong>{t('editor.context')}</strong>
        <IconButton label={t('translation.hideContext')} onClick={onToggle}>
          <X size={16} aria-hidden />
        </IconButton>
      </div>
      <div className="translation-context__body">
        <EditorContextPanel
          context={context}
          paragraph={paragraph}
          onTermClick={onTermClick}
          onCharacterClick={onCharacterClick}
        />
      </div>
    </>
  );

  if (overlay) {
    return (
      <aside className="translation-context translation-context--overlay" aria-label={tooltip}>
        {panel}
      </aside>
    );
  }

  return (
    <aside className="translation-context" aria-label={tooltip}>
      {panel}
    </aside>
  );
}
