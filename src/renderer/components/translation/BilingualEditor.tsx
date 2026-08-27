import type { EditorParagraphDto } from '@shared/schemas/translation-editor';
import type { TextDirection } from '@shared/constants/language-profile';
import { useT } from '../../i18n';
import { EditorVirtualList } from '../editor/EditorVirtualList';
import { VersionHistoryPanel } from '../editor/VersionHistoryPanel';
import type { SearchMatch } from '../../utils/editor-search';

export interface BilingualEditorProps {
  paragraphs: EditorParagraphDto[];
  activeParagraphId: string | null;
  dirty: Record<string, string>;
  searchMatchIndex: number | null;
  searchMatches: SearchMatch[];
  projectId: string;
  chapterId: string;
  sourceLabel: string;
  targetLabel: string;
  sourceDirection: TextDirection;
  targetDirection: TextDirection;
  onSelectParagraph: (id: string) => void;
  onDraftChange: (stableId: string, text: string, previous: string) => void;
  onReverted: () => void;
}

/** Center pane — Source | Translation with LanguageProfile directions. */
export function BilingualEditor({
  paragraphs,
  activeParagraphId,
  dirty,
  searchMatchIndex,
  searchMatches,
  projectId,
  chapterId,
  sourceLabel,
  targetLabel,
  sourceDirection,
  targetDirection,
  onSelectParagraph,
  onDraftChange,
  onReverted,
}: BilingualEditorProps) {
  const t = useT();
  const activeParagraph =
    paragraphs.find((p) => p.stableParagraphId === activeParagraphId) ?? null;

  return (
    <div className="translation-editor-pane bilingual-editor">
      <div className="editor-col-headers">
        <span>{sourceLabel}</span>
        <span>{targetLabel}</span>
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
          sourceDirection={sourceDirection}
          targetDirection={targetDirection}
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
  );
}
