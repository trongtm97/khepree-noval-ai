export interface SearchMatch {
  paragraphIndex: number;
  stableParagraphId: string;
  side: 'source' | 'translation';
  start: number;
  end: number;
}

export function findMatches(
  paragraphs: { stableParagraphId: string; sourceText: string; translatedText: string | null }[],
  query: string,
  side: 'source' | 'translation' | 'both' = 'both',
): SearchMatch[] {
  const needle = query.trim();
  if (!needle) return [];

  const lowerNeedle = needle.toLowerCase();
  const matches: SearchMatch[] = [];

  paragraphs.forEach((para, paragraphIndex) => {
    if (side === 'source' || side === 'both') {
      const idx = para.sourceText.toLowerCase().indexOf(lowerNeedle);
      if (idx >= 0) {
        matches.push({
          paragraphIndex,
          stableParagraphId: para.stableParagraphId,
          side: 'source',
          start: idx,
          end: idx + needle.length,
        });
      }
    }
    if ((side === 'translation' || side === 'both') && para.translatedText) {
      const idx = para.translatedText.toLowerCase().indexOf(lowerNeedle);
      if (idx >= 0) {
        matches.push({
          paragraphIndex,
          stableParagraphId: para.stableParagraphId,
          side: 'translation',
          start: idx,
          end: idx + needle.length,
        });
      }
    }
  });

  return matches;
}

export function applyReplaceAll(
  text: string,
  query: string,
  replacement: string,
): string {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(escaped, 'gi'), replacement);
}
