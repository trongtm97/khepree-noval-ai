import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ProjectDto } from '@shared/schemas/import';
import type { ChapterSummaryDto } from '@shared/schemas/translation-pack';
import type { JobDto } from '@shared/schemas/job';
import { EDITOR_AUTOSAVE_MS } from '@shared/constants/translation-editor';
import { useEditorStore } from '../../../stores/editor-store';
import { useT } from '../../../i18n';
import { Button, Skeleton } from '../../../components/ui';
import { useUiShellStore } from '../../../stores/ui-shell-store';
import {
  evaluateTranslatePreflight,
  evaluateJobWatchTick,
  isJobWatchTimedOut,
  jobWatchProgressKey,
  type TranslatePreflightReason,
} from '../../../utils/translate-preflight';
import {
  mapEnsureActions,
  runEnsureTranslateReady,
  type EnsureCta,
} from '../../../utils/ensure-translate-ready';
import { confirmDangerous } from '../../../utils/confirm-dangerous';
import { chapterRef } from '../../../components/translation/chapter-utils';
import { TranslationCommandBar } from '../../../components/translation/TranslationCommandBar';
import { TranslationSearchOverlay } from '../../../components/translation/TranslationSearchOverlay';
import { TranslationWorkspace } from '../../../components/translation/TranslationWorkspace';
import {
  findNextIssueIndex,
  findNextUntranslatedIndex,
  translatingNumbersFromJob,
} from '../../../utils/chapter-navigator';
import { getLanguageProfile } from '@shared/constants/language-profile';
import type { ChapterCopyMode, ChapterParagraphInput } from '@shared/utils/chapter-export-text';
import type { NovelExportFormat } from '@shared/constants/portability';
import { useNotificationStore } from '../../../stores/notification-store';
import { useTranslationWorkspaceStore } from '../../../stores/translation-workspace-store';
import {
  canCopyChapter,
  copyChapterToClipboard,
} from '../../../services/chapter-clipboard-service';
import { exportChapter, exportChapterRange, parseExportDirectoryError } from '../../../services/chapter-export-service';
import { useExportDirectoryPersistPrompt } from '../../../components/export/ExportDirectorySetupDialog';
import { useTranslationSearch } from './useTranslationSearch';

/** Orchestrates translation workspace state, jobs, search, and layout. */
export function useTranslationEditorController() {
  const t = useT();
  const navigate = useNavigate();
  const { prompt: exportDirectoryPrompt, dialog: exportDirectoryDialog } =
    useExportDirectoryPersistPrompt();
  const { projectId: routeProjectId } = useParams();
  const setCurrentProject = useUiShellStore((s) => s.setCurrentProject);
  const storedProjectId = useUiShellStore((s) => s.currentProjectId);
  const lastTranslationChapterId = useUiShellStore((s) => s.lastTranslationChapterId);
  const setLastTranslationSession = useUiShellStore((s) => s.setLastTranslationSession);

  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [projectId, setProjectId] = useState(routeProjectId ?? '');
  const [chapters, setChapters] = useState<ChapterSummaryDto[]>([]);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const addNotification = useNotificationStore((s) => s.add);
  const {
    chapterRailCollapsed,
    contextCollapsed,
    focusMode,
    searchOpen,
    chapterRailWidth,
    contextWidth,
    toggleChapterRail,
    toggleContext,
    toggleFocusMode,
    setFocusMode,
    setSearchOpen,
  } = useTranslationWorkspaceStore();
  const [enqueueBusy, setEnqueueBusy] = useState(false);
  const [preparePhase, setPreparePhase] = useState(false);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(() => new Set());
  const selectAnchorRef = useRef<number | null>(null);
  const [, setPreflightReason] = useState<TranslatePreflightReason | null>(null);
  const [errorAction, setErrorAction] = useState<{ label: string; to: string } | null>(null);
  const [ensureCtas, setEnsureCtas] = useState<EnsureCta[]>([]);
  const [jobWatchMessage, setJobWatchMessage] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<JobDto | null>(null);

  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const watchCancel = useRef<AbortController | null>(null);

  const {
    chapterId,
    paragraphs,
    activeParagraphId,
    dirty,
    saveStatus,
    context,
    setChapter,
    setActiveParagraph,
    updateDraft,
    markSaving,
    markSaved,
    markSaveError,
    setContext,
    recordUndo,
    applyUndo,
    applyRedo,
  } = useEditorStore();

  const loadChapter = useCallback(
    async (pid: string, cid: string, cnum: number) => {
      const result = await window.novelTrans.editor.getChapter({ projectId: pid, chapterId: cid });
      setChapter(pid, cid, cnum, result.paragraphs);
      const ctx = await window.novelTrans.editor.getContext({
        projectId: pid,
        chapterNumber: cnum,
      });
      setContext(ctx);
    },
    [setChapter, setContext],
  );

  const refreshPreflight = useCallback(async () => {
    try {
      const [workersRes, accountsRes, aiRes, resolved] = await Promise.all([
        window.novelTrans.jobs.workers(),
        window.novelTrans.accounts.list(),
        window.novelTrans.aiAccounts.list({}),
        projectId
          ? window.novelTrans.projects.resolveWorker({
              projectId,
              purpose: 'translation',
            })
          : Promise.resolve(null),
      ]);
      const workers = workersRes.workers.map((w) => ({
        health: w.health,
        accountId: w.accountId,
      }));
      const workerAccountId = resolved?.accountId ?? null;
      let notebookStatus: string | null = null;
      if (projectId && workerAccountId) {
        const nb = await window.novelTrans.notebook.get(projectId, workerAccountId);
        notebookStatus = nb.mapping?.status ?? null;
      }
      const result = evaluateTranslatePreflight({
        hasProject: Boolean(projectId),
        hasChapter: chapters.length > 0,
        paragraphCount: paragraphs.length,
        workers,
        googleAccounts: accountsRes.accounts.map((a) => ({
          id: a.id,
          status: a.status,
          workerEnabled: a.workerEnabled,
        })),
        aiAccounts: aiRes.accounts.map((a) => ({ status: a.status })),
        notebookStatus,
        resolvedWorkerAccountId: workerAccountId,
      });
      setPreflightReason(result.ok ? null : result.reason);
    } catch {
      setPreflightReason('no_channel');
    }
  }, [projectId, chapters.length, paragraphs.length]);

  useEffect(() => {
    void refreshPreflight();
  }, [refreshPreflight]);

  useEffect(() => {
    return () => {
      watchCancel.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (routeProjectId) setProjectId(routeProjectId);
  }, [routeProjectId]);

  useEffect(() => {
    void window.novelTrans.projects
      .list()
      .then((result) => {
        setProjects(result.projects);
        if (routeProjectId) {
          setProjectId(routeProjectId);
          return;
        }
        const fromStore = storedProjectId
          ? result.projects.find((p) => p.id === storedProjectId)?.id
          : undefined;
        const preferred = fromStore ?? result.projects.at(0)?.id ?? '';
        if (preferred) setProjectId(preferred);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [routeProjectId, storedProjectId, t]);

  useEffect(() => {
    if (!projectId) return;
    const project = projects.find((p) => p.id === projectId);
    if (project) {
      setCurrentProject(project.id, project.title);
      setLastTranslationSession(project.id);
    }
    void window.novelTrans.pack
      .listChapters(projectId)
      .then((result) => {
        setChapters(result.chapters);
        const savedIdx = lastTranslationChapterId
          ? result.chapters.findIndex((c) => c.id === lastTranslationChapterId)
          : -1;
        setChapterIndex(savedIdx >= 0 ? savedIdx : 0);
        setSelectedChapterIds(new Set());
        selectAnchorRef.current = null;
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
      });
  }, [projectId, projects, setCurrentProject, setLastTranslationSession, lastTranslationChapterId, t]);

  useEffect(() => {
    if (!projectId || chapters.length === 0) return;
    const chapter = chapters[chapterIndex] ?? chapters[0];
    setLastTranslationSession(projectId, chapter.id);
  }, [projectId, chapters, chapterIndex, setLastTranslationSession]);

  useEffect(() => {
    if (chapters.length === 0 || !projectId) return;
    const chapter = chapters[chapterIndex] ?? chapters[0];
    setError(null);
    void loadChapter(projectId, chapter.id, chapterRef(chapter)).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    });
  }, [projectId, chapters, chapterIndex, loadChapter, t]);

  useEffect(() => {
    if (!projectId || chapters.length === 0) return;
    const neighbors = [chapters[chapterIndex - 1], chapters[chapterIndex + 1]].filter(
      (ch): ch is ChapterSummaryDto => Boolean(ch),
    );
    if (neighbors.length === 0) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      for (const ch of neighbors) {
        void window.novelTrans.editor.getChapter({ projectId, chapterId: ch.id });
      }
    };
    const usedIdle = typeof window.requestIdleCallback === 'function';
    const handle = usedIdle ? window.requestIdleCallback(run) : window.setTimeout(run, 250);
    return () => {
      cancelled = true;
      if (usedIdle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [projectId, chapterIndex, chapters]);

  const scheduleSave = useCallback(
    (stableId: string, text: string) => {
      const existing = saveTimers.current.get(stableId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        saveTimers.current.delete(stableId);
        markSaving();
        void window.novelTrans.editor
          .saveParagraph({
            projectId,
            chapterId,
            stableParagraphId: stableId,
            translatedText: text,
          })
          .then((result) => {
            markSaved(stableId, result.paragraph, result.savedAt);
          })
          .catch(() => {
            markSaveError();
          });
      }, EDITOR_AUTOSAVE_MS);
      saveTimers.current.set(stableId, timer);
    },
    [projectId, chapterId, markSaving, markSaved, markSaveError],
  );

  const handleDraftChange = useCallback(
    (stableId: string, text: string, previous: string) => {
      recordUndo(stableId, previous, text);
      updateDraft(stableId, text);
      scheduleSave(stableId, text);
    },
    [recordUndo, updateDraft, scheduleSave],
  );

  const {
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
  } = useTranslationSearch({
    paragraphs,
    dirty,
    setActiveParagraph,
    recordUndo,
    updateDraft,
    scheduleSave,
    searchOpen,
    setSearchOpen,
  });

  const goChapter = useCallback(
    (delta: number) => {
      setChapterIndex((idx) => Math.max(0, Math.min(chapters.length - 1, idx + delta)));
    },
    [chapters.length],
  );

  const watchJob = async (jobId: string, chapter: ChapterSummaryDto) => {
    setJobWatchMessage(t('translation.jobQueued'));
    const ac = new AbortController();
    watchCancel.current = ac;
    const isWatchAborted = () => ac.signal.aborted;
    const stallHintAfterPolls = 180;
    let stallPolls = 0;
    let lastProgressKey: string | null = null;
    let lastState = '';
    let resolved = false;
    for (;;) {
      await new Promise((resolve) => {
        setTimeout(resolve, 2000);
      });
      if (isWatchAborted()) break;

      const snapshot = await window.novelTrans.jobs.get(jobId);
      const job = snapshot.job;
      setActiveJob(job);
      lastState = job.state;
      const progressKey = jobWatchProgressKey(job);
      if (progressKey !== lastProgressKey) {
        lastProgressKey = progressKey;
        stallPolls = 0;
      } else {
        stallPolls += 1;
      }

      const tick = evaluateJobWatchTick(job.state);
      if (tick === 'failure') {
        setJobWatchMessage(null);
        setActiveJob(null);
        if (job.state === 'NEEDS_ATTENTION') {
          setError(t('translation.jobNeedsAttention', { detail: job.error ?? job.state }));
        } else {
          setError(t('translation.jobFailed', { detail: job.error ?? job.state }));
        }
        setErrorAction({ label: t('translation.openJobs'), to: '/jobs' });
        resolved = true;
        break;
      }
      if (tick !== 'pending') {
        setJobWatchMessage(null);
        setActiveJob(null);
        const candidates = job.progress?.learning?.candidatesCreated ?? 0;
        if (candidates > 0) {
          addNotification({
            kind: 'INFO',
            title: t('translation.learningCandidatesHint', { count: String(candidates) }),
            description: '',
            toast: true,
          });
          setErrorAction({
            label: t('translation.openTermCandidates'),
            to: projectId ? `/projects/${projectId}/terms` : '/terms',
          });
        } else if (job.progress?.learning?.emptyDeltas) {
          addNotification({
            kind: 'INFO',
            title: t('translation.learningEmptyHint'),
            description: '',
            toast: true,
          });
          setErrorAction(null);
        } else {
          setErrorAction(null);
        }
        await loadChapter(projectId, chapter.id, chapterRef(chapter));
        resolved = true;
        break;
      }
      const longWait = isJobWatchTimedOut(stallPolls, stallHintAfterPolls, lastState);
      if (longWait) {
        setJobWatchMessage(t('translation.jobRunningSlow', { detail: '' }).trim());
      } else {
        setJobWatchMessage(null);
      }
    }
    if (!resolved && !isWatchAborted()) {
      setJobWatchMessage(null);
      setActiveJob(null);
      setError(t('translation.jobWatchTimeout', { state: lastState }));
      setErrorAction({ label: t('translation.openJobs'), to: '/jobs' });
    }
  };

  const applyEnsureFailure = (result: {
    message: string;
    actions: EnsureCta['action'][];
    workerAccountId: string | null;
  }) => {
    setError(result.message);
    setEnsureCtas(
      mapEnsureActions({
        actions: result.actions,
        workerAccountId: result.workerAccountId,
      }),
    );
    setErrorAction(null);
  };

  const handleEnsureCta = async (cta: EnsureCta) => {
    try {
      if (cta.action === 'check_google') {
        if (cta.accountId) {
          await window.novelTrans.accounts.openBrowser(cta.accountId, 'gemini');
        }
        navigate('/accounts');
        return;
      }
      if (cta.action === 'open_notebook') {
        if (cta.accountId) {
          await window.novelTrans.accounts.openBrowser(cta.accountId, 'notebook');
        } else if (projectId) {
          navigate(`/projects/${projectId}/ai-memory`);
        }
        return;
      }
      if (projectId) navigate(`/projects/${projectId}/ai-memory`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    }
  };

  const ensureReadyForTranslate = async (): Promise<{
    ok: boolean;
    workerAccountId: string | null;
  }> => {
    if (!projectId) {
      setError(t('translation.selectProject'));
      setEnsureCtas([]);
      return { ok: false, workerAccountId: null };
    }
    setPreparePhase(true);
    setJobWatchMessage(t('translation.ensuringReady'));
    setEnsureCtas([]);
    try {
      const result = await runEnsureTranslateReady({ projectId });
      setJobWatchMessage(result.message);
      if (!result.ok) {
        applyEnsureFailure(result);
        return { ok: false, workerAccountId: result.workerAccountId };
      }
      if (result.needsAssisted || result.actions.length > 0) {
        setEnsureCtas(
          mapEnsureActions({
            actions: result.actions,
            workerAccountId: result.workerAccountId,
          }),
        );
      }
      void refreshPreflight();
      return { ok: true, workerAccountId: result.workerAccountId };
    } finally {
      setPreparePhase(false);
    }
  };

  const enqueueTranslateCurrent = async () => {
    const chapter = chapters.at(chapterIndex);
    if (!projectId || chapter === undefined) {
      setError(t('translation.selectChapter'));
      setErrorAction(null);
      setEnsureCtas([]);
      return;
    }
    if (paragraphs.length === 0) {
      setError(t('translation.noParagraphs'));
      setErrorAction(null);
      setEnsureCtas([]);
      return;
    }
    setEnqueueBusy(true);
    setError(null);
    setErrorAction(null);
    setEnsureCtas([]);
    setJobWatchMessage(null);
    setActiveJob(null);
    try {
      const ensured = await ensureReadyForTranslate();
      if (!ensured.ok) return;

      setJobWatchMessage(t('translation.translating'));
      const queued = await window.novelTrans.jobs.enqueue({
        projectId,
        chapterFrom: chapterRef(chapter),
        chapterTo: chapterRef(chapter),
        sourceParagraphIds: paragraphs.map((p) => p.stableParagraphId),
        batchParagraphs: paragraphs.map((p) => ({
          paragraphId: p.stableParagraphId,
          sourceText: p.sourceText,
        })),
      });
      setActiveJob(queued.job);
      await watchJob(queued.job.id, chapter);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setEnqueueBusy(false);
      setPreparePhase(false);
      setJobWatchMessage(null);
    }
  };

  const enqueueNovelRange = async (opts: {
    chapterFrom?: number;
    chapterTo?: number;
    chapterIds?: string[];
  }) => {
    if (!projectId) {
      setError(t('translation.selectProject'));
      return;
    }
    if (chapters.length === 0) {
      setError(t('translation.noChapters'));
      return;
    }

    const rangeLabel =
      opts.chapterFrom != null || opts.chapterTo != null
        ? ` (${opts.chapterFrom ?? '…'}–${opts.chapterTo ?? '…'})`
        : opts.chapterIds
          ? ` (${opts.chapterIds.length})`
          : '';
    const ok = confirmDangerous(t('translation.novelConfirm', { range: rangeLabel }));
    if (!ok) return;

    setEnqueueBusy(true);
    setError(null);
    setErrorAction(null);
    setEnsureCtas([]);
    setJobWatchMessage(null);
    setActiveJob(null);
    try {
      const ensured = await ensureReadyForTranslate();
      if (!ensured.ok) return;

      const result = await window.novelTrans.jobs.enqueueNovel({
        projectId,
        chapterFrom: opts.chapterFrom,
        chapterTo: opts.chapterTo,
        chapterIds: opts.chapterIds,
        skipTranslated: true,
      });

      if (result.queuedCount === 0) {
        setError(t('translation.novelNothing'));
        return;
      }

      setJobWatchMessage(
        t('translation.novelQueued', {
          queued: String(result.queuedCount),
          skipped: String(result.skippedCount),
        }),
      );
      setErrorAction({ label: t('translation.openJobs'), to: '/jobs' });
      navigate('/jobs');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setEnqueueBusy(false);
      setPreparePhase(false);
    }
  };

  const enqueueNovelRangeRef = useRef(enqueueNovelRange);
  enqueueNovelRangeRef.current = enqueueNovelRange;

  const continueTranslate = async () => {
    const project = projects.find((p) => p.id === projectId);
    const chapter = chapters.at(chapterIndex);
    const from =
      project?.nextUntranslatedChapter ?? (chapter ? chapterRef(chapter) : undefined);
    await enqueueNovelRange({ chapterFrom: from });
  };

  const translateNext3 = async () => {
    const chapter = chapters.at(chapterIndex);
    if (!chapter) return;
    const from = chapterRef(chapter);
    await enqueueNovelRange({ chapterFrom: from, chapterTo: from + 2 });
  };

  const selectedIds = useMemo(() => Array.from(selectedChapterIds), [selectedChapterIds]);

  const translatingNumbers = useMemo(
    () => translatingNumbersFromJob(activeJob),
    // Ignore job.progress ticks so the chapter list does not rebuild on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identity is from/to/state
    [activeJob?.id, activeJob?.state, activeJob?.chapterFrom, activeJob?.chapterTo],
  );

  const goNextUntranslated = useCallback(() => {
    const next = findNextUntranslatedIndex(chapters, chapterIndex, translatingNumbers);
    if (next != null) setChapterIndex(next);
  }, [chapters, chapterIndex, translatingNumbers]);

  const goNextIssue = useCallback(() => {
    const next = findNextIssueIndex(chapters, chapterIndex, translatingNumbers);
    if (next != null) setChapterIndex(next);
  }, [chapters, chapterIndex, translatingNumbers]);

  const translateSelectedChapters = useCallback(() => {
    const ids = Array.from(selectedChapterIds);
    if (ids.length === 0) return;
    void enqueueNovelRangeRef.current({ chapterIds: ids });
  }, [selectedChapterIds]);

  const currentParagraphInputs = useMemo((): ChapterParagraphInput[] => {
    return paragraphs.map((p) => {
      const hasDraft = Object.hasOwn(dirty, p.stableParagraphId);
      return {
        stableParagraphId: p.stableParagraphId,
        sourceText: p.sourceText,
        translatedText: p.translatedText,
        ...(hasDraft ? { draftText: dirty[p.stableParagraphId] } : {}),
      };
    });
  }, [paragraphs, dirty]);

  const activeChapterSummary = chapters.at(chapterIndex) ?? null;

  const copyDisabled =
    !activeChapterSummary ||
    !canCopyChapter({
      chapterNumber: chapterRef(activeChapterSummary),
      title: activeChapterSummary.title ?? null,
      paragraphs: currentParagraphInputs,
      mode: 'translation',
    });

  const flushSaveInput = useCallback(
    () => ({
      projectId,
      chapterId,
      dirty,
      paragraphs,
      pendingTimers: saveTimers.current,
      onSaving: markSaving,
      onSaved: markSaved,
      onError: markSaveError,
    }),
    [projectId, chapterId, dirty, paragraphs, markSaving, markSaved, markSaveError],
  );

  const toastCopySuccess = useCallback(
    (chapterNum: number) => {
      addNotification({
        kind: 'SUCCESS',
        title: t('translation.chapterCopied', { n: String(chapterNum) }),
        description: '',
        toast: true,
      });
    },
    [addNotification, t],
  );

  const toastCopyFail = useCallback(() => {
    addNotification({
      kind: 'ERROR',
      title: t('translation.copyFailed'),
      description: '',
      toast: true,
    });
  }, [addNotification, t]);

  const handleCopy = useCallback(
    async (mode: ChapterCopyMode, chapter?: ChapterSummaryDto) => {
      const target = chapter ?? activeChapterSummary;
      if (!target) return;
      try {
        let paragraphInputs: ChapterParagraphInput[] = currentParagraphInputs;
        if (chapter && chapter.id !== chapterId) {
          const result = await window.novelTrans.editor.getChapter({
            projectId,
            chapterId: chapter.id,
          });
          paragraphInputs = result.paragraphs.map((p) => ({
            stableParagraphId: p.stableParagraphId,
            sourceText: p.sourceText,
            translatedText: p.translatedText,
          }));
        }
        const payload = {
          chapterNumber: chapterRef(target),
          title: target.title,
          paragraphs: paragraphInputs,
          mode,
        };
        if (!canCopyChapter(payload)) {
          addNotification({
            kind: 'WARNING',
            title: t('translation.copyEmptyChapter'),
            description: '',
            toast: true,
          });
          return;
        }
        await copyChapterToClipboard(payload);
        toastCopySuccess(chapterRef(target));
      } catch {
        toastCopyFail();
      }
    },
    [
      activeChapterSummary,
      currentParagraphInputs,
      chapterId,
      projectId,
      addNotification,
      t,
      toastCopySuccess,
      toastCopyFail,
    ],
  );

  const handleExport = useCallback(
    async (
      format: Extract<NovelExportFormat, 'txt' | 'docx'>,
      chapter?: ChapterSummaryDto,
    ) => {
      const target = chapter ?? activeChapterSummary;
      if (!projectId || !target) return;
      const project = projects.find((p) => p.id === projectId);
      const exportProjectTitle = project?.title ?? '';
      const exportEditionId = project?.activeEditionId ?? undefined;
      const isCurrent = !chapter || chapter.id === chapterId;
      try {
        const flushSave = isCurrent
          ? flushSaveInput()
          : {
              ...flushSaveInput(),
              dirty: {},
              pendingTimers: saveTimers.current,
            };
        const result = await exportChapter(
          {
            projectId,
            chapterNumber: chapterRef(target),
            chapterTitle: target.title,
            format,
            editionId: exportEditionId,
            flushSave,
            projectTitle: exportProjectTitle,
          },
          exportDirectoryPrompt,
        );
        addNotification({
          kind: 'SUCCESS',
          title: t('translation.exportChapterOk', { n: String(chapterRef(target)) }),
          description: result.filePath,
          toast: true,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '';
        const parsed = parseExportDirectoryError(msg);
        if (parsed.kind === 'save_failed') {
          setError(t('translation.exportSaveFailed'));
        } else if (parsed.kind === 'inaccessible') {
          setError(
            t('exportDirectory.inaccessible', { path: parsed.path ?? '' }),
          );
        } else if (parsed.kind !== 'canceled') {
          setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
        }
      }
    },
    [
      projectId,
      activeChapterSummary,
      chapterId,
      flushSaveInput,
      addNotification,
      t,
      projects,
      exportDirectoryPrompt,
    ],
  );

  const onChapterCopy = useCallback(
    (id: string, mode: ChapterCopyMode) => {
      const ch = chapters.find((c) => c.id === id);
      if (ch) void handleCopy(mode, ch);
    },
    [chapters, handleCopy],
  );

  const onChapterExport = useCallback(
    (id: string, format: Extract<NovelExportFormat, 'txt' | 'docx'>) => {
      const ch = chapters.find((c) => c.id === id);
      if (ch) void handleExport(format, ch);
    },
    [chapters, handleExport],
  );

  const handleExportSelected = useCallback(async () => {
    if (!projectId || selectedIds.length === 0) return;
    const project = projects.find((p) => p.id === projectId);
    const exportProjectTitle = project?.title ?? '';
    const exportEditionId = project?.activeEditionId ?? undefined;
    const nums = chapters
      .filter((c) => selectedChapterIds.has(c.id))
      .map((c) => chapterRef(c))
      .sort((a, b) => a - b);
    if (nums.length === 0) return;
    try {
      const result = await exportChapterRange(
        {
          projectId,
          chapterFrom: nums[0],
          chapterTo: nums[nums.length - 1],
          format: 'txt',
          editionId: exportEditionId,
          flushSave: flushSaveInput(),
          projectTitle: exportProjectTitle,
        },
        exportDirectoryPrompt,
      );
      addNotification({
        kind: 'SUCCESS',
        title: t('translation.exportSelectedOk', { count: String(nums.length) }),
        description: result.filePath,
        toast: true,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      const parsed = parseExportDirectoryError(msg);
      if (parsed.kind === 'save_failed') {
        setError(t('translation.exportSaveFailed'));
      } else if (parsed.kind === 'inaccessible') {
        setError(t('exportDirectory.inaccessible', { path: parsed.path ?? '' }));
      } else if (parsed.kind !== 'canceled') {
        setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
      }
    }
  }, [
    projectId,
    selectedIds.length,
    chapters,
    selectedChapterIds,
    flushSaveInput,
    addNotification,
    t,
    projects,
    exportDirectoryPrompt,
  ]);

  const handleOpenExportDirectory = useCallback(async () => {
    if (!projectId) return;
    const project = projects.find((p) => p.id === projectId);
    const exportEditionId = project?.activeEditionId ?? undefined;
    try {
      await window.novelTrans.portability.openExportDirectory({
        projectId,
        editionId: exportEditionId,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      const parsed = parseExportDirectoryError(msg);
      if (parsed.kind === 'inaccessible') {
        setError(t('exportDirectory.inaccessible', { path: parsed.path ?? '' }));
      } else {
        setError(err instanceof Error ? err.message : t('exportDirectory.openFailed'));
      }
    }
  }, [projectId, projects, t]);

  const exportSelectedChapters = useCallback(() => {
    void handleExportSelected();
  }, [handleExportSelected]);

  const openExportDirectory = useCallback(() => {
    void handleOpenExportDirectory();
  }, [handleOpenExportDirectory]);

  const handleChangeExportLocation = useCallback(() => {
    if (!projectId) return;
    navigate(`/projects/${projectId}/export`);
  }, [navigate, projectId]);

  const toggleChapterSelect = useCallback((idx: number, shiftKey: boolean) => {
    const chapter = chapters.at(idx);
    if (!chapter) return;
    setSelectedChapterIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && selectAnchorRef.current != null) {
        const from = Math.min(selectAnchorRef.current, idx);
        const to = Math.max(selectAnchorRef.current, idx);
        for (let i = from; i <= to; i += 1) {
          const id = chapters[i]?.id;
          if (id) next.add(id);
        }
      } else if (next.has(chapter.id)) {
        next.delete(chapter.id);
      } else {
        next.add(chapter.id);
      }
      return next;
    });
    selectAnchorRef.current = idx;
  }, [chapters]);

  const selectAllChapters = useCallback(() => {
    setSelectedChapterIds(new Set(chapters.map((c) => c.id)));
    selectAnchorRef.current = chapters.length > 0 ? 0 : null;
  }, [chapters]);

  const clearChapterSelection = useCallback(() => {
    setSelectedChapterIds(new Set());
    selectAnchorRef.current = null;
  }, []);

  const clearSelectedTranslations = async () => {
    if (!projectId || selectedIds.length === 0) return;
    const ok = confirmDangerous(
      t('translation.clearSelectedConfirm', { count: String(selectedIds.length) }),
    );
    if (!ok) return;
    setEnqueueBusy(true);
    setError(null);
    try {
      const result = await window.novelTrans.editor.clearChaptersTranslations({
        projectId,
        chapterIds: selectedIds,
      });
      setJobWatchMessage(
        t('translation.clearSelectedDone', {
          deleted: String(result.deleted),
          locked: String(result.keptLocked),
          count: String(result.chapterIds.length),
        }),
      );
      const current = chapters.at(chapterIndex);
      if (current && selectedChapterIds.has(current.id)) {
        await loadChapter(projectId, current.id, chapterRef(current));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setEnqueueBusy(false);
    }
  };

  const retranslateSelectedChapters = async () => {
    if (!projectId || selectedIds.length === 0) return;
    const ok = confirmDangerous(
      t('translation.retranslateSelectedConfirm', { count: String(selectedIds.length) }),
    );
    if (!ok) return;
    setEnqueueBusy(true);
    setError(null);
    setErrorAction(null);
    setEnsureCtas([]);
    try {
      const pre = await ensureReadyForTranslate();
      if (!pre.ok) return;
      const result = await window.novelTrans.editor.retranslateChapters({
        projectId,
        chapterIds: selectedIds,
      });
      if (result.jobs.length === 0) {
        setError(t('translation.novelNothing'));
        return;
      }
      setJobWatchMessage(
        t('translation.novelQueued', {
          queued: String(result.jobs.length),
          skipped: String(0),
        }),
      );
      setErrorAction({ label: t('translation.openJobs'), to: '/jobs' });
      navigate('/jobs');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setEnqueueBusy(false);
      setPreparePhase(false);
    }
  };

  const clearChapterTranslations = async () => {
    const chapter = chapters.at(chapterIndex);
    if (!projectId || chapter === undefined) return;
    const lockedCount = paragraphs.filter((p) => p.humanLocked).length;
    const ok = confirmDangerous(
      t('translation.clearChapterConfirm', { locked: String(lockedCount) }),
    );
    if (!ok) return;
    setEnqueueBusy(true);
    setError(null);
    try {
      const result = await window.novelTrans.editor.clearChapterTranslations({
        projectId,
        chapterId: chapter.id,
      });
      setChapter(projectId, chapter.id, chapterRef(chapter), result.chapter.paragraphs);
      setJobWatchMessage(
        t('translation.clearChapterDone', {
          deleted: String(result.deleted),
          locked: String(result.keptLocked),
        }),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setEnqueueBusy(false);
    }
  };

  const retranslateChapter = async (target?: ChapterSummaryDto) => {
    const chapter = target ?? chapters.at(chapterIndex);
    if (!projectId || chapter === undefined) {
      setError(t('translation.selectChapter'));
      return;
    }
    const lockedCount = paragraphs.filter((p) => p.humanLocked).length;
    const ok = confirmDangerous(
      t('translation.retranslateConfirm', { locked: String(lockedCount) }),
    );
    if (!ok) return;

    setEnqueueBusy(true);
    setError(null);
    setErrorAction(null);
    setEnsureCtas([]);
    setActiveJob(null);
    try {
      const ensured = await ensureReadyForTranslate();
      if (!ensured.ok) return;
      const result = await window.novelTrans.editor.retranslateChapter({
        projectId,
        chapterId: chapter.id,
      });
      setChapter(projectId, chapter.id, chapterRef(chapter), result.chapter.paragraphs);
      await watchJob(result.job.id, chapter);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setEnqueueBusy(false);
      setPreparePhase(false);
      setJobWatchMessage(null);
    }
  };

  const retranslateChapterRef = useRef(retranslateChapter);
  retranslateChapterRef.current = retranslateChapter;

  const onChapterRetranslate = useCallback((id: string) => {
    const ch = chapters.find((c) => c.id === id);
    if (!ch) return;
    const idx = chapters.findIndex((c) => c.id === id);
    if (idx >= 0) setChapterIndex(idx);
    void retranslateChapterRef.current(ch);
  }, [chapters]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key === 's') {
        event.preventDefault();
        for (const [stableId, text] of Object.entries(dirty)) {
          void window.novelTrans.editor
            .saveParagraph({
              projectId,
              chapterId,
              stableParagraphId: stableId,
              translatedText: text,
            })
            .then((result) => {
              markSaved(stableId, result.paragraph, result.savedAt);
            })
            .catch(() => {
              markSaveError();
            });
        }
      }
      if (mod && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        applyUndo();
      }
      if (mod && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
        event.preventDefault();
        applyRedo();
      }
      if (mod && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        if (event.shiftKey) {
          toggleFocusMode();
        } else {
          openFind();
        }
        return;
      }
      if (mod && event.key.toLowerCase() === 'h' && !event.shiftKey) {
        event.preventDefault();
        openReplace();
        return;
      }
      if (mod && event.shiftKey && event.key === 'B') {
        event.preventDefault();
        toggleChapterRail();
        return;
      }
      if (event.key === 'Escape' && searchOpen) {
        event.preventDefault();
        closeSearch();
        return;
      }
      if (focusMode && event.key === 'Escape') {
        event.preventDefault();
        setFocusMode(false);
        return;
      }
      if (event.altKey && event.key === 'ArrowUp') {
        event.preventDefault();
        if (event.shiftKey) goNextIssue();
        else goChapter(-1);
        return;
      }
      if (event.altKey && event.key === 'ArrowDown') {
        event.preventDefault();
        if (event.shiftKey) goNextUntranslated();
        else goChapter(1);
        return;
      }
      if (mod && event.key === 'g' && searchMatches.length > 0) {
        event.preventDefault();
        nextMatch();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [
    applyRedo,
    applyUndo,
    chapterId,
    dirty,
    goChapter,
    goNextUntranslated,
    goNextIssue,
    markSaveError,
    markSaved,
    projectId,
    searchMatches.length,
    focusMode,
    setFocusMode,
    openFind,
    openReplace,
    nextMatch,
    toggleFocusMode,
    toggleChapterRail,
    searchOpen,
    closeSearch,
  ]);

  const currentChapter = chapters.at(chapterIndex) ?? null;
  const project = projects.find((p) => p.id === projectId) ?? null;
  const projectTitle = project?.title ?? '';
  const sourceLanguage = project?.sourceLanguage ?? 'zh-Hans';
  const targetLanguage = project?.targetLanguage ?? 'vi';
  const sourceProfile = getLanguageProfile(sourceLanguage);
  const targetProfile = getLanguageProfile(targetLanguage);
  const chapterNumber = currentChapter ? currentChapter.chapterNumber : null;
  const activeEditionId = project?.activeEditionId ?? undefined;

  if (loading) {
    return (
      <div className="translation-editor-page translation-editor-page--loading">
        <Skeleton height={40} />
        <Skeleton height={320} />
      </div>
    );
  }

  return (
    <div
      className={`editor-page translation-editor-page${focusMode ? ' translation-editor-page--focus' : ''}`}
    >
      {exportDirectoryDialog}
      <TranslationCommandBar
        projects={projects}
        projectId={projectId}
        projectTitle={projectTitle}
        sourceLanguage={sourceLanguage}
        targetLanguage={targetLanguage}
        activeEditionId={activeEditionId}
        chapters={chapters}
        chapterIndex={chapterIndex}
        chapterNumber={chapterNumber}
        busy={enqueueBusy}
        preparing={preparePhase}
        saveStatus={saveStatus}
        selectedCount={selectedIds.length}
        copyDisabled={copyDisabled}
        activeJob={activeJob}
        preparingMessage={jobWatchMessage}
        onProjectChange={(id) => {
          navigate(`/projects/${id}/translate`);
        }}
        onChapterChange={setChapterIndex}
        onCopy={(mode) => {
          void handleCopy(mode);
        }}
        onExport={(format) => {
          void handleExport(format);
        }}
        onExportSelected={selectedIds.length > 1 ? exportSelectedChapters : undefined}
        onOpenExportDirectory={openExportDirectory}
        onChangeExportLocation={handleChangeExportLocation}
        onContinue={() => {
          void continueTranslate();
        }}
        onTranslateCurrent={() => {
          void enqueueTranslateCurrent();
        }}
        onTranslateNext3={() => {
          void translateNext3();
        }}
        onTranslateRemaining={() => {
          void enqueueNovelRange({});
        }}
        onTranslateRange={(from, to) => {
          void enqueueNovelRange({ chapterFrom: from, chapterTo: to });
        }}
        onClearTranslations={() => {
          void (selectedIds.length > 0
            ? clearSelectedTranslations()
            : clearChapterTranslations());
        }}
        onRetranslate={() => {
          void (selectedIds.length > 0
            ? retranslateSelectedChapters()
            : retranslateChapter());
        }}
        onToggleFocusMode={toggleFocusMode}
        onPrevChapter={() => {
          goChapter(-1);
        }}
        onNextChapter={() => {
          goChapter(1);
        }}
        onNextUntranslated={goNextUntranslated}
        onNextIssue={goNextIssue}
        onSpreadsheetImported={() => {
          if (chapters.length === 0) return;
          const chapter = chapters[chapterIndex] ?? chapters[0];
          void loadChapter(projectId, chapter.id, chapterRef(chapter)).then(() => {
            if (activeParagraphId) setActiveParagraph(activeParagraphId);
          });
        }}
      />

      {error ? (
        <div className="banner banner-error translation-action-banner">
          {error}
          {ensureCtas.map((cta) => (
            <Button
              key={cta.action}
              size="sm"
              onClick={() => {
                void handleEnsureCta(cta);
              }}
            >
              {t(cta.labelKey)}
            </Button>
          ))}
          {errorAction ? (
            <Button
              size="sm"
              onClick={() => {
                navigate(errorAction.to);
              }}
            >
              {errorAction.label}
            </Button>
          ) : null}
        </div>
      ) : null}

      <TranslationSearchOverlay
        open={searchOpen}
        showReplace={showReplace}
        searchQuery={searchQuery}
        replaceQuery={replaceQuery}
        matchIndex={searchMatchIndex}
        matchCount={searchMatches.length}
        onSearchChange={setSearchQuery}
        onReplaceChange={setReplaceQuery}
        onToggleReplace={() => {
          setShowReplace((v) => !v);
        }}
        onReplaceAll={runReplaceAll}
        onNextMatch={nextMatch}
        onClose={closeSearch}
      />

      <TranslationWorkspace
        focusMode={focusMode}
        chapterRailCollapsed={chapterRailCollapsed}
        contextCollapsed={contextCollapsed}
        chapterRailWidth={chapterRailWidth}
        contextWidth={contextWidth}
        chapters={chapters}
        chapterIndex={chapterIndex}
        selectedChapterIds={selectedChapterIds}
        enqueueBusy={enqueueBusy}
        translatingNumbers={translatingNumbers}
        paragraphs={paragraphs}
        activeParagraphId={activeParagraphId}
        dirty={dirty}
        searchMatchIndex={searchMatchIndex}
        searchMatches={searchMatches}
        projectId={projectId}
        chapterId={chapterId}
        sourceLabel={sourceProfile.nativeName}
        targetLabel={targetProfile.nativeName}
        sourceDirection={sourceProfile.direction}
        targetDirection={targetProfile.direction}
        context={context}
        onToggleChapterRail={toggleChapterRail}
        onSelectChapter={setChapterIndex}
        onToggleChapterSelect={toggleChapterSelect}
        onSelectAllChapters={selectAllChapters}
        onClearChapterSelection={clearChapterSelection}
        onTranslateSelected={translateSelectedChapters}
        onExportSelected={exportSelectedChapters}
        onOpenExportDirectory={openExportDirectory}
        onNextUntranslated={goNextUntranslated}
        onNextIssue={goNextIssue}
        onChapterCopy={onChapterCopy}
        onChapterExport={onChapterExport}
        onChapterRetranslate={onChapterRetranslate}
        onSelectParagraph={setActiveParagraph}
        onDraftChange={handleDraftChange}
        onEditorReverted={() => {
          if (chapters.length === 0) return;
          const chapter = chapters[chapterIndex] ?? chapters[0];
          void loadChapter(projectId, chapterId, chapterRef(chapter)).then(() => {
            if (activeParagraphId) setActiveParagraph(activeParagraphId);
          });
        }}
        onToggleContext={toggleContext}
      />
    </div>
  );
}
