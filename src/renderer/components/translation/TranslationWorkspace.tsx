import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ChapterSummaryDto } from '@shared/schemas/translation-pack';
import type { EditorContextResponseSchema } from '@shared/schemas/translation-editor';
import type { z } from 'zod';
import type { EditorParagraphDto } from '@shared/schemas/translation-editor';
import type { ChapterCopyMode } from '@shared/utils/chapter-export-text';
import type { NovelExportFormat } from '@shared/constants/portability';
import type { TermDto } from '@shared/schemas/term';
import type { CharacterDto } from '@shared/schemas/memory';
import type { SearchMatch } from '../../utils/editor-search';
import type { EditorFontPreset } from '../../stores/translation-workspace-store';
import {
  CONTEXT_OVERLAY_THRESHOLD,
  resolveChapterRailWidth,
  resolveContextPanelWidth,
} from '../../utils/translation-workspace-layout';
import { CharacterDetailDrawer } from '../../features/characters/CharacterDetailDrawer';
import { TermDetailDrawer } from '../../features/terms/TermDetailDrawer';
import { Drawer } from '../ui/Drawer';
import { IconButton } from '../ui';
import { useT } from '../../i18n';
import { ChapterNavigator } from './ChapterNavigator';
import { BilingualEditor } from './BilingualEditor';
import { ContextDrawer } from './ContextDrawer';
import { FocusEdgeControls } from './FocusEdgeControls';

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
  chapterTitle?: string | null;
  sourceLabel: string;
  targetLabel: string;
  sourceDirection: 'ltr' | 'rtl';
  targetDirection: 'ltr' | 'rtl';
  splitRatio?: number;
  readingMode?: boolean;
  qaReviewMode?: boolean;
  fontPreset?: EditorFontPreset;
  onSplitRatioChange?: (ratio: number) => void;
  onRetranslateParagraph?: (stableId: string) => void;
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
  onSetContextCollapsed: (collapsed: boolean) => void;
}

function useViewportWidth(): number {
  const [width, setWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1920,
  );
  useEffect(() => {
    const onResize = () => {
      setWidth(window.innerWidth);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, []);
  return width;
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
  chapterTitle = null,
  sourceLabel,
  targetLabel,
  sourceDirection,
  targetDirection,
  splitRatio = 0.48,
  readingMode = false,
  qaReviewMode = false,
  fontPreset = 'md',
  onSplitRatioChange,
  onRetranslateParagraph,
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
  onSetContextCollapsed,
}: TranslationWorkspaceProps): ReactNode {
  const t = useT();
  const viewportWidth = useViewportWidth();
  const contextOverlayMode = viewportWidth < CONTEXT_OVERLAY_THRESHOLD;
  const resolvedChapterWidth = resolveChapterRailWidth(chapterRailWidth, viewportWidth);
  const resolvedContextWidth = resolveContextPanelWidth(contextWidth, viewportWidth);

  const [inspectTerm, setInspectTerm] = useState<TermDto | null>(null);
  const [inspectCharacter, setInspectCharacter] = useState<CharacterDto | null>(null);
  const [contextCharacter, setContextCharacter] = useState<{
    canonicalName: string;
    translatedName: string | null;
    role: string | null;
  } | null>(null);
  const [, setInspectError] = useState<string | null>(null);
  const [contextOverlayOpen, setContextOverlayOpen] = useState(false);

  const activeParagraph =
    paragraphs.find((p) => p.stableParagraphId === activeParagraphId) ?? null;

  useEffect(() => {
    if (!contextOverlayMode) {
      setContextOverlayOpen(false);
    }
  }, [contextOverlayMode]);

  useEffect(() => {
    if (contextOverlayMode && !contextCollapsed) {
      setContextOverlayOpen(true);
      onSetContextCollapsed(true);
    }
  }, [contextOverlayMode, contextCollapsed, onSetContextCollapsed]);

  const openTerm = useCallback(async (termId: string) => {
    setInspectError(null);
    try {
      const result = await window.khepreeNovelAI.terms.get(termId);
      setInspectTerm(result.term);
    } catch (err: unknown) {
      setInspectError(err instanceof Error ? err.message : 'term');
    }
  }, []);

  const openCharacter = useCallback(
    async (characterId: string, canonicalName: string) => {
      setInspectError(null);
      try {
        const result = await window.khepreeNovelAI.memory.listCharacters(projectId);
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

  const contextExpandedInGrid = !contextCollapsed && !contextOverlayMode;

  const handleContextToggle = useCallback(() => {
    if (contextOverlayMode) {
      setContextOverlayOpen((open) => !open);
      return;
    }
    onToggleContext();
  }, [contextOverlayMode, onToggleContext]);

  const handleContextClose = useCallback(() => {
    if (contextOverlayMode) {
      setContextOverlayOpen(false);
      return;
    }
    onSetContextCollapsed(true);
  }, [contextOverlayMode, onSetContextCollapsed]);

  const workspaceStyle = {
    '--chapter-rail-width': `${resolvedChapterWidth}px`,
    '--context-panel-width': `${resolvedContextWidth}px`,
    '--context-rail-width': '38px',
  } as CSSProperties;

  return (
    <div
      className={[
        'translation-workspace',
        contextExpandedInGrid ? 'translation-workspace--context-expanded' : '',
        chapterRailCollapsed ? 'translation-workspace--chapter-collapsed' : '',
        contextOverlayMode ? 'translation-workspace--context-overlay-mode' : '',
        focusMode ? 'translation-workspace--focus' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={workspaceStyle}
    >
      {!focusMode ? (
        <div className="translation-chapters-wrap">
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
          <IconButton
            className="chapter-rail-edge-toggle"
            label={
              chapterRailCollapsed
                ? t('translation.expandChapterRail')
                : t('translation.collapseChapterRail')
            }
            onClick={onToggleChapterRail}
          >
            {chapterRailCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </IconButton>
        </div>
      ) : null}

      <BilingualEditor
        paragraphs={paragraphs}
        activeParagraphId={activeParagraphId}
        dirty={dirty}
        searchMatchIndex={searchMatchIndex}
        searchMatches={searchMatches}
        projectId={projectId}
        chapterId={chapterId}
        chapterTitle={chapterTitle}
        sourceLabel={sourceLabel}
        targetLabel={targetLabel}
        sourceDirection={sourceDirection}
        targetDirection={targetDirection}
        splitRatio={splitRatio}
        readingMode={readingMode}
        qaReviewMode={qaReviewMode}
        fontPreset={fontPreset}
        onSplitRatioChange={onSplitRatioChange}
        onSelectParagraph={onSelectParagraph}
        onDraftChange={onDraftChange}
        onReverted={onEditorReverted}
        onRetranslateParagraph={onRetranslateParagraph}
        onTermClick={(termId) => {
          void openTerm(termId);
        }}
      />

      {focusMode ? (
        <FocusEdgeControls
          onToggleChapterRail={onToggleChapterRail}
          onToggleContext={handleContextToggle}
        />
      ) : null}

      {!focusMode ? (
        <>
          {contextExpandedInGrid ? (
            <ContextDrawer
              context={context}
              paragraph={activeParagraph}
              collapsed={false}
              onToggle={handleContextClose}
              onTermClick={(termId) => {
                void openTerm(termId);
              }}
              onCharacterClick={(characterId, canonicalName) => {
                void openCharacter(characterId, canonicalName);
              }}
            />
          ) : (
            <ContextDrawer
              context={context}
              paragraph={activeParagraph}
              collapsed
              onToggle={handleContextToggle}
              onTermClick={(termId) => {
                void openTerm(termId);
              }}
              onCharacterClick={(characterId, canonicalName) => {
                void openCharacter(characterId, canonicalName);
              }}
            />
          )}
          {contextOverlayMode && contextOverlayOpen ? (
            <>
              <button
                type="button"
                className="translation-context-backdrop"
                aria-label={t('translation.hideContext')}
                onClick={handleContextClose}
              />
              <ContextDrawer
                context={context}
                paragraph={activeParagraph}
                collapsed={false}
                overlay
                onToggle={handleContextClose}
                onTermClick={(termId) => {
                  void openTerm(termId);
                }}
                onCharacterClick={(characterId, canonicalName) => {
                  void openCharacter(characterId, canonicalName);
                }}
              />
            </>
          ) : null}
        </>
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
