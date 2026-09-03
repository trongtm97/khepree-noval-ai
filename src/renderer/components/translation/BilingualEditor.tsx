import { useMemo, useState, type CSSProperties } from 'react';
import type { EditorParagraphDto } from '@shared/schemas/translation-editor';
import type { TextDirection } from '@shared/constants/language-profile';
import type { EditorFontPreset } from '../../stores/translation-workspace-store';
import { useT } from '../../i18n';
import {
  filterParagraphsForDisplay,
  resolveTitleParagraphIndex,
  splitRatioToSourceFr,
} from '../../utils/editor-chapter-utils';
import { resolveDraftText } from '../../utils/editor-virtual';
import { EditorVirtualList } from '../editor/EditorVirtualList';
import { EditorTitleRow } from '../editor/EditorTitleRow';
import { EditorSplitGutter } from '../editor/EditorSplitGutter';
import { VersionHistoryPanel } from '../editor/VersionHistoryPanel';
import { Drawer } from '../ui/Drawer';
import type { SearchMatch } from '../../utils/editor-search';

export interface BilingualEditorProps {
  paragraphs: EditorParagraphDto[];
  activeParagraphId: string | null;
  dirty: Record<string, string>;
  searchMatchIndex: number | null;
  searchMatches: SearchMatch[];
  projectId: string;
  chapterId: string;
  chapterTitle?: string | null;
  sourceLabel: string;
  targetLabel: string;
  sourceDirection: TextDirection;
  targetDirection: TextDirection;
  splitRatio?: number;
  readingMode?: boolean;
  qaReviewMode?: boolean;
  fontPreset?: EditorFontPreset;
  onSplitRatioChange?: (ratio: number) => void;
  onSelectParagraph: (id: string) => void;
  onDraftChange: (stableId: string, text: string, previous: string) => void;
  onReverted: () => void;
  onRetranslateParagraph?: (stableId: string) => void;
  onTermClick?: (termId: string) => void;
}

const FONT_PRESET_CLASS: Record<EditorFontPreset, string> = {
  sm: 'bilingual-editor--font-sm',
  md: 'bilingual-editor--font-md',
  lg: 'bilingual-editor--font-lg',
};

/** Center pane — Source | Translation with LanguageProfile directions. */
export function BilingualEditor({
  paragraphs,
  activeParagraphId,
  dirty,
  searchMatchIndex,
  searchMatches,
  projectId,
  chapterId,
  chapterTitle = null,
  sourceLabel,
  targetLabel,
  sourceDirection,
  targetDirection,
  splitRatio = 0.48,
  readingMode = false,
  qaReviewMode = false,
  fontPreset = 'md',
  onSplitRatioChange,
  onSelectParagraph,
  onDraftChange,
  onReverted,
  onRetranslateParagraph,
  onTermClick,
}: BilingualEditorProps) {
  const t = useT();
  const [historyParagraphId, setHistoryParagraphId] = useState<string | null>(null);
  const historyOpen = historyParagraphId != null;
  const historyParagraph =
    paragraphs.find((p) => p.stableParagraphId === historyParagraphId) ??
    paragraphs.find((p) => p.stableParagraphId === activeParagraphId) ??
    null;

  const titleIndex = useMemo(
    () => resolveTitleParagraphIndex(paragraphs, chapterTitle),
    [paragraphs, chapterTitle],
  );

  const titleParagraph = titleIndex >= 0 ? paragraphs[titleIndex] : null;
  const titleSource =
    chapterTitle?.trim() ?? titleParagraph?.sourceText ?? '';
  const titleTarget = titleParagraph
    ? resolveDraftText(dirty, titleParagraph.stableParagraphId, titleParagraph.translatedText)
    : '';

  const bodyParagraphs = useMemo(
    () =>
      filterParagraphsForDisplay(paragraphs, {
        qaOnly: qaReviewMode,
        titleIndex,
      }),
    [paragraphs, qaReviewMode, titleIndex],
  );

  const editorStyle = {
    '--editor-source-col': `${splitRatioToSourceFr(splitRatio)}fr`,
    '--editor-target-col': '1fr',
  } as CSSProperties;

  return (
    <div
      className={`translation-editor-pane bilingual-editor ${FONT_PRESET_CLASS[fontPreset]}`}
      style={editorStyle}
    >
      <div className="editor-col-headers">
        <span>{sourceLabel}</span>
        {onSplitRatioChange ? (
          <EditorSplitGutter ratio={splitRatio} onRatioChange={onSplitRatioChange} />
        ) : (
          <span className="editor-split-gutter" aria-hidden />
        )}
        <span>{targetLabel}</span>
      </div>

      {titleSource ? (
        <EditorTitleRow
          sourceTitle={titleSource}
          targetTitle={titleTarget}
          sourceDirection={sourceDirection}
          targetDirection={targetDirection}
          splitRatio={splitRatio}
          onSplitRatioChange={onSplitRatioChange ?? (() => undefined)}
          readingMode={readingMode}
          onSelect={() => {
            if (titleParagraph) onSelectParagraph(titleParagraph.stableParagraphId);
          }}
          onTargetChange={
            titleParagraph
              ? (text) => {
                  const prev = resolveDraftText(
                    dirty,
                    titleParagraph.stableParagraphId,
                    titleParagraph.translatedText,
                  );
                  onDraftChange(titleParagraph.stableParagraphId, text, prev);
                }
              : undefined
          }
        />
      ) : null}

      {bodyParagraphs.length === 0 ? (
        <div className="placeholder-card" style={{ margin: '0.75rem' }}>
          {qaReviewMode ? t('translation.qaReviewEmpty') : t('translation.selectChapter')}
        </div>
      ) : (
        <EditorVirtualList
          key={`${chapterId}-${qaReviewMode ? 'qa' : 'all'}`}
          chapterId={chapterId}
          paragraphs={bodyParagraphs}
          activeParagraphId={activeParagraphId}
          dirty={dirty}
          searchMatchIndex={searchMatchIndex}
          searchMatches={searchMatches}
          readingMode={readingMode}
          sourceDirection={sourceDirection}
          targetDirection={targetDirection}
          onSelect={onSelectParagraph}
          onDraftChange={onDraftChange}
          onOpenVersionHistory={setHistoryParagraphId}
          onRetranslateParagraph={onRetranslateParagraph}
          onTermClick={onTermClick}
        />
      )}
      <Drawer
        open={historyOpen}
        title={t('editor.versionHistory')}
        onClose={() => {
          setHistoryParagraphId(null);
        }}
      >
        {historyOpen ? (
          <VersionHistoryPanel
            translationId={historyParagraph?.translationId ?? null}
            projectId={projectId}
            chapterId={chapterId}
            onReverted={onReverted}
            active={historyOpen}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
