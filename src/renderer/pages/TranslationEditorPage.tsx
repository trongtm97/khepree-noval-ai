import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ProjectDto } from '@shared/schemas/import';
import type { ChapterSummaryDto } from '@shared/schemas/translation-pack';
import type { JobDto } from '@shared/schemas/job';
import { EDITOR_AUTOSAVE_MS } from '@shared/constants/translation-editor';
import { useEditorStore } from '../stores/editor-store';
import { findMatches, applyReplaceAll } from '../utils/editor-search';
import { useT } from '../i18n';
import { Button, Skeleton } from '../components/ui';
import { useUiShellStore } from '../stores/ui-shell-store';
import {
  evaluateTranslatePreflight,
  evaluateJobWatchTick,
  isJobWatchTimedOut,
  jobWatchProgressKey,
  type TranslatePreflightReason,
} from '../utils/translate-preflight';
import {
  mapEnsureActions,
  runEnsureTranslateReady,
  type EnsureCta,
} from '../utils/ensure-translate-ready';
import { confirmDangerous } from '../utils/confirm-dangerous';
import { chapterRef } from '../components/translation/chapter-utils';
import { TranslationToolbar } from '../components/translation/TranslationToolbar';
import { ChapterNavigator } from '../components/translation/ChapterNavigator';
import { TranslationWorkspace } from '../components/translation/TranslationWorkspace';
import { TranslationJobBanner } from '../components/translation/TranslationJobBanner';
import { TranslationContextStatus } from '../components/translation/TranslationContextStatus';
import { EditorSearchBar } from '../components/translation/EditorSearchBar';

export function TranslationEditorPage() {
  const t = useT();
  const navigate = useNavigate();
  const { projectId: routeProjectId } = useParams();
  const setCurrentProject = useUiShellStore((s) => s.setCurrentProject);
  const storedProjectId = useUiShellStore((s) => s.currentProjectId);

  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [projectId, setProjectId] = useState(routeProjectId ?? '');
  const [chapters, setChapters] = useState<ChapterSummaryDto[]>([]);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [searchMatchIndex, setSearchMatchIndex] = useState<number | null>(null);
  const [showReplace, setShowReplace] = useState(false);
  const [enqueueBusy, setEnqueueBusy] = useState(false);
  const [preparePhase, setPreparePhase] = useState(false);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(() => new Set());
  const selectAnchorRef = useRef<number | null>(null);
  const [preflightReason, setPreflightReason] = useState<TranslatePreflightReason | null>(null);
  const [errorAction, setErrorAction] = useState<{ label: string; to: string } | null>(null);
  const [ensureCtas, setEnsureCtas] = useState<EnsureCta[]>([]);
  const [jobWatchMessage, setJobWatchMessage] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<JobDto | null>(null);
  const [learningHint, setLearningHint] = useState<string | null>(null);
  const [contextCollapsed, setContextCollapsed] = useState(false);

  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const watchCancel = useRef<AbortController | null>(null);

  const {
    chapterId,
    paragraphs,
    activeParagraphId,
    dirty,
    saveStatus,
    lastSavedAt,
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
    if (project) setCurrentProject(project.id, project.title);
    void window.novelTrans.pack
      .listChapters(projectId)
      .then((result) => {
        setChapters(result.chapters);
        setChapterIndex(0);
        setSelectedChapterIds(new Set());
        selectAnchorRef.current = null;
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
      });
  }, [projectId, projects, setCurrentProject, t]);

  useEffect(() => {
    if (chapters.length === 0 || !projectId) return;
    const chapter = chapters[chapterIndex] ?? chapters[0];
    setError(null);
    void loadChapter(projectId, chapter.id, chapterRef(chapter)).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    });
  }, [projectId, chapters, chapterIndex, loadChapter, t]);

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

  const goChapter = useCallback(
    (delta: number) => {
      setChapterIndex((idx) => Math.max(0, Math.min(chapters.length - 1, idx + delta)));
    },
    [chapters.length],
  );

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
          setLearningHint(
            t('translation.learningCandidatesHint', { count: String(candidates) }),
          );
          setErrorAction({
            label: t('translation.openTermCandidates'),
            to: projectId ? `/projects/${projectId}/terms` : '/terms',
          });
        } else if (job.progress?.learning?.emptyDeltas) {
          setLearningHint(t('translation.learningEmptyHint'));
          setErrorAction(null);
        } else {
          setLearningHint(null);
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
    setLearningHint(null);
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
    setLearningHint(null);
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

  const continueTranslate = async () => {
    const project = projects.find((p) => p.id === projectId);
    const from =
      project?.nextUntranslatedChapter ??
      (chapters.at(chapterIndex) ? chapterRef(chapters[chapterIndex]!) : undefined);
    await enqueueNovelRange({ chapterFrom: from });
  };

  const selectedIds = useMemo(() => Array.from(selectedChapterIds), [selectedChapterIds]);

  const toggleChapterSelect = (idx: number, shiftKey: boolean) => {
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
  };

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
    setLearningHint(null);
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

  const retranslateChapter = async () => {
    const chapter = chapters.at(chapterIndex);
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
    setLearningHint(null);
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
      if (mod && event.key === 'f') {
        event.preventDefault();
        document.getElementById('editor-search')?.focus();
      }
      if (mod && event.key === 'h') {
        event.preventDefault();
        setShowReplace(true);
        document.getElementById('editor-search')?.focus();
      }
      if (event.altKey && event.key === 'ArrowUp') {
        event.preventDefault();
        goChapter(-1);
      }
      if (event.altKey && event.key === 'ArrowDown') {
        event.preventDefault();
        goChapter(1);
      }
      if (mod && event.key === 'g' && searchMatches.length > 0) {
        event.preventDefault();
        setSearchMatchIndex((idx) => {
          if (idx == null) return 0;
          return (idx + 1) % searchMatches.length;
        });
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
    markSaveError,
    markSaved,
    projectId,
    searchMatches.length,
  ]);

  const currentChapter = chapters.at(chapterIndex);
  const projectTitle = projects.find((p) => p.id === projectId)?.title ?? '';
  const chapterHeading = currentChapter
    ? t('translation.batch', {
        from: chapterRef(currentChapter),
        to: chapterRef(currentChapter),
      })
    : '';

  if (loading) {
    return (
      <div style={{ padding: '1rem' }}>
        <Skeleton height={40} />
        <Skeleton height={320} />
      </div>
    );
  }

  return (
    <div className="editor-page" style={{ height: '100%', padding: 0 }}>
      <TranslationToolbar
        projectId={projectId}
        projects={projects}
        projectTitle={projectTitle}
        chapterLabel={chapterHeading}
        selectedCount={selectedIds.length}
        busy={enqueueBusy}
        preparing={preparePhase}
        saveStatus={saveStatus}
        lastSavedAt={lastSavedAt}
        hideProjectSelect={Boolean(routeProjectId)}
        memoryBadge={
          <TranslationContextStatus
            projectId={projectId}
            packMode={activeJob?.progress?.packMode ?? null}
          />
        }
        onProjectChange={(nextId) => {
          if (routeProjectId) {
            navigate(`/projects/${nextId}/translate`);
            return;
          }
          setProjectId(nextId);
        }}
        onContinue={() => {
          void continueTranslate();
        }}
        onTranslateCurrent={() => {
          void enqueueTranslateCurrent();
        }}
        onTranslateSelected={() => {
          void enqueueNovelRange({ chapterIds: selectedIds });
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
      />

      {error ? (
        <div className="banner banner-error">
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

      <TranslationJobBanner
        job={activeJob}
        preparing={preparePhase}
        preparingMessage={jobWatchMessage}
        onPause={() => {
          void window.novelTrans.jobs.pauseAll();
        }}
        onOpenJobs={() => {
          navigate('/jobs');
        }}
      />

      {learningHint && !error ? (
        <div className="banner banner-info">
          {learningHint}
          {errorAction?.label === t('translation.openTermCandidates') ? (
            <Button
              size="sm"
              onClick={() => {
                navigate(projectId ? `/projects/${projectId}/terms` : '/terms');
              }}
            >
              {errorAction.label}
            </Button>
          ) : null}
        </div>
      ) : null}

      {!error && (preflightReason === 'no_channel' || preflightReason === 'no_worker') ? (
        <div className="banner banner-info">
          {preflightReason === 'no_worker'
            ? t('translation.preflightNoWorker')
            : t('translation.preflightNoChannel')}{' '}
          {t('translation.ensureHint')}
        </div>
      ) : null}

      <EditorSearchBar
        searchQuery={searchQuery}
        replaceQuery={replaceQuery}
        showReplace={showReplace}
        matchIndex={searchMatchIndex}
        matchCount={searchMatches.length}
        onSearchChange={setSearchQuery}
        onReplaceChange={setReplaceQuery}
        onToggleReplace={() => {
          setShowReplace((v) => !v);
        }}
        onReplaceAll={runReplaceAll}
        onNextMatch={() => {
          setSearchMatchIndex((idx) => {
            if (searchMatches.length === 0) return null;
            if (idx == null) return 0;
            return (idx + 1) % searchMatches.length;
          });
        }}
      />

      <div
        className={`translation-workspace${contextCollapsed ? ' translation-workspace--collapsed' : ''}`}
      >
        <ChapterNavigator
          chapters={chapters}
          chapterIndex={chapterIndex}
          selectedChapterIds={selectedChapterIds}
          busy={enqueueBusy}
          onSelectChapter={setChapterIndex}
          onToggleSelect={toggleChapterSelect}
          onSelectAll={() => {
            setSelectedChapterIds(new Set(chapters.map((c) => c.id)));
            selectAnchorRef.current = chapters.length > 0 ? 0 : null;
          }}
          onClearSelection={() => {
            setSelectedChapterIds(new Set());
            selectAnchorRef.current = null;
          }}
        />

        <TranslationWorkspace
          paragraphs={paragraphs}
          activeParagraphId={activeParagraphId}
          dirty={dirty}
          searchMatchIndex={searchMatchIndex}
          searchMatches={searchMatches}
          projectId={projectId}
          chapterId={chapterId}
          context={context}
          contextCollapsed={contextCollapsed}
          onSelectParagraph={setActiveParagraph}
          onDraftChange={handleDraftChange}
          onToggleContext={() => {
            setContextCollapsed((v) => !v);
          }}
          onReverted={() => {
            if (chapters.length === 0) return;
            const chapter = chapters[chapterIndex] ?? chapters[0];
            void loadChapter(projectId, chapterId, chapterRef(chapter)).then(() => {
              if (activeParagraphId) setActiveParagraph(activeParagraphId);
            });
          }}
        />
      </div>
    </div>
  );
}
