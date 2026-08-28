import { useCallback, useState, type CSSProperties, type ReactNode } from 'react';
import type { ChapterSummaryDto } from '@shared/schemas/translation-pack';
import type { EditorContextResponseSchema } from '@shared/schemas/translation-editor';
import type { z } from 'zod';
import type { EditorParagraphDto } from '@shared/schemas/translation-editor';
import type { ChapterCopyMode } from '@shared/utils/chapter-export-text';
import type { NovelExportFormat } from '@shared/constants/portability';
import type { TermDto } from '@shared/schemas/term';
import type { CharacterDto } from '@shared/schemas/memory';
import type { SearchMatch } from '../../utils/editor-search';
import { CharacterDetailDrawer } from '../../features/characters/CharacterDetailDrawer';
import { TermDetailDrawer } from '../../features/terms/TermDetailDrawer';
import { Drawer } from '../ui/Drawer';
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
  translatingNumbers: ReadonlySet<number>;
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
  onTranslateSelected: () => void;
  onExportSelected: () => void;
  onOpenExportDirectory?: () => void;
  onNextUntranslated: () => void;
  onNextIssue: () => void;
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
  translatingNumbers,
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
  onTranslateSelected,
  onExportSelected,
  onOpenExportDirectory,
  onNextUntranslated,
  onNextIssue,
  onChapterCopy,
  onChapterExport,
  onChapterRetranslate,
  onSelectParagraph,
  onDraftChange,
  onEditorReverted,
  onToggleContext,
}: TranslationWorkspaceProps): ReactNode {
  const [inspectTerm, setInspectTerm] = useState<TermDto | null>(null);
  const [inspectCharacter, setInspectCharacter] = useState<CharacterDto | null>(null);
  const [contextCharacter, setContextCharacter] = useState<{
    canonicalName: string;
    translatedName: string | null;
    role: string | null;
  } | null>(null);
  const [, setInspectError] = useState<string | null>(null);

  const activeParagraph =
    paragraphs.find((p) => p.stableParagraphId === activeParagraphId) ?? null;

  const openTerm = useCallback(async (termId: string) => {
    setInspectError(null);
    try {
      const result = await window.novelTrans.terms.get(termId);
      setInspectTerm(result.term);
    } catch (err: unknown) {
      setInspectError(err instanceof Error ? err.message : 'term');
    }
  }, []);

  const openCharacter = useCallback(
    async (characterId: string, canonicalName: string) => {
      setInspectError(null);
      try {
        const result = await window.novelTrans.memory.listCharacters(projectId);
        const found =
          result.characters.find((item) => item.id === characterId) ??
          result.characters.find((item) => item.canonicalName === canonicalName) ??
          null;
        if (found) {
          setInspectCharacter(found);
          setContextCharacter(null);
          return;
        }
        const fromContext = context?.characters.find((item) => item.id === characterId);
        setContextCharacter({
          canonicalName: fromContext?.canonicalName ?? canonicalName,
          translatedName: fromContext?.translatedName ?? null,
          role: fromContext?.role ?? null,
        });
      } catch (err: unknown) {
        setInspectError(err instanceof Error ? err.message : 'character');
      }
    },
    [context, projectId],
  );

  const workspaceStyle = {
    '--chapter-rail-width': `${chapterRailWidth}px`,
    '--context-panel-width': `${contextWidth}px`,
    '--context-rail-width': '38px',
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
          projectId={projectId}
          chapters={chapters}
          chapterIndex={chapterIndex}
          selectedChapterIds={selectedChapterIds}
          translatingNumbers={translatingNumbers}
          busy={enqueueBusy}
          collapsed={chapterRailCollapsed}
          onToggleCollapse={onToggleChapterRail}
          onSelectChapter={onSelectChapter}
          onToggleSelect={onToggleChapterSelect}
          onSelectAll={onSelectAllChapters}
          onClearSelection={onClearChapterSelection}
          onTranslateSelected={onTranslateSelected}
          onExportSelected={onExportSelected}
          onChapterCopy={onChapterCopy}
          onChapterExport={onChapterExport}
          onChapterRetranslate={onChapterRetranslate}
          onOpenExportDirectory={onOpenExportDirectory}
          onNextUntranslated={onNextUntranslated}
          onNextIssue={onNextIssue}
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
        onTermClick={(termId) => {
          void openTerm(termId);
        }}
      />

      {!focusMode ? (
        <ContextDrawer
          context={context}
          paragraph={activeParagraph}
          collapsed={contextCollapsed}
          onToggle={onToggleContext}
          onTermClick={(termId) => {
            void openTerm(termId);
          }}
          onCharacterClick={(characterId, canonicalName) => {
            void openCharacter(characterId, canonicalName);
          }}
        />
      ) : null}

      <TermDetailDrawer
        open={inspectTerm != null}
        busy={false}
        term={inspectTerm}
        onClose={() => {
          setInspectTerm(null);
        }}
        onSaved={() => {
          setInspectTerm(null);
        }}
        onError={setInspectError}
      />
      <CharacterDetailDrawer
        open={inspectCharacter != null}
        busy={false}
        projectId={projectId}
        character={inspectCharacter}
        onClose={() => {
          setInspectCharacter(null);
        }}
        onSaved={() => {
          setInspectCharacter(null);
        }}
        onError={setInspectError}
      />
      <Drawer
        open={contextCharacter != null}
        title={contextCharacter?.canonicalName ?? ''}
        onClose={() => {
          setContextCharacter(null);
        }}
      >
        {contextCharacter ? (
          <div className="detail-drawer-read">
            <p>
              <strong>{contextCharacter.canonicalName}</strong>
              {contextCharacter.translatedName ? ` → ${contextCharacter.translatedName}` : ''}
            </p>
            {contextCharacter.role ? <p className="muted">{contextCharacter.role}</p> : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
