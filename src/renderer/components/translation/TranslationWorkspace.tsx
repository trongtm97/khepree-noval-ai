import type { EditorParagraphDto } from '@shared/schemas/translation-editor';
import type { EditorContextResponseSchema } from '@shared/schemas/translation-editor';
import type { z } from 'zod';
import { useT } from '../../i18n';
import { EditorVirtualList } from '../editor/EditorVirtualList';
import { EditorContextPanel } from '../editor/EditorContextPanel';
import { VersionHistoryPanel } from '../editor/VersionHistoryPanel';
import { Button } from '../ui';
import type { SearchMatch } from '../../utils/editor-search';

type EditorContext = z.infer<typeof EditorContextResponseSchema>;

interface TranslationWorkspaceProps {
  paragraphs: EditorParagraphDto[];
  activeParagraphId: string | null;
  dirty: Record<string, string>;
  searchMatchIndex: number | null;
  searchMatches: SearchMatch[];
  projectId: string;
  chapterId: string;
  context: EditorContext | null;
  contextCollapsed: boolean;
  onSelectParagraph: (id: string) => void;
  onDraftChange: (stableId: string, text: string, previous: string) => void;
  onToggleContext: () => void;
  onReverted: () => void;
}

export function TranslationWorkspace({
  paragraphs,
  activeParagraphId,
  dirty,
  searchMatchIndex,
  searchMatches,
  projectId,
  chapterId,
  context,
  contextCollapsed,
  onSelectParagraph,
  onDraftChange,
  onToggleContext,
  onReverted,
}: TranslationWorkspaceProps) {
  const t = useT();
  const activeParagraph =
    paragraphs.find((p) => p.stableParagraphId === activeParagraphId) ?? null;

  return (
    <>
      <div className="translation-editor-pane">
        <div className="editor-col-headers">
          <span>{t('translation.chinese')}</span>
          <div className="editor-col-headers__vi">
            <span>{t('translation.vietnamese')}</span>
            <Button size="sm" variant="ghost" onClick={onToggleContext}>
              {contextCollapsed
                ? t('translation.showContext')
                : t('translation.hideContext')}
            </Button>
          </div>
        </div>
        {paragraphs.length === 0 ? (
          <div className="placeholder-card" style={{ margin: '0.75rem' }}>
            {t('translation.selectChapter')}
          </div>
        ) : (
          <EditorVirtualList
            paragraphs={paragraphs}
            activeParagraphId={activeParagraphId}
            dirty={dirty}
            searchMatchIndex={searchMatchIndex}
            searchMatches={searchMatches}
            onSelect={onSelectParagraph}
            onDraftChange={onDraftChange}
          />
        )}
        <VersionHistoryPanel
          translationId={activeParagraph?.translationId ?? null}
          projectId={projectId}
          chapterId={chapterId}
          onReverted={onReverted}
        />
      </div>

      {!contextCollapsed ? (
        <aside className="translation-context" aria-label={t('translation.info')}>
          <div style={{ padding: '0.5rem' }}>
            <EditorContextPanel context={context} />
          </div>
        </aside>
      ) : null}
    </>
  );
}
