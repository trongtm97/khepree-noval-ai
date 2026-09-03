import { useEffect, useMemo, useState } from 'react';
import type {
  BatchImportCandidateDto,
  BatchImportCandidateResultDto,
  BatchImportPreflightDto,
  BatchImportProgressEventDto,
  BatchImportSessionDetailDto,
} from '@shared/schemas/batch-import';
import type { BatchImportProposedAction } from '@shared/constants/batch-import';
import { Button, Input, ProgressBar, Select } from './ui';
import { useT } from '../i18n';

export interface BatchImportPreflightWizardProps {
  onClose: () => void;
  onError: (message: string) => void;
}

function formatChars(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function BatchImportPreflightWizard({
  onClose,
  onError,
}: BatchImportPreflightWizardProps) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [progress, setProgress] = useState<BatchImportProgressEventDto | null>(null);
  const [preflight, setPreflight] = useState<BatchImportPreflightDto | null>(null);
  const [session, setSession] = useState<BatchImportSessionDetailDto | null>(null);
  const [incomplete, setIncomplete] = useState<BatchImportSessionDetailDto[]>([]);
  const [projects, setProjects] = useState<{ id: string; title: string }[]>([]);
  const [draftTitles, setDraftTitles] = useState<Record<string, string>>({});

  const refreshSessions = async () => {
    try {
      const res = await window.khepreeNovelAI.batchImport.listSessions();
      setIncomplete(res.incomplete);
    } catch {
      setIncomplete([]);
    }
  };

  useEffect(() => {
    void window.khepreeNovelAI.batchImport.listProjects()
      .then((res) => {
        setProjects(res.projects);
      })
      .catch(() => {
        setProjects([]);
      });
    void refreshSessions();
    const off = window.khepreeNovelAI.batchImport.onProgress((event) => {
      setProgress(event);
    });
    return () => {
      off();
    };
  }, []);

  const runScan = async (sourceKind: 'folder' | 'zip', sourcePath: string) => {
    setBusy(true);
    setScanning(true);
    setPreflight(null);
    setSession(null);
    try {
      const { preflight: next } = await window.khepreeNovelAI.batchImport.scan({
        sourceKind,
        sourcePath,
      });
      setPreflight(next);
      const titles: Record<string, string> = {};
      for (const c of next.candidates) titles[c.candidateId] = c.predictedTitle;
      setDraftTitles(titles);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('batchImportPreflight.scanFailed'));
    } finally {
      setScanning(false);
      setBusy(false);
    }
  };

  const pick = async (preferredKind: 'folder' | 'zip') => {
    setBusy(true);
    try {
      const selected = await window.khepreeNovelAI.batchImport.selectSource({ preferredKind });
      if (selected.canceled || !selected.sourcePath || !selected.sourceKind) return;
      await runScan(selected.sourceKind, selected.sourcePath);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('batchImportPreflight.scanFailed'));
      setBusy(false);
    }
  };

  const cancelScan = async () => {
    try {
      await window.khepreeNovelAI.batchImport.cancel({
        sessionId: preflight?.sessionId ?? progress?.sessionId ?? undefined,
      });
    } catch {
      // ignore
    }
  };

  const closeWizard = async () => {
    if (preflight && !session) {
      try {
        await window.khepreeNovelAI.batchImport.discard(preflight.sessionId);
      } catch {
        // ignore
      }
    }
    onClose();
  };

  const patchCandidate = async (
    candidateId: string,
    patch: {
      selected?: boolean;
      predictedTitle?: string;
      proposedAction?: BatchImportProposedAction;
      targetProjectId?: string | null;
    },
  ) => {
    if (!preflight) return;
    try {
      const { preflight: next } = await window.khepreeNovelAI.batchImport.updateCandidate({
        sessionId: preflight.sessionId,
        candidateId,
        ...patch,
      });
      setPreflight(next);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('batchImportPreflight.updateFailed'));
    }
  };

  const runCommit = async () => {
    if (!preflight) return;
    setBusy(true);
    setCommitting(true);
    try {
      const { session: next } = await window.khepreeNovelAI.batchImport.commit(
        preflight.sessionId,
      );
      setSession(next);
      setPreflight(null);
      await refreshSessions();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('batchImportPreflight.commitFailed'));
    } finally {
      setCommitting(false);
      setBusy(false);
    }
  };

  const retryFailed = async (candidateId: string) => {
    const sid = session?.sessionId;
    if (!sid) return;
    setBusy(true);
    try {
      const { session: next } = await window.khepreeNovelAI.batchImport.retryCandidate({
        sessionId: sid,
        candidateId,
      });
      setSession(next);
      await refreshSessions();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('batchImportPreflight.retryFailed'));
    } finally {
      setBusy(false);
    }
  };

  const resumeIncomplete = async (sessionId: string) => {
    setBusy(true);
    try {
      const { session: next } = await window.khepreeNovelAI.batchImport.getSession(sessionId);
      setSession(next);
      setPreflight(null);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('batchImportPreflight.resumeFailed'));
    } finally {
      setBusy(false);
    }
  };

  const pct = useMemo(() => {
    if (!progress || progress.total <= 0) return 0;
    return Math.min(100, Math.round((progress.processed / progress.total) * 100));
  }, [progress]);

  const showProgress = scanning || committing;

  return (
    <div className="card import-wizard batch-import-preflight">
      <div className="page-header-row">
        <h2 style={{ margin: 0 }}>{t('batchImportPreflight.title')}</h2>
        <span className="muted">{t('batchImportPreflight.subtitle')}</span>
      </div>

      <p className="muted">{t('batchImportPreflight.lead')}</p>

      {incomplete.length > 0 && !session && !preflight ? (
        <div className="batch-import-preflight__incomplete">
          <p>{t('batchImportPreflight.incompleteHeading')}</p>
          <ul>
            {incomplete.map((s) => (
              <li key={s.sessionId}>
                <span>
                  {s.sourceLabel} · {s.status} · {s.summary.failed} failed
                </span>
                <Button
                  disabled={busy}
                  onClick={() => {
                    void resumeIncomplete(s.sessionId);
                  }}
                >
                  {t('batchImportPreflight.resumeSession')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!session ? (
        <div className="batch-import-preflight__pick">
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => {
              void pick('folder');
            }}
          >
            {t('batchImportPreflight.pickFolder')}
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              void pick('zip');
            }}
          >
            {t('batchImportPreflight.pickZip')}
          </Button>
        </div>
      ) : null}

      {showProgress ? (
        <div className="batch-import-preflight__progress">
          <ProgressBar
            value={pct}
            max={100}
            label={
              progress?.currentLabel
              ?? (committing
                ? t('batchImportPreflight.committing')
                : t('batchImportPreflight.scanning'))
            }
            indeterminate={progress == null || progress.total === 0}
          />
          <p className="muted">
            {progress?.message
              ?? progress?.currentLabel
              ?? (committing
                ? t('batchImportPreflight.committing')
                : t('batchImportPreflight.scanning'))}
          </p>
          {scanning ? (
            <Button
              onClick={() => {
                void cancelScan();
              }}
            >
              {t('actions.cancel')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {preflight && !scanning && !session ? (
        <div className="batch-import-preflight__result">
          <p>
            {t('batchImportPreflight.summary', {
              source: preflight.sourceLabel,
              count: String(preflight.candidateCount),
              selected: String(preflight.selectedCount),
            })}
          </p>
          {preflight.scanWarnings.map((w) => (
            <p key={w.code + w.message} className="banner banner-warning">
              {t(`batchImportPreflight.warn_${w.code}`)}
            </p>
          ))}

          {preflight.candidates.length === 0 ? (
            <p className="muted">{t('batchImportPreflight.empty')}</p>
          ) : (
            <ul className="batch-import-preflight__list">
              {preflight.candidates.map((c) => (
                <CandidateRow
                  key={c.candidateId}
                  candidate={c}
                  titleDraft={draftTitles[c.candidateId] ?? c.predictedTitle}
                  projects={projects}
                  onTitleDraft={(value) => {
                    setDraftTitles((prev) => ({ ...prev, [c.candidateId]: value }));
                  }}
                  onTitleCommit={(value) => {
                    void patchCandidate(c.candidateId, { predictedTitle: value });
                  }}
                  onToggle={(selected) => {
                    void patchCandidate(c.candidateId, { selected });
                  }}
                  onAction={(proposedAction) => {
                    void patchCandidate(c.candidateId, { proposedAction });
                  }}
                  onTarget={(targetProjectId) => {
                    void patchCandidate(c.candidateId, { targetProjectId });
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {session ? (
        <div className="batch-import-preflight__commit-result">
          <p>
            {t('batchImportPreflight.commitSummary', {
              created: String(session.summary.created),
              updated: String(session.summary.updated),
              skipped: String(session.summary.skipped + session.summary.skippedDuplicate),
              needsAttention: String(session.summary.needsAttention),
              failed: String(session.summary.failed),
            })}
          </p>
          <ul className="batch-import-preflight__list">
            {session.candidates.map((c) => (
              <ResultRow
                key={c.candidateId}
                candidate={c}
                busy={busy}
                onRetry={() => {
                  void retryFailed(c.candidateId);
                }}
              />
            ))}
          </ul>
        </div>
      ) : null}

      <div className="batch-import-preflight__footer">
        <Button
          onClick={() => {
            void closeWizard();
          }}
        >
          {t('actions.close')}
        </Button>
        {preflight && !session && !scanning ? (
          <Button
            variant="primary"
            disabled={busy || preflight.selectedCount === 0}
            onClick={() => {
              void runCommit();
            }}
          >
            {t('batchImportPreflight.importSelected')}
          </Button>
        ) : null}
        {session ? (
          <span className="muted">{t('batchImportPreflight.closeKeepsResults')}</span>
        ) : null}
      </div>
    </div>
  );
}

function CandidateRow({
  candidate,
  titleDraft,
  projects,
  onTitleDraft,
  onTitleCommit,
  onToggle,
  onAction,
  onTarget,
}: {
  candidate: BatchImportCandidateDto;
  titleDraft: string;
  projects: { id: string; title: string }[];
  onTitleDraft: (value: string) => void;
  onTitleCommit: (value: string) => void;
  onToggle: (selected: boolean) => void;
  onAction: (action: BatchImportProposedAction) => void;
  onTarget: (projectId: string | null) => void;
}) {
  const t = useT();
  return (
    <li className="batch-import-preflight__row">
      <label className="batch-import-preflight__check">
        <input
          type="checkbox"
          checked={candidate.selected}
          onChange={(e) => {
            onToggle(e.target.checked);
          }}
        />
      </label>
      <div className="batch-import-preflight__body">
        <Input
          aria-label={t('batchImportPreflight.predictedTitle')}
          value={titleDraft}
          onChange={(e) => {
            onTitleDraft(e.target.value);
          }}
          onBlur={() => {
            if (titleDraft.trim() && titleDraft !== candidate.predictedTitle) {
              onTitleCommit(titleDraft.trim());
            }
          }}
        />
        <p className="muted batch-import-preflight__meta">
          {candidate.displayPath}
          {' · '}
          {t(`batchImportPreflight.format_${candidate.format}`)}
          {' · '}
          {t('batchImportPreflight.filesChapters', {
            files: String(candidate.fileCount),
            chapters: String(candidate.chapterCount),
            chars: formatChars(candidate.approximateCharCount),
          })}
          {candidate.languageCode
            ? ` · ${candidate.languageCode}`
            : ` · ${t('batchImportPreflight.languageUnknown')}`}
        </p>
        <div className="batch-import-preflight__actions">
          <Select
            aria-label={t('batchImportPreflight.proposedAction')}
            value={candidate.proposedAction}
            onChange={(e) => {
              onAction(e.target.value as BatchImportProposedAction);
            }}
          >
            <option value="CREATE">{t('batchImportPreflight.action_CREATE')}</option>
            <option value="UPDATE_EXISTING">{t('batchImportPreflight.action_UPDATE_EXISTING')}</option>
            <option value="SKIP">{t('batchImportPreflight.action_SKIP')}</option>
            <option value="NEEDS_ATTENTION">{t('batchImportPreflight.action_NEEDS_ATTENTION')}</option>
          </Select>
          <Select
            aria-label={t('batchImportPreflight.targetProject')}
            value={candidate.targetProjectId ?? ''}
            onChange={(e) => {
              onTarget(e.target.value || null);
            }}
          >
            <option value="">{t('batchImportPreflight.targetNone')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </div>
        {candidate.warnings.length > 0 ? (
          <ul className="batch-import-preflight__warns">
            {candidate.warnings.map((w) => (
              <li key={`${w.code}:${w.message}`}>{t(`batchImportPreflight.warn_${w.code}`)}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

function ResultRow({
  candidate,
  busy,
  onRetry,
}: {
  candidate: BatchImportCandidateResultDto;
  busy: boolean;
  onRetry: () => void;
}) {
  const t = useT();
  const chapterBits: string[] = [];
  if (candidate.chaptersCreated.length > 0) {
    chapterBits.push(
      t('batchImportPreflight.chaptersNew', { n: String(candidate.chaptersCreated.length) }),
    );
  }
  if (candidate.chaptersUpdated.length > 0) {
    chapterBits.push(
      t('batchImportPreflight.chaptersChanged', { n: String(candidate.chaptersUpdated.length) }),
    );
  }
  if (candidate.chaptersMissing.length > 0) {
    chapterBits.push(
      t('batchImportPreflight.chaptersMissing', { n: String(candidate.chaptersMissing.length) }),
    );
  }
  if (candidate.preservedLockedParagraphs > 0) {
    chapterBits.push(
      t('batchImportPreflight.locksPreserved', {
        n: String(candidate.preservedLockedParagraphs),
      }),
    );
  }

  return (
    <li className="batch-import-preflight__row">
      <div className="batch-import-preflight__body">
        <strong>{candidate.predictedTitle}</strong>
        <p className="muted batch-import-preflight__meta">
          {candidate.displayPath}
          {' · '}
          {t(`batchImportPreflight.status_${candidate.status}`)}
          {chapterBits.length > 0 ? ` · ${chapterBits.join(' · ')}` : ''}
        </p>
        {candidate.errorMessage ? (
          <p className="banner banner-warning">
            {candidate.errorMessage}
            {candidate.nextAction ? ` — ${candidate.nextAction}` : ''}
          </p>
        ) : null}
        {candidate.status === 'FAILED' ? (
          <Button disabled={busy} onClick={onRetry}>
            {t('batchImportPreflight.retry')}
          </Button>
        ) : null}
      </div>
    </li>
  );
}
