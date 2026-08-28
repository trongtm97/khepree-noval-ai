import type { CSSProperties, ReactNode } from 'react';
import type { ChapterSummaryDto } from '@shared/schemas/translation-pack';
import type { EditorContextResponseSchema } from '@shared/schemas/translation-editor';
import type { z } from 'zod';
import type { EditorParagraphDto } from '@shared/schemas/translation-editor';
import type { ChapterCopyMode } from '@shared/utils/chapter-export-text';
import type { NovelExportFormat } from '@shared/constants/portability';
import type { SearchMatch } from '../../utils/editor-search';
import { ChapterNavigator } from './ChapterNavigator';
import { BilingualEditor } from './BilingualEditor';
import { ContextDrawer } from './ContextDrawer';

type EditorContext = z.infer<typeof EditorContextResponseSchema>;

export interface TranslationWorkspaceProps {
  focusMode: boolean;
  chapterRailCollapsed: boolean;
  contextCollapsed: boolean;
  chapterRailWidth: number;
  contextWidth: number;
  chapters: ChapterSummaryDto[];
  chapterIndex: number;
  selectedChapterIds: Set<string>;
  enqueueBusy: boolean;
  paragraphs: EditorParagraphDto[];
  activeParagraphId: string | null;
  dirty: Record<string, string>;
  searchMatchIndex: number | null;
  searchMatches: SearchMatch[];
  projectId: string;
  chapterId: string;
  sourceLabel: string;
  targetLabel: string;
  sourceDirection: 'ltr' | 'rtl';
  targetDirection: 'ltr' | 'rtl';
  context: EditorContext | null;
  onToggleChapterRail: () => void;
  onSelectChapter: (index: number) => void;
  onToggleChapterSelect: (index: number, shiftKey: boolean) => void;
  onSelectAllChapters: () => void;
  onClearChapterSelection: () => void;
  onChapterCopy: (chapterId: string, mode: ChapterCopyMode) => void;
  onChapterExport: (chapterId: string, format: Extract<NovelExportFormat, 'txt' | 'docx'>) => void;
  onChapterRetranslate: (chapterId: string) => void;
  onSelectParagraph: (id: string) => void;
  onDraftChange: (stableId: string, text: string, previous: string) => void;
  onEditorReverted: () => void;
  onToggleContext: () => void;
}

export function TranslationWorkspace({
  focusMode,
  chapterRailCollapsed,
  contextCollapsed,
  chapterRailWidth,
  contextWidth,
  chapters,
  chapterIndex,
  selectedChapterIds,
  enqueueBusy,
  paragraphs,
  activeParagraphId,
  dirty,
  searchMatchIndex,
  searchMatches,
  projectId,
  chapterId,
  sourceLabel,
  targetLabel,
  sourceDirection,
  targetDirection,
  context,
  onToggleChapterRail,
  onSelectChapter,
  onToggleChapterSelect,
  onSelectAllChapters,
  onClearChapterSelection,
  onChapterCopy,
  onChapterExport,
  onChapterRetranslate,
  onSelectParagraph,
  onDraftChange,
  onEditorReverted,
  onToggleContext,
}: TranslationWorkspaceProps): ReactNode {
  const workspaceStyle = {
    '--chapter-rail-width': `${chapterRailWidth}px`,
    '--context-panel-width': `${contextWidth}px`,
  } as CSSProperties;

  return (
    <div
      className={[
        'translation-workspace',
        !contextCollapsed ? 'translation-workspace--context-expanded' : '',
        chapterRailCollapsed ? 'translation-workspace--chapter-collapsed' : '',
        focusMode ? 'translation-workspace--focus' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={workspaceStyle}
    >
      {!focusMode ? (
        <ChapterNavigator
          chapters={chapters}
          chapterIndex={chapterIndex}
          selectedChapterIds={selectedChapterIds}
          busy={enqueueBusy}
          collapsed={chapterRailCollapsed}
          onToggleCollapse={onToggleChapterRail}
          onSelectChapter={onSelectChapter}
          onToggleSelect={onToggleChapterSelect}
          onSelectAll={onSelectAllChapters}
          onClearSelection={onClearChapterSelection}
          onChapterCopy={onChapterCopy}
          onChapterExport={onChapterExport}
          onChapterRetranslate={onChapterRetranslate}
        />
      ) : null}

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
        onReverted={onEditorReverted}
      />

      {!focusMode ? (
        <ContextDrawer
          context={context}
          collapsed={contextCollapsed}
          onToggle={onToggleContext}
        />
      ) : null}
    </div>
  );
}
