import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { computeVirtualWindow } from '../../utils/virtual-window';

export interface LogLine {
  id: string;
  time: string;
  level: string;
  message: string;
}

interface LogViewerProps {
  lines: LogLine[];
  rowHeight?: number;
}

export function LogViewer({ lines, rowHeight = 28 }: LogViewerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(400);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { setHeight(el.clientHeight); });
    ro.observe(el);
    setHeight(el.clientHeight);
    return () => { ro.disconnect(); };
  }, []);

  const onScroll = useCallback(() => {
    if (ref.current) setScrollTop(ref.current.scrollTop);
  }, []);

  const window = useMemo(
    () => computeVirtualWindow(scrollTop, height, lines.length, rowHeight, 8),
    [lines.length, rowHeight, scrollTop, height],
  );

  const visible = lines.slice(
    window.startIndex,
    window.endIndex < 0 ? 0 : window.endIndex + 1,
  );

  return (
    <div className="nt-log-viewer" ref={ref} onScroll={onScroll}>
      <div style={{ height: window.totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${window.offsetY}px)` }}>
          {visible.map((line) => {
            const level = line.level.toLowerCase();
            const cls =
              level === 'error' || level === 'warn' || level === 'warning'
                ? `nt-log-line nt-log-line--${level === 'warning' ? 'warn' : level}`
                : 'nt-log-line';
            return (
              <div key={line.id} className={cls} style={{ height: rowHeight }}>
                <span>{line.time}</span>
                <span>{line.level.toUpperCase()}</span>
                <span>{line.message}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
