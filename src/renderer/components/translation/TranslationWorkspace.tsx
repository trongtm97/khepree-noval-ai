import type { EditorParagraphDto } from '@shared/schemas/translation-editor';
import type { EditorContextResponseSchema } from '@shared/schemas/translation-editor';
import type { TextDirection } from '@shared/constants/language-profile';
import type { z } from 'zod';
import type { SearchMatch } from '../../utils/editor-search';
import { BilingualEditor } from './BilingualEditor';
import { ContextDrawer } from './ContextDrawer';

type EditorContext = z.infer<typeof EditorContextResponseSchema>;

interface TranslationWorkspaceProps {
  paragraphs: EditorParagraphDto[];
  activeParagraphId: string | null;
  dirty: Record<string, string>;
  searchMatchIndex: number | null;
  searchMatches: SearchMatch[];
  projectId: string;
  chapterId: string;
  context: EditorContext | null;
  contextCollapsed: boolean;
  sourceLabel?: string;
  targetLabel?: string;
  sourceDirection?: TextDirection;
  targetDirection?: TextDirection;
  onSelectParagraph: (id: string) => void;
  onDraftChange: (stableId: string, text: string, previous: string) => void;
  onToggleContext: () => void;
  onReverted: () => void;
}

/** @deprecated Prefer BilingualEditor + ContextDrawer siblings in the page grid. */
export function TranslationWorkspace({
  paragraphs,
  activeParagraphId,
  dirty,
  searchMatchIndex,
  searchMatches,
  projectId,
  chapterId,
  context,
  contextCollapsed,
  sourceLabel = 'Source',
  targetLabel = 'Translation',
  sourceDirection = 'ltr',
  targetDirection = 'ltr',
  onSelectParagraph,
  onDraftChange,
  onToggleContext,
  onReverted,
}: TranslationWorkspaceProps) {
  return (
    <>
      <BilingualEditor
        paragraphs={paragraphs}
        activeParagraphId={activeParagraphId}
        dirty={dirty}
        searchMatchIndex={searchMatchIndex}
        searchMatches={searchMatches}
        projectId={projectId}
        chapterId={chapterId}
        sourceLabel={sourceLabel}
        targetLabel={targetLabel}
        sourceDirection={sourceDirection}
        targetDirection={targetDirection}
        onSelectParagraph={onSelectParagraph}
        onDraftChange={onDraftChange}
        onReverted={onReverted}
      />
      <ContextDrawer
        context={context}
        collapsed={contextCollapsed}
        onToggle={onToggleContext}
      />
    </>
  );
}
