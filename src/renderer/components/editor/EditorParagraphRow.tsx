import { memo, useCallback, useRef } from 'react';
import type { EditorParagraphDto } from '@shared/schemas/translation-editor';
import { useT } from '../../i18n';
import { HighlightedSourceText } from './HighlightedSourceText';

interface EditorParagraphRowProps {
  paragraph: EditorParagraphDto;
  draftText: string;
  isActive: boolean;
  searchHighlight?: { side: 'source' | 'translation'; start: number; end: number } | null;
  onSelect: (stableId: string) => void;
  onDraftChange: (stableId: string, text: string, previous: string) => void;
  rowRef?: (el: HTMLDivElement | null) => void;
}

export const EditorParagraphRow = memo(function EditorParagraphRow({
  paragraph,
  draftText,
  isActive,
  searchHighlight,
  onSelect,
  onDraftChange,
  rowRef,
}: EditorParagraphRowProps) {
  const t = useT();
  const previousRef = useRef(draftText);

  const handleFocus = useCallback(() => {
    onSelect(paragraph.stableParagraphId);
  }, [onSelect, paragraph.stableParagraphId]);

  const handleChange = useCallback(
    (value: string) => {
      onDraftChange(paragraph.stableParagraphId, value, previousRef.current);
      previousRef.current = value;
    },
    [onDraftChange, paragraph.stableParagraphId],
  );

  const statusClass =
    paragraph.status === 'qa_warning'
      ? 'editor-row--warning'
      : paragraph.humanLocked
        ? 'editor-row--human'
        : '';

  return (
    <div
      ref={rowRef}
      className={`editor-row ${isActive ? 'editor-row--active' : ''} ${statusClass}`}
      data-paragraph-id={paragraph.stableParagraphId}
      onClick={() => { onSelect(paragraph.stableParagraphId); }}
    >
      <div className="editor-row-meta">
        <code>{paragraph.stableParagraphId}</code>
        {paragraph.versionSource ? (
          <span className="editor-badge">{paragraph.versionSource}</span>
        ) : null}
        {paragraph.qaWarnings.length > 0 ? (
          <span className="editor-badge editor-badge--warn" title={paragraph.qaWarnings.join('; ')}>
            {t('editor.qaBadge')}
          </span>
        ) : null}
      </div>
      <div className="editor-row-cols">
        <div className="editor-col editor-col--source" onFocus={handleFocus}>
          <HighlightedSourceText
            text={paragraph.sourceText}
            highlights={paragraph.termHighlights}
            searchHighlight={
              searchHighlight?.side === 'source'
                ? { start: searchHighlight.start, end: searchHighlight.end }
                : null
            }
          />
        </div>
        <div className="editor-col editor-col--target">
          <textarea
            className="editor-textarea"
            value={draftText}
            rows={3}
            onFocus={handleFocus}
            onChange={(event) => { handleChange(event.target.value); }}
            aria-label={t('editor.translationAria', { id: paragraph.stableParagraphId })}
          />
        </div>
      </div>
    </div>
  );
});
