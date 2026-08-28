import { useEffect, useMemo, useState } from 'react';
import type { EditorParagraphDto } from '@shared/schemas/translation-editor';
import { findMatches, applyReplaceAll } from '../../../utils/editor-search';

interface UseTranslationSearchOptions {
  paragraphs: EditorParagraphDto[];
  dirty: Record<string, string>;
  setActiveParagraph: (id: string) => void;
  recordUndo: (stableId: string, previous: string, next: string) => void;
  updateDraft: (stableId: string, text: string) => void;
  scheduleSave: (stableId: string, text: string) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
}

export function useTranslationSearch({
  paragraphs,
  dirty,
  setActiveParagraph,
  recordUndo,
  updateDraft,
  scheduleSave,
  searchOpen,
  setSearchOpen,
}: UseTranslationSearchOptions) {
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [searchMatchIndex, setSearchMatchIndex] = useState<number | null>(null);
  const [showReplace, setShowReplace] = useState(false);

  const searchMatches = useMemo(() => {
    const merged = paragraphs.map((p) => ({
      stableParagraphId: p.stableParagraphId,
      sourceText: p.sourceText,
      translatedText: dirty[p.stableParagraphId] ?? p.translatedText,
    }));
    return findMatches(merged, searchQuery);
  }, [paragraphs, dirty, searchQuery]);

  useEffect(() => {
    if (searchMatches.length === 0) {
      setSearchMatchIndex(null);
      return;
    }
    setSearchMatchIndex((prev) => prev ?? 0);
  }, [searchMatches.length, searchQuery]);

  useEffect(() => {
    const match = searchMatchIndex != null ? searchMatches[searchMatchIndex] : null;
    if (match) setActiveParagraph(match.stableParagraphId);
  }, [searchMatchIndex, searchMatches, setActiveParagraph]);

  const runReplaceAll = () => {
    if (!searchQuery) return;
    for (const para of paragraphs) {
      const current = (dirty[para.stableParagraphId] ?? para.translatedText) || '';
      const next = applyReplaceAll(current, searchQuery, replaceQuery);
      if (next !== current) {
        recordUndo(para.stableParagraphId, current, next);
        updateDraft(para.stableParagraphId, next);
        scheduleSave(para.stableParagraphId, next);
      }
    }
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setShowReplace(false);
  };

  const openFind = () => {
    setSearchOpen(true);
    setShowReplace(false);
  };

  const openReplace = () => {
    setSearchOpen(true);
    setShowReplace(true);
  };

  const nextMatch = () => {
    setSearchMatchIndex((idx) => {
      if (searchMatches.length === 0) return null;
      if (idx == null) return 0;
      return (idx + 1) % searchMatches.length;
    });
  };

  return {
    searchOpen,
    searchQuery,
    replaceQuery,
    searchMatchIndex,
    showReplace,
    searchMatches,
    setSearchQuery,
    setReplaceQuery,
    setShowReplace,
    runReplaceAll,
    closeSearch,
    openFind,
    openReplace,
    nextMatch,
  };
}
