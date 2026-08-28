import { useCallback, useRef, type PointerEvent } from 'react';

interface EditorSplitGutterProps {
  ratio: number;
  onRatioChange: (ratio: number) => void;
}

/** Draggable column splitter between source and translation. */
export function EditorSplitGutter({ ratio, onRatioChange }: EditorSplitGutterProps) {
  const dragging = useRef(false);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragging.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      const row = event.currentTarget.closest('.editor-row-cols, .editor-col-headers, .editor-title-row');
      const container = row?.parentElement?.closest('.bilingual-editor') ?? row?.parentElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const next = x / rect.width;
      onRatioChange(Math.min(0.65, Math.max(0.35, next)));
    },
    [onRatioChange],
  );

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return (
    <div
      className="editor-split-gutter editor-split-gutter--draggable"
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={35}
      aria-valuemax={65}
      title={`${Math.round(ratio * 100)}% / ${Math.round((1 - ratio) * 100)}%`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}
