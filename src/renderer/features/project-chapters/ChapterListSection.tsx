import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import type { ChapterSummaryDto } from '@shared/schemas/translation-pack';
import type { NovelExportFormat } from '@shared/constants/portability';
import { copyChapterToClipboard, canCopyChapter } from '../../services/chapter-clipboard-service';
import { DataTable, IconButton, SearchInput, Select } from '../../components/ui';
import { DropdownMenu } from '../../components/overlay';
import { chapterLabel, chapterRef } from '../../components/translation/chapter-utils';
import { useT } from '../../i18n';
import { useUiShellStore } from '../../stores/ui-shell-store';
import {
  resolveChapterDisplayStatus,
  sourceStatusLabelKey,
  type ChapterDisplayStatus,
} from './chapter-display-status';

type StatusFilter = 'all' | ChapterDisplayStatus;

interface ChapterListSectionProps {
  projectId: string;
  editionId?: string | null;
  chapters: ChapterSummaryDto[];
  translatingNumbers: ReadonlySet<number>;
  busy: boolean;
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
}

export function ChapterListSection({
  projectId,
  editionId,
  chapters,
  translatingNumbers,
  busy,
  onMessage,
  onError,
}: ChapterListSectionProps) {
  const t = useT();
  const navigate = useNavigate();
  const setLastTranslationSession = useUiShellStore((s) => s.setLastTranslationSession);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [menuState, setMenuState] = useState<{
    chapterId: string;
    anchor: HTMLButtonElement;
  } | null>(null);
  const menuAnchorRef = useRef<HTMLButtonElement | null>(null);
  if (menuState) {
    menuAnchorRef.current = menuState.anchor;
  }

  const menuChapter = menuState
    ? chapters.find((c) => c.id === menuState.chapterId) ?? null
    : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return chapters.filter((ch) => {
      const display = resolveChapterDisplayStatus(ch, translatingNumbers);
      if (statusFilter !== 'all' && display !== statusFilter) return false;
      if (!q) return true;
      const label = chapterLabel(ch).toLowerCase();
      return label.includes(q) || (ch.title?.toLowerCase().includes(q) ?? false);
    });
  }, [chapters, query, statusFilter, translatingNumbers]);

  const openInTranslator = (chapter: ChapterSummaryDto) => {
    setLastTranslationSession(projectId, chapter.id);
    navigate(`/projects/${projectId}/translate`);
  };

  const copyTranslation = async (chapter: ChapterSummaryDto) => {
    try {
      const result = await window.novelTrans.editor.getChapter({
        projectId,
        chapterId: chapter.id,
      });
      const payload = {
        chapterNumber: chapterRef(chapter),
        title: chapter.title,
        paragraphs: result.paragraphs.map((p) => ({
          stableParagraphId: p.stableParagraphId,
          sourceText: p.sourceText,
          translatedText: p.translatedText,
        })),
        mode: 'translation' as const,
      };
      if (!canCopyChapter(payload)) {
        onError(t('translation.copyEmptyChapter'));
        return;
      }
      await copyChapterToClipboard(payload);
      onMessage(t('translation.chapterCopied', { n: String(chapterRef(chapter)) }));
    } catch {
      onError(t('translation.copyFailed'));
    }
  };

  const exportChapterFile = async (
    chapter: ChapterSummaryDto,
    format: Extract<NovelExportFormat, 'txt' | 'docx'>,
  ) => {
    try {
      await window.novelTrans.portability.exportChapter({
        projectId,
        chapterNumber: chapterRef(chapter),
        chapterTitle: chapter.title,
        format,
        editionId,
      });
      onMessage(t('translation.exportChapterOk', { n: String(chapterRef(chapter)) }));
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    }
  };

  const retranslateChapter = async (chapter: ChapterSummaryDto) => {
    try {
      await window.novelTrans.editor.retranslateChapter({
        projectId,
        chapterId: chapter.id,
      });
      onMessage(t('translation.jobQueued'));
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    }
  };

  const columns = [
    {
      key: 'chapter',
      header: t('chaptersPage.colChapter'),
      width: '5rem',
      render: (ch: ChapterSummaryDto) => chapterLabel(ch),
    },
    {
      key: 'title',
      header: t('chaptersPage.colTitle'),
      render: (ch: ChapterSummaryDto) => ch.title ?? '—',
    },
    {
      key: 'source',
      header: t('chaptersPage.colSource'),
      width: '8rem',
      render: (ch: ChapterSummaryDto) => t(sourceStatusLabelKey(ch.sourceStatus)),
    },
    {
      key: 'translation',
      header: t('chaptersPage.colTranslation'),
      width: '9rem',
      render: (ch: ChapterSummaryDto) => {
        const key = resolveChapterDisplayStatus(ch, translatingNumbers);
        return t(`chaptersPage.status.${key}`);
      },
    },
    {
      key: 'updated',
      header: t('chaptersPage.colUpdated'),
      width: '9rem',
      render: (ch: ChapterSummaryDto) =>
        ch.updatedAt
          ? new Date(ch.updatedAt).toLocaleString('vi-VN', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '—',
    },
    {
      key: 'actions',
      header: '',
      width: '2.5rem',
      render: (ch: ChapterSummaryDto) => (
        <IconButton
          label={t('common.moreActions')}
          onClick={(e) => {
            e.stopPropagation();
            setMenuState({ chapterId: ch.id, anchor: e.currentTarget });
          }}
        >
          <MoreHorizontal size={16} />
        </IconButton>
      ),
    },
  ];

  return (
    <section className="chapter-list-section">
      <div className="chapter-list-toolbar">
        <SearchInput
          placeholder={t('actions.search')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
        />
        <Select
          value={statusFilter}
          aria-label={t('chaptersPage.filterStatus')}
          onChange={(e) => {
            setStatusFilter(e.target.value as StatusFilter);
          }}
        >
          <option value="all">{t('chaptersPage.filterAll')}</option>
          <option value="untranslated">{t('chaptersPage.status.untranslated')}</option>
          <option value="translated">{t('chaptersPage.status.translated')}</option>
          <option value="translating">{t('chaptersPage.status.translating')}</option>
          <option value="source_changed">{t('chaptersPage.status.source_changed')}</option>
          <option value="needs_attention">{t('chaptersPage.status.needs_attention')}</option>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="muted">{t('chaptersPage.emptyList')}</p>
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(row) => row.id}
          onRowClick={(row) => {
            openInTranslator(row);
          }}
        />
      )}

      {menuChapter && menuAnchorRef.current ? (
        <DropdownMenu
          open={menuState != null}
          onOpenChange={(open) => {
            if (!open) setMenuState(null);
          }}
          anchorRef={menuAnchorRef}
          className="translation-menu"
          placement="bottom-end"
          minWidth={220}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuState(null);
              openInTranslator(menuChapter);
            }}
          >
            {t('chaptersPage.openInTranslator')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setMenuState(null);
              void copyTranslation(menuChapter);
            }}
          >
            {t('translation.copyTranslation')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setMenuState(null);
              void exportChapterFile(menuChapter, 'txt');
            }}
          >
            {t('translation.exportTxt')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setMenuState(null);
              void exportChapterFile(menuChapter, 'docx');
            }}
          >
            {t('translation.exportDocx')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setMenuState(null);
              void retranslateChapter(menuChapter);
            }}
          >
            {t('actions.retranslate')}
          </button>
        </DropdownMenu>
      ) : null}
    </section>
  );
}
