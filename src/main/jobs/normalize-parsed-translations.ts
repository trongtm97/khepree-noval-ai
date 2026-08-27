import type { ParsedBatchResult, TranslationLine } from '@shared/schemas/output-protocol';

/**
 * Drop unknown IDs and keep the first non-empty line per source paragraph.
 * Multi-chunk merges often produce duplicates; Gemini sometimes invents IDs.
 * Local cleanup avoids a full MALFORMED_OUTPUT retranslate (soft-error prone).
 */
export function normalizeParsedTranslations(
  parsed: ParsedBatchResult,
  sourceParagraphIds: string[],
): { parsed: ParsedBatchResult; changed: boolean; droppedUnknown: number; droppedDup: number } {
  const sourceSet = new Set(sourceParagraphIds);
  const byId = new Map<string, TranslationLine>();
  let droppedUnknown = 0;
  let droppedDup = 0;

  for (const line of parsed.translations) {
    if (!sourceSet.has(line.paragraphId)) {
      droppedUnknown += 1;
      continue;
    }
    const existing = byId.get(line.paragraphId);
    if (!existing) {
      byId.set(line.paragraphId, line);
      continue;
    }
    droppedDup += 1;
    // Prefer non-empty over empty duplicate.
    if (!existing.text.trim() && line.text.trim()) {
      byId.set(line.paragraphId, line);
    }
  }

  const translations: TranslationLine[] = [];
  for (const id of sourceParagraphIds) {
    const line = byId.get(id);
    if (line) translations.push(line);
  }

  const changed =
    droppedUnknown > 0 ||
    droppedDup > 0 ||
    translations.length !== parsed.translations.length;

  return {
    parsed: changed ? { ...parsed, translations } : parsed,
    changed,
    droppedUnknown,
    droppedDup,
  };
}

export function qaErrorsAreOnlyIdNoise(qa: {
  errors: { code: string }[];
  missingParagraphIds: string[];
  emptyParagraphIds: string[];
  corruptParagraphIds?: string[];
}): boolean {
  if (
    qa.missingParagraphIds.length > 0 ||
    qa.emptyParagraphIds.length > 0 ||
    (qa.corruptParagraphIds?.length ?? 0) > 0
  ) {
    return false;
  }
  if (qa.errors.length === 0) return false;
  return qa.errors.every(
    (e) => e.code === 'duplicate_paragraph' || e.code === 'unknown_paragraph',
  );
}
