import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ProjectDto } from '@shared/schemas/import';
import type { ChapterSummaryDto } from '@shared/schemas/translation-pack';
import { EDITOR_AUTOSAVE_MS } from '@shared/constants/translation-editor';
import { useEditorStore } from '../stores/editor-store';
import { EditorVirtualList } from '../components/editor/EditorVirtualList';
import { EditorContextPanel } from '../components/editor/EditorContextPanel';
import { VersionHistoryPanel } from '../components/editor/VersionHistoryPanel';
import { findMatches, applyReplaceAll } from '../utils/editor-search';
import { useT } from '../i18n';
import { Button, Select, Input, Skeleton } from '../components/ui';
import { HelpContextButton } from '../features/help/HelpContextButton';
import { useUiShellStore } from '../stores/ui-shell-store';
import { AiStatusPanel } from '../components/translation/AiStatusPanel';
import { chapterSourceIcon, chapterSourceTooltip } from '../utils/chapter-source-ui';
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
import { formatTranslateChannel } from '@shared/utils/translate-channel';

function chapterRef(ch: ChapterSummaryDto): number {
  return ch.chapterNumber ?? ch.sequenceOrder;
}

function chapterLabel(ch: ChapterSummaryDto): string {
  if (ch.displayTitle) return ch.displayTitle;
  if (ch.chapterNumber != null) return String(ch.chapterNumber);
  return ch.title ?? String(ch.sequenceOrder);
}

export function TranslationEditorPage() {
  const t = useT();
  const navigate = useNavigate();
  const setCurrentProject = useUiShellStore((s) => s.setCurrentProject);
  const storedProjectId = useUiShellStore((s) => s.currentProjectId);

  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [projectId, setProjectId] = useState('');
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
  const [novelFrom, setNovelFrom] = useState('');
  const [novelTo, setNovelTo] = useState('');
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(() => new Set());
  const selectAnchorRef = useRef<number | null>(null);
  const [preflightReason, setPreflightReason] = useState<TranslatePreflightReason | null>(null);
  const [errorAction, setErrorAction] = useState<{ label: string; to: string } | null>(null);
  const [ensureCtas, setEnsureCtas] = useState<EnsureCta[]>([]);
  const [jobWatchMessage, setJobWatchMessage] = useState<string | null>(null);
  const [translatePath, setTranslatePath] = useState<string | null>(null);
  const [learningHint, setLearningHint] = useState<string | null>(null);

  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const watchCancel = useRef(false);

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
      const [workersRes, accountsRes, aiRes] = await Promise.all([
        window.novelTrans.jobs.workers(),
        window.novelTrans.accounts.list(),
        window.novelTrans.aiAccounts.list({}),
      ]);
      const workers = workersRes.workers.map((w) => ({
        health: w.health,
        accountId: w.accountId,
      }));
      const workerAccountId =
        workers.find((w) => w.health.toUpperCase() === 'READY')?.accountId ??
        accountsRes.accounts[0]?.id ??
        null;
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
      watchCancel.current = true;
    };
  }, []);

  useEffect(() => {
    void window.novelTrans.projects
      .list()
      .then((result) => {
        setProjects(result.projects);
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
  }, [storedProjectId, t]);

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

  const activeParagraph = useMemo(
    () => paragraphs.find((p) => p.stableParagraphId === activeParagraphId) ?? null,
    [paragraphs, activeParagraphId],
  );

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

  const watchJob = async (jobId: string, initialState: string, chapter: ChapterSummaryDto) => {
    setJobWatchMessage(t('translation.jobQueued'));
    watchCancel.current = false;
    // Soft stall hint only — never hard-fail UI while job still non-terminal (Gemini can take long).
    const stallHintAfterPolls = 180;
    let stallPolls = 0;
    let lastProgressKey: string | null = null;
    let lastState: string | null = initialState;
    let resolved = false;
    while (!watchCancel.current) {
      await new Promise((resolve) => {
        setTimeout(resolve, 2000);
      });
      if (watchCancel.current) break;

      const snapshot = await window.novelTrans.jobs.get(jobId);
      const job = snapshot.job;
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
        const detail = job.error ?? job.state;
        setJobWatchMessage(null);
        if (job.state === 'NEEDS_ATTENTION') {
          setError(t('translation.jobNeedsAttention', { detail }));
        } else {
          setError(t('translation.jobFailed', { detail }));
        }
        setErrorAction({ label: t('translation.openJobs'), to: '/jobs' });
        resolved = true;
        break;
      }
      if (tick !== 'pending') {
        setJobWatchMessage(null);
        const channel = formatTranslateChannel({
          providerType: job.progress?.providerType,
          packMode: job.progress?.packMode,
        });
        if (channel) setTranslatePath(channel);
        const candidates = job.progress?.learning?.candidatesCreated ?? 0;
        if (candidates > 0) {
          setLearningHint(
            t('translation.learningCandidatesHint', { count: String(candidates) }),
          );
          setErrorAction({
            label: t('translation.openTermCandidates'),
            to: '/terms',
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
      const p = job.progress;
      const channel = formatTranslateChannel({
        providerType: p?.providerType,
        packMode: p?.packMode,
      });
      if (channel) setTranslatePath(channel);
      const channelSuffix = channel ? ` · ${channel}` : '';
      const longWait = isJobWatchTimedOut(stallPolls, stallHintAfterPolls, lastState);
      if (p?.chunkTotal && p.chunkTotal > 1 && typeof p.chunkIndex === 'number') {
        const detail = `${t('translation.jobRunningChunk', {
          chunk: String(p.chunkIndex),
          chunks: String(p.chunkTotal),
          done: String(p.paragraphsDone ?? 0),
          total: String(p.paragraphsTotal ?? 0),
          state: job.state,
        })}${channelSuffix}`;
        setJobWatchMessage(
          longWait ? t('translation.jobRunningSlow', { detail }) : detail,
        );
      } else if (
        p &&
        typeof p.paragraphsDone === 'number' &&
        typeof p.paragraphsTotal === 'number' &&
        p.paragraphsTotal > 0
      ) {
        const detail = `${t('translation.jobRunningChapter', {
          done: String(p.paragraphsDone),
          total: String(p.paragraphsTotal),
          state: job.state,
        })}${channelSuffix}`;
        setJobWatchMessage(
          longWait ? t('translation.jobRunningSlow', { detail }) : detail,
        );
      } else {
        const detail = `${t('translation.jobRunning', { state: job.state })}${channelSuffix}`;
        setJobWatchMessage(
          longWait ? t('translation.jobRunningSlow', { detail }) : detail,
        );
      }
    }
    if (!resolved && !watchCancel.current) {
      setJobWatchMessage(null);
      setError(t('translation.jobWatchTimeout', { state: lastState ?? 'UNKNOWN' }));
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
      if (cta.action === 'open_ai_memory' && projectId) {
        navigate(`/projects/${projectId}/ai-memory`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    }
  };

  /** Heal worker/Notebook first; only surface CTAs when auto-heal cannot finish. */
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

  const enqueueTranslate = async () => {
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
      await watchJob(queued.job.id, queued.job.state, chapter);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setEnqueueBusy(false);
      setPreparePhase(false);
      setJobWatchMessage(null);
    }
  };

  const enqueueTranslateNovel = async () => {
    if (!projectId) {
      setError(t('translation.selectProject'));
      setErrorAction(null);
      return;
    }
    if (chapters.length === 0) {
      setError(t('translation.noChapters'));
      setErrorAction(null);
      return;
    }

    const fromParsed = novelFrom.trim() ? Number.parseInt(novelFrom.trim(), 10) : undefined;
    const toParsed = novelTo.trim() ? Number.parseInt(novelTo.trim(), 10) : undefined;
    if (
      (fromParsed != null && (!Number.isFinite(fromParsed) || fromParsed < 1)) ||
      (toParsed != null && (!Number.isFinite(toParsed) || toParsed < 1))
    ) {
      setError(t('translation.novelRangeInvalid'));
      setErrorAction(null);
      return;
    }
    if (fromParsed != null && toParsed != null && toParsed < fromParsed) {
      setError(t('translation.novelRangeInvalid'));
      setErrorAction(null);
      return;
    }

    const rangeLabel =
      fromParsed != null || toParsed != null
        ? ` (${fromParsed ?? '…'}–${toParsed ?? '…'})`
        : '';
    const ok = window.confirm(t('translation.novelConfirm', { range: rangeLabel }));
    if (!ok) return;

    setEnqueueBusy(true);
    setError(null);
    setErrorAction(null);
    setEnsureCtas([]);
    setLearningHint(null);
    setJobWatchMessage(null);
    try {
      const ensured = await ensureReadyForTranslate();
      if (!ensured.ok) return;

      const result = await window.novelTrans.jobs.enqueueNovel({
        projectId,
        chapterFrom: fromParsed,
        chapterTo: toParsed,
        skipTranslated: true,
      });

      if (result.queuedCount === 0) {
        setError(t('translation.novelNothing'));
        setErrorAction(null);
        setEnsureCtas([]);
        setJobWatchMessage(null);
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

  const selectedIds = useMemo(() => Array.from(selectedChapterIds), [selectedChapterIds]);

  const toggleChapterSelect = (idx: number, shiftKey: boolean) => {
    const chapter = chapters[idx];
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

  const selectAllChapters = () => {
    setSelectedChapterIds(new Set(chapters.map((c) => c.id)));
    selectAnchorRef.current = chapters.length > 0 ? 0 : null;
  };

  const clearChapterSelection = () => {
    setSelectedChapterIds(new Set());
    selectAnchorRef.current = null;
  };

  const runSelectedPreflight = async (): Promise<{
    ok: boolean;
    workerAccountId: string | null;
  }> => ensureReadyForTranslate();

  const translateSelectedChapters = async () => {
    if (!projectId || selectedIds.length === 0) return;
    const ok = window.confirm(
      t('translation.translateSelectedConfirm', { count: String(selectedIds.length) }),
    );
    if (!ok) return;

    setEnqueueBusy(true);
    setError(null);
    setErrorAction(null);
    setEnsureCtas([]);
    setLearningHint(null);
    setJobWatchMessage(null);
    try {
      const pre = await runSelectedPreflight();
      if (!pre.ok) return;
      const result = await window.novelTrans.jobs.enqueueNovel({
        projectId,
        chapterIds: selectedIds,
        skipTranslated: true,
      });
      if (result.queuedCount === 0) {
        setError(t('translation.novelNothing'));
        setErrorAction(null);
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

  const clearSelectedTranslations = async () => {
    if (!projectId || selectedIds.length === 0) return;
    const ok = window.confirm(
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
    const ok = window.confirm(
      t('translation.retranslateSelectedConfirm', { count: String(selectedIds.length) }),
    );
    if (!ok) return;

    setEnqueueBusy(true);
    setError(null);
    setErrorAction(null);
    setEnsureCtas([]);
    setLearningHint(null);
    setJobWatchMessage(null);
    try {
      const pre = await runSelectedPreflight();
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
    const ok = window.confirm(
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
    const ok = window.confirm(
      t('translation.retranslateConfirm', { locked: String(lockedCount) }),
    );
    if (!ok) return;

    setEnqueueBusy(true);
    setError(null);
    setErrorAction(null);
    setEnsureCtas([]);
    setLearningHint(null);
    setJobWatchMessage(null);
    try {
      const ensured = await ensureReadyForTranslate();
      if (!ensured.ok) return;

      setJobWatchMessage(t('translation.translating'));
      const result = await window.novelTrans.editor.retranslateChapter({
        projectId,
        chapterId: chapter.id,
      });
      setChapter(projectId, chapter.id, chapterRef(chapter), result.chapter.paragraphs);
      await watchJob(result.job.id, result.job.state, chapter);
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

  if (loading) {
    return (
      <div style={{ padding: '1rem' }}>
        <Skeleton height={40} />
        <Skeleton height={320} className="" />
      </div>
    );
  }

  return (
    <div className="editor-page" style={{ height: '100%', padding: 0 }}>
      <header
        className="page-header-row"
        style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', margin: 0 }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--font-section)' }}>{t('translation.title')}</h2>
          <p className="muted" style={{ margin: 0, fontSize: 'var(--font-small)' }}>
            {projectTitle || t('translation.selectProject')}
            {currentChapter
              ? ` · ${t('translation.batch', {
                  from: chapterRef(currentChapter),
                  to: chapterRef(currentChapter),
                })}`
              : ''}
          </p>
        </div>
        <div className="editor-header-controls">
          <HelpContextButton articleId="start-translate" />
          <Select
            value={projectId}
            aria-label={t('translation.selectProject')}
            onChange={(event) => {
              setProjectId(event.target.value);
            }}
            style={{ width: 'auto', minWidth: 160 }}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </Select>
          <Button
            variant="primary"
            size="sm"
            loading={enqueueBusy}
            disabled={enqueueBusy || !projectId}
            onClick={() => void enqueueTranslate()}
          >
            {preparePhase ? t('translation.ensuringReady') : t('actions.autoTranslate')}
          </Button>
          <div
            className="translate-range-group"
            role="group"
            aria-label={t('translation.novelRangeGroup')}
            title={t('translation.novelMemoryHint')}
          >
            <span className="translate-range-group__label">{t('translation.novelRangeGroup')}</span>
            <Input
              type="number"
              min={1}
              value={novelFrom}
              placeholder={t('translation.novelRangeFrom')}
              aria-label={t('translation.novelRangeFrom')}
              onChange={(event) => setNovelFrom(event.target.value)}
              disabled={enqueueBusy}
            />
            <Input
              type="number"
              min={1}
              value={novelTo}
              placeholder={t('translation.novelRangeTo')}
              aria-label={t('translation.novelRangeTo')}
              onChange={(event) => setNovelTo(event.target.value)}
              disabled={enqueueBusy}
            />
            <Button
              size="sm"
              loading={enqueueBusy}
              disabled={enqueueBusy || !projectId || chapters.length === 0}
              onClick={() => void enqueueTranslateNovel()}
            >
              {novelFrom.trim() || novelTo.trim()
                ? t('actions.translateRange', {
                    from: novelFrom.trim() || '…',
                    to: novelTo.trim() || '…',
                  })
                : t('actions.translateNovel')}
            </Button>
          </div>
          {selectedIds.length > 0 ? (
            <>
              <span className="muted" style={{ fontSize: 'var(--font-small)' }}>
                {t('translation.selectedCount', { count: String(selectedIds.length) })}
              </span>
              <Button
                size="sm"
                loading={enqueueBusy}
                disabled={enqueueBusy}
                onClick={() => void translateSelectedChapters()}
              >
                {t('actions.translateSelected')}
              </Button>
              <Button
                size="sm"
                disabled={enqueueBusy}
                onClick={() => void clearSelectedTranslations()}
              >
                {t('translation.clearSelected')}
              </Button>
              <Button
                size="sm"
                loading={enqueueBusy}
                disabled={enqueueBusy}
                onClick={() => void retranslateSelectedChapters()}
              >
                {t('actions.retranslateSelected')}
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                disabled={enqueueBusy || !projectId || paragraphs.length === 0}
                onClick={() => void clearChapterTranslations()}
              >
                {t('translation.clearChapter')}
              </Button>
              <Button
                size="sm"
                loading={enqueueBusy}
                disabled={enqueueBusy || paragraphs.length === 0}
                onClick={() => void retranslateChapter()}
              >
                {t('actions.retranslate')}
              </Button>
            </>
          )}
          <Button size="sm" onClick={() => void window.novelTrans.jobs.pauseAll()}>
            {t('actions.pause')}
          </Button>
          <span className={`editor-save-status editor-save-status--${saveStatus}`}>
            {saveStatus === 'dirty'
              ? '…'
              : saveStatus === 'saving'
                ? t('common.loading')
                : saveStatus === 'saved' && lastSavedAt
                  ? t('translation.saved')
                  : saveStatus === 'error'
                    ? t('status.failed')
                    : t('status.ready')}
          </span>
        </div>
      </header>

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
      {jobWatchMessage ? <div className="banner banner-info">{jobWatchMessage}</div> : null}
      {learningHint && !error ? (
        <div className="banner banner-info">
          {learningHint}
          {errorAction?.to === '/terms' ? (
            <Button
              size="sm"
              onClick={() => {
                navigate('/terms');
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

      <div className="editor-toolbar">
        <Input
          id="editor-search"
          type="search"
          placeholder={t('translation.searchShortcut')}
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value);
          }}
          style={{ maxWidth: 200 }}
        />
        {showReplace ? (
          <Input
            type="text"
            value={replaceQuery}
            onChange={(event) => {
              setReplaceQuery(event.target.value);
            }}
            style={{ maxWidth: 160 }}
          />
        ) : null}
        <Button size="sm" onClick={() => { setShowReplace((v) => !v); }}>
          {showReplace ? t('actions.close') : t('actions.edit')}
        </Button>
        {showReplace ? (
          <Button size="sm" disabled={!searchQuery} onClick={runReplaceAll}>
            {t('translation.replaceAll')}
          </Button>
        ) : null}
        {searchMatches.length > 0 ? (
          <span className="muted">
            {searchMatchIndex != null ? searchMatchIndex + 1 : 0}/{searchMatches.length}
          </span>
        ) : null}
      </div>

      <div className="translation-workspace">
        <aside className="translation-chapters" aria-label={t('translation.chapters')}>
          <div
            style={{
              padding: '0.5rem 0.75rem',
              fontWeight: 600,
              fontSize: 'var(--font-small)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.35rem',
              alignItems: 'center',
            }}
          >
            <span>{t('translation.chapters')}</span>
            {chapters.length > 0 ? (
              <>
                <Button size="sm" disabled={enqueueBusy} onClick={selectAllChapters}>
                  {t('translation.selectAllChapters')}
                </Button>
                <Button
                  size="sm"
                  disabled={enqueueBusy || selectedIds.length === 0}
                  onClick={clearChapterSelection}
                >
                  {t('translation.clearChapterSelection')}
                </Button>
              </>
            ) : null}
          </div>
          {chapters.length === 0 ? (
            <p className="muted" style={{ padding: '0.75rem' }}>
              {t('translation.noChapters')}
            </p>
          ) : (
            chapters.map((ch, idx) => {
              const isSelected = selectedChapterIds.has(ch.id);
              return (
                <div
                  key={ch.id}
                  className={`chapter-item ${idx === chapterIndex ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="chapter-item-check"
                    checked={isSelected}
                    aria-label={chapterLabel(ch)}
                    onChange={() => undefined}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleChapterSelect(idx, event.shiftKey);
                    }}
                  />
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      font: 'inherit',
                      textAlign: 'left',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                    }}
                    onClick={() => {
                      setChapterIndex(idx);
                    }}
                  >
                    <span aria-hidden title={chapterSourceTooltip(ch.sourceStatus)}>
                      {chapterSourceIcon(ch.sourceStatus)}
                    </span>
                    {chapterLabel(ch)}
                    {ch.title ? ` · ${ch.title}` : ''}
                  </button>
                </div>
              );
            })
          )}
        </aside>

        <div className="translation-editor-pane">
          <div className="editor-col-headers">
            <span>{t('translation.chinese')}</span>
            <span>{t('translation.vietnamese')}</span>
          </div>
          {paragraphs.length === 0 ? (
            <div className="placeholder-card" style={{ margin: '0.75rem' }}>
              {t('translation.selectChapter')}
            </div>
          ) : (
            <EditorVirtualList
              paragraphs={paragraphs}
              activeParagraphId={activeParagraphId}
              dirty={dirty}
              searchMatchIndex={searchMatchIndex}
              searchMatches={searchMatches}
              onSelect={setActiveParagraph}
              onDraftChange={handleDraftChange}
            />
          )}
          <VersionHistoryPanel
            translationId={activeParagraph?.translationId ?? null}
            projectId={projectId}
            chapterId={chapterId}
            onReverted={() => {
              if (chapters.length === 0) return;
              const chapter = chapters[chapterIndex] ?? chapters[0];
              void loadChapter(projectId, chapterId, chapterRef(chapter)).then(() => {
                if (activeParagraphId) setActiveParagraph(activeParagraphId);
              });
            }}
          />
        </div>

        <aside className="translation-context">
          <AiStatusPanel
            projectId={projectId}
            projectName={projectTitle}
            chapterFrom={currentChapter ? chapterRef(currentChapter) : undefined}
            chapterTo={currentChapter ? chapterRef(currentChapter) : undefined}
            translatePath={translatePath}
            onNotebookChange={() => {
              void refreshPreflight();
            }}
          />
          <div style={{ padding: '0.5rem' }}>
            <EditorContextPanel context={context} />
          </div>
        </aside>
      </div>
    </div>
  );
}
