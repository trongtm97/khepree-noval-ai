import { memo, useCallback, useRef, useState } from 'react';
import type { EditorParagraphDto } from '@shared/schemas/translation-editor';
import type { TextDirection } from '@shared/constants/language-profile';
import { useT } from '../../i18n';
import { useUiShellStore } from '../../stores/ui-shell-store';
import { HighlightedSourceText } from './HighlightedSourceText';
import { EditorParagraphMenu } from './EditorParagraphMenu';
import { useAutoGrowTextarea } from './useAutoGrowTextarea';

interface EditorParagraphRowProps {
  paragraph: EditorParagraphDto;
  draftText: string;
  isActive: boolean;
  isDirty: boolean;
  readingMode?: boolean;
  searchHighlight?: { side: 'source' | 'translation'; start: number; end: number } | null;
  sourceDirection?: TextDirection;
  targetDirection?: TextDirection;
  onSelect: (stableId: string) => void;
  onDraftChange: (stableId: string, text: string, previous: string) => void;
  onOpenVersionHistory?: (stableId: string) => void;
  onRetranslateParagraph?: (stableId: string) => void;
  onTermClick?: (termId: string) => void;
}

export const EditorParagraphRow = memo(function EditorParagraphRow({
  paragraph,
  draftText,
  isActive,
  isDirty,
  readingMode = false,
  searchHighlight,
  sourceDirection = 'ltr',
  targetDirection = 'ltr',
  onSelect,
  onDraftChange,
  onOpenVersionHistory,
  onRetranslateParagraph,
  onTermClick,
}: EditorParagraphRowProps) {
  const t = useT();
  const showParagraphIds = useUiShellStore((s) => s.showParagraphIds);
  const showAdvancedTools = useUiShellStore((s) => s.showAdvancedTools);
  const { textareaRef, syncSize } = useAutoGrowTextarea(draftText);
  const previousRef = useRef(draftText);
  previousRef.current = draftText;
  const [hovered, setHovered] = useState(false);

  const handleFocus = useCallback(() => {
    onSelect(paragraph.stableParagraphId);
  }, [onSelect, paragraph.stableParagraphId]);

  const handleChange = useCallback(
    (value: string) => {
      onDraftChange(paragraph.stableParagraphId, value, previousRef.current);
      previousRef.current = value;
      syncSize();
    },
    [onDraftChange, paragraph.stableParagraphId, syncSize],
  );

  const showQa = paragraph.status === 'qa_warning' || paragraph.qaWarnings.length > 0;
  const statusClass = showQa ? 'editor-row--warning' : paragraph.humanLocked ? 'editor-row--human' : '';
  const showIdNode = showParagraphIds || showAdvancedTools;
  const showMenu = isActive || hovered;

  const hoverTitle = [
    showAdvancedTools || showParagraphIds ? paragraph.stableParagraphId : null,
    paragraph.versionSource,
  ]
    .filter(Boolean)
    .join(' · ');

  const copyParagraph = useCallback(() => {
    void navigator.clipboard.writeText(draftText);
  }, [draftText]);

  return (
    <div
      className={`editor-row ${isActive ? 'editor-row--active' : ''} ${readingMode ? 'editor-row--reading' : ''} ${statusClass}`}
      data-paragraph-id={paragraph.stableParagraphId}
      title={hoverTitle || undefined}
      onMouseEnter={() => {
        setHovered(true);
      }}
      onMouseLeave={() => {
        setHovered(false);
      }}
      onClick={() => {
        onSelect(paragraph.stableParagraphId);
      }}
    >
      {showIdNode ? (
        <code
          className={`editor-row-id${showParagraphIds ? '' : ' editor-row-id--hover-only'}`}
        >
          {paragraph.stableParagraphId}
        </code>
      ) : null}
      {onOpenVersionHistory ? (
        <EditorParagraphMenu
          visible={showMenu}
          humanLocked={paragraph.humanLocked}
          onCopyTranslation={copyParagraph}
          onOpenHistory={() => {
            onSelect(paragraph.stableParagraphId);
            onOpenVersionHistory(paragraph.stableParagraphId);
          }}
          onRetranslate={() => {
            onRetranslateParagraph?.(paragraph.stableParagraphId);
          }}
        />
      ) : null}
      {showQa || paragraph.humanLocked || isDirty ? (
        <div className="editor-row-markers">
          {showQa ? (
            <span
              className="editor-badge editor-badge--warn"
              title={paragraph.qaWarnings.join('; ')}
            >
              {t('editor.qaBadge')}
            </span>
          ) : null}
          {paragraph.humanLocked ? (
            <span className="editor-badge editor-badge--locked">{t('editor.lockedBadge')}</span>
          ) : null}
          {isDirty ? (
            <span className="editor-badge editor-badge--dirty">{t('editor.unsavedBadge')}</span>
          ) : null}
        </div>
      ) : null}
      <div className="editor-row-cols">
        <div className="editor-col editor-col--source" dir={sourceDirection} onFocus={handleFocus}>
          <HighlightedSourceText
            text={paragraph.sourceText}
            highlights={paragraph.termHighlights}
            searchHighlight={
              searchHighlight?.side === 'source'
                ? { start: searchHighlight.start, end: searchHighlight.end }
                : null
            }
            onTermClick={onTermClick}
          />
        </div>
        <div className="editor-split-gutter" aria-hidden />
        <div className="editor-col editor-col--target" dir={targetDirection}>
          {readingMode && !isActive ? (
            <div
              className="editor-reading-text"
              onClick={(event) => {
                event.stopPropagation();
                onSelect(paragraph.stableParagraphId);
              }}
            >
              {draftText || t('editor.emptyPlaceholder')}
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              className="editor-textarea"
              value={draftText}
              dir={targetDirection}
              placeholder={t('editor.emptyPlaceholder')}
              rows={1}
              onFocus={handleFocus}
              onChange={(event) => {
                handleChange(event.target.value);
              }}
              aria-label={t('editor.translationAria', { id: paragraph.stableParagraphId })}
            />
          )}
        </div>
      </div>
    </div>
  );
});
