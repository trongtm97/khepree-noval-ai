import type {
  EditorContextResponseSchema,
  EditorParagraphDto,
} from '@shared/schemas/translation-editor';
import type { z } from 'zod';

export type EditorContext = z.infer<typeof EditorContextResponseSchema>;

export function isEditorContextEmpty(context: EditorContext | null): boolean {
  if (!context) return true;
  return countContextItems(context) === 0;
}

/** Count useful context items for rail badge / auto-expand heuristics. */
export function countContextItems(context: EditorContext | null): number {
  if (!context) return 0;
  const hasMemory = Boolean(context.memorySnippet?.trim());
  return (
    context.characters.length +
    context.terms.length +
    context.relationships.length +
    (hasMemory ? 1 : 0)
  );
}

/** True when context has no meaningful data (0 terms, 0 relationships, ≤1 character, no memory). */
export function isContextMeaningfullyEmpty(context: EditorContext | null): boolean {
  if (!context) return true;
  const hasMemory = Boolean(context.memorySnippet?.trim());
  return (
    context.terms.length === 0 &&
    context.relationships.length === 0 &&
    context.characters.length <= 1 &&
    !hasMemory
  );
}

function haystack(paragraph: EditorParagraphDto): string {
  return `${paragraph.sourceText}\n${paragraph.translatedText ?? ''}`;
}

/**
 * Prefer items that appear in the current paragraph.
 * If the paragraph matches nothing, keep chapter-level context.
 */
export function filterContextForParagraph(
  context: EditorContext,
  paragraph: EditorParagraphDto | null,
): EditorContext {
  if (!paragraph) return context;

  const text = haystack(paragraph);
  const highlightIds = new Set(paragraph.termHighlights.map((h) => h.termId));
  const highlightTexts = new Set(paragraph.termHighlights.map((h) => h.sourceText));

  const terms = context.terms.filter(
    (term) =>
      highlightIds.has(term.id) ||
      highlightTexts.has(term.sourceText) ||
      (term.sourceText.length > 0 && text.includes(term.sourceText)),
  );
  const characters = context.characters.filter((character) => {
    if (character.canonicalName && text.includes(character.canonicalName)) return true;
    if (character.translatedName && text.includes(character.translatedName)) return true;
    return false;
  });
  const names = new Set(
    characters.flatMap((character) =>
      [character.canonicalName, character.translatedName].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  );
  const relationships = context.relationships.filter(
    (rel) =>
      text.includes(rel.fromName) ||
      text.includes(rel.toName) ||
      names.has(rel.fromName) ||
      names.has(rel.toName),
  );

  const hasHits = terms.length + characters.length + relationships.length > 0;
  if (!hasHits) {
    return {
      ...context,
      terms: [],
      characters: [],
      relationships: [],
      memorySnippet: null,
    };
  }

  return {
    ...context,
    terms,
    characters,
    relationships,
  };
}
