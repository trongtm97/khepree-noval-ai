import type { TextDirection } from '@shared/constants/language-profile';
import { EditorSplitGutter } from './EditorSplitGutter';

interface EditorTitleRowProps {
  sourceTitle: string;
  targetTitle: string;
  sourceDirection?: TextDirection;
  targetDirection?: TextDirection;
  splitRatio: number;
  onSplitRatioChange: (ratio: number) => void;
  readingMode?: boolean;
  onTargetChange?: (text: string) => void;
  onSelect?: () => void;
}

export function EditorTitleRow({
  sourceTitle,
  targetTitle,
  sourceDirection = 'ltr',
  targetDirection = 'ltr',
  splitRatio,
  onSplitRatioChange,
  readingMode = false,
  onTargetChange,
  onSelect,
}: EditorTitleRowProps) {
  return (
    <div className="editor-title-row" onClick={onSelect}>
      <div className="editor-title-row-cols">
        <div className="editor-col editor-col--source editor-title-cell" dir={sourceDirection}>
          {sourceTitle}
        </div>
        <EditorSplitGutter ratio={splitRatio} onRatioChange={onSplitRatioChange} />
        <div className="editor-col editor-col--target editor-title-cell" dir={targetDirection}>
          {readingMode ? (
            <span className="editor-reading-text">{targetTitle || '—'}</span>
          ) : (
            <textarea
              className="editor-textarea editor-textarea--title"
              value={targetTitle}
              dir={targetDirection}
              rows={1}
              onFocus={onSelect}
              onChange={(event) => {
                onTargetChange?.(event.target.value);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
