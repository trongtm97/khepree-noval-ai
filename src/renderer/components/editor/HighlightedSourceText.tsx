import type { ReactNode } from 'react';
import type { EditorTermHighlightSchema } from '@shared/schemas/translation-editor';
import type { z } from 'zod';

type TermHighlight = z.infer<typeof EditorTermHighlightSchema>;

interface HighlightedSourceTextProps {
  text: string;
  highlights: TermHighlight[];
  searchHighlight?: { start: number; end: number } | null;
}

export function HighlightedSourceText({
  text,
  highlights,
  searchHighlight,
}: HighlightedSourceTextProps) {
  if (highlights.length === 0 && !searchHighlight) {
    return <span>{text}</span>;
  }

  const ranges = [
    ...highlights.map((h) => ({
      start: h.startIndex,
      end: h.endIndex,
      kind: 'term' as const,
      highlight: h,
    })),
    ...(searchHighlight
      ? [{ start: searchHighlight.start, end: searchHighlight.end, kind: 'search' as const, highlight: null }]
      : []),
  ].sort((a, b) => a.start - b.start);

  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const range of ranges) {
    if (range.start < cursor) continue;
    if (range.start > cursor) {
      nodes.push(<span key={`t-${cursor}`}>{text.slice(cursor, range.start)}</span>);
    }
    const slice = text.slice(range.start, range.end);
    if (range.kind === 'term') {
      const h = range.highlight;
      const title = [
        h.preferredTranslation ? `VI: ${h.preferredTranslation}` : null,
        `Type: ${h.termType}`,
        `Scope: ${h.scope}`,
        h.confidence != null ? `Confidence: ${h.confidence}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      nodes.push(
        <mark key={`term-${range.start}`} className="editor-term" title={title}>
          {slice}
        </mark>,
      );
    } else {
      nodes.push(
        <mark key={`search-${range.start}`} className="editor-search-hit">
          {slice}
        </mark>,
      );
    }
    cursor = range.end;
  }

  if (cursor < text.length) {
    nodes.push(<span key={`t-${cursor}`}>{text.slice(cursor)}</span>);
  }

  return <>{nodes}</>;
}
