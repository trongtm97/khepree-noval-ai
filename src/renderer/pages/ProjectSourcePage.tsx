import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { SourceFolderSettingsDto } from '@shared/schemas/source-folder';
import type { ProjectDto } from '@shared/schemas/import';
import type { SourceLanguageDetection } from '@shared/schemas/source-language';
import type { ChapterSummaryDto } from '@shared/schemas/translation-pack';
import type { JobDto } from '@shared/schemas/job';
import { getLanguageProfile } from '@shared/constants/language-profile';
import { JOB_TERMINAL_STATES, type JobState } from '@shared/constants/job';
import { Button } from '../components/ui';
import { ProjectSectionHeader } from '../components/shell/ProjectSectionHeader';
import { SourceWorkbookDialog } from '../components/SourceWorkbookDialog';
import { SourceFolderSettingsDrawer } from '../components/source-folder/SourceFolderSettingsDrawer';
import { ChangeFolderDrawer } from '../features/project-chapters/ChangeFolderDrawer';
import { ChapterListSection } from '../features/project-chapters/ChapterListSection';
import {
  SourceLanguageCompact,
  SourceLanguageRedetectBanner,
} from '../features/project-chapters/SourceLanguageCompact';
import { useT } from '../i18n';
import { useUiShellStore } from '../stores/ui-shell-store';

function buildTranslatingNumbers(jobs: JobDto[], projectId: string): Set<number> {
  const out = new Set<number>();
  for (const job of jobs) {
    if (job.projectId !== projectId) continue;
    if (JOB_TERMINAL_STATES.has(job.state as JobState)) continue;
    if (job.chapterFrom == null || job.chapterTo == null) continue;
    const lo = Math.min(job.chapterFrom, job.chapterTo);
    const hi = Math.max(job.chapterFrom, job.chapterTo);
    for (let n = lo; n <= hi; n += 1) out.add(n);
  }
  return out;
}

function formatScanTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function ProjectSourcePage() {
  const t = useT();
  const showAdvancedTools = useUiShellStore((s) => s.showAdvancedTools);
  const { projectId = '' } = useParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<SourceFolderSettingsDto | null>(null);
  const [summary, setSummary] = useState<{
    filesTotal: number;
    recognizedFiles: number;
    newCount: number;
    modifiedCount: number;
    missingCount: number;
    conflictCount: number;
    errorCount: number;
    watching: boolean;
  } | null>(null);
  const [chapters, setChapters] = useState<ChapterSummaryDto[]>([]);
  const [translatingNumbers, setTranslatingNumbers] = useState<Set<number>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [showChangeFolder, setShowChangeFolder] = useState(false);
  const [project, setProject] = useState<ProjectDto | null>(null);
  const [redetectBusy, setRedetectBusy] = useState(false);
  const [redetectDetection, setRedetectDetection] = useState<SourceLanguageDetection | null>(null);
  const [redetectPending, setRedetectPending] = useState<{
    currentLanguage: string;
    detection: SourceLanguageDetection;
  } | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const [status, projectRes, chapterRes, jobsRes] = await Promise.all([
      window.novelTrans.sourceFolder.getStatus(projectId),
      window.novelTrans.projects.get(projectId),
      window.novelTrans.pack.listChapters(projectId),
      window.novelTrans.jobs.list(projectId),
    ]);
    setSettings(status.settings);
    setSummary(status.scanSummary);
    setProject(projectRes.project);
    setChapters(chapterRes.chapters);
    setTranslatingNumbers(buildTranslatingNumbers(jobsRes.jobs, projectId));
  }, [projectId]);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    });
  }, [refresh, t]);

  const runScan = async () => {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      await window.novelTrans.sourceFolder.scan(projectId);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('sourceFolder.scanFailed'));
    } finally {
      setBusy(false);
    }
  };

  const importNew = async () => {
    if (!projectId || !settings || !summary?.newCount) return;
    setBusy(true);
    setError(null);
    try {
      const scan = await window.novelTrans.sourceFolder.scan(projectId);
      const nums = scan.scanResult.newChapters.map((c) => c.chapterNumber);
      if (nums.length === 0) return;
      await window.novelTrans.sourceFolder.import({
        projectId,
        projectTitle: settings.sourceFolderPath?.split(/[/\\]/).pop() ?? 'Project',
        chapterNumbers: nums,
      });
      await refresh();
      setMessage(t('chaptersPage.importedNew', { count: nums.length }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('sourceFolder.importFailed'));
    } finally {
      setBusy(false);
    }
  };

  const runRedetect = async (apply = false) => {
    if (!projectId) return;
    setRedetectBusy(true);
    setError(null);
    try {
      const result = await window.novelTrans.projects.redetectSourceLanguage({
        projectId,
        apply,
      });
      setRedetectDetection(result.detection);
      if (result.requiresConfirmation && !apply) {
        setRedetectPending({
          currentLanguage: result.currentLanguage,
          detection: result.detection,
        });
        return;
      }
      setRedetectPending(null);
      if (!result.changed) {
        setMessage(t('sourceFolder.redetectUnchanged'));
      } else if (result.applied) {
        await refresh();
        setMessage(t('createProjectWizard.sourceDetectedTitle'));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('sourceFolder.redetectFailed'));
    } finally {
      setRedetectBusy(false);
    }
  };

  const detection = useMemo((): SourceLanguageDetection | null => {
    if (redetectDetection) return redetectDetection;
    if (!project) return null;
    const profile = getLanguageProfile(project.sourceLanguage);
    return {
      detectedLanguage: project.sourceLanguage,
      confidence: project.sourceLanguageConfidence ?? 0.85,
      method: project.sourceLanguageDetectionMethod ?? 'LOCAL',
      internationalName: profile.internationalName,
      nativeName: profile.nativeName,
      displayNameVi: profile.displayNameVi,
      displayNameNative: profile.displayNameNative,
      hintCode: project.sourceLanguageHint ?? null,
      hintMismatch: project.hintMismatch ?? false,
      mixedLanguage: false,
      secondaryLanguages: [],
      needsUserConfirm: false,
    };
  }, [project, redetectDetection]);

  const needsAttentionCount = useMemo(() => {
    if (!summary) return 0;
    return summary.missingCount + summary.conflictCount + summary.errorCount;
  }, [summary]);

  if (!projectId) {
    return <div className="banner banner-error">{t('sourceFolder.noProject')}</div>;
  }

  const overflowActions = [
    {
      id: 'watch-settings',
      label: t('chaptersPage.overflowSettings'),
      disabled: busy,
      onClick: () => {
        setShowSettings(true);
      },
    },
    {
      id: 'change-folder',
      label: t('chaptersPage.overflowChangeFolder'),
      disabled: busy,
      onClick: () => {
        setShowChangeFolder(true);
      },
    },
    {
      id: 'redetect',
      label: t('chaptersPage.overflowRedetect'),
      disabled: busy || redetectBusy,
      onClick: () => {
        void runRedetect(false);
      },
    },
    ...(showAdvancedTools
      ? [
          {
            id: 'workbook',
            label: t('chaptersPage.overflowWorkbook'),
            element: (
              <SourceWorkbookDialog
                projectId={projectId}
                onComplete={(msg) => {
                  setMessage(msg);
                  void refresh();
                }}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="project-page chapters-page">
      <ProjectSectionHeader
        title={t('chaptersPage.title')}
        description={t('chaptersPage.subtitle')}
        helpArticleId="source-file-types"
        primaryAction={{
          id: 'scan',
          label: t('chaptersPage.scanNow'),
          variant: 'primary',
          disabled: busy,
          onClick: () => {
            void runScan();
          },
        }}
        secondaryAction={{
          id: 'open-folder',
          label: t('sourceFolder.openFolder'),
          disabled: busy,
          onClick: () => {
            void window.novelTrans.sourceFolder.openFolder(projectId);
          },
        }}
        overflowActions={overflowActions}
      />

      {error ? <div className="banner banner-error">{error}</div> : null}
      {message ? <div className="banner banner-success">{message}</div> : null}

      {summary && summary.newCount > 0 ? (
        <div className="banner banner-info chapters-new-banner">
          <span>{t('chaptersPage.newChaptersDetected', { count: summary.newCount })}</span>
          <Button variant="primary" size="sm" disabled={busy} onClick={() => void importNew()}>
            {t('chaptersPage.importNewChapters', { count: summary.newCount })}
          </Button>
        </div>
      ) : null}

      <div className="card source-status-bar">
        <div className="source-status-bar__head">
          <strong>{t('sourceFolder.sectionTitle')}</strong>
          <span className={summary?.watching ? 'source-watch-on' : 'source-watch-off muted'}>
            {summary?.watching ? t('sourceFolder.watchingOn') : t('sourceFolder.watchingOff')}
          </span>
        </div>
        <p className="path-ellipsis source-status-bar__path" title={settings?.sourceFolderPath ?? undefined}>
          {settings?.sourceFolderPath ?? '—'}
        </p>
        <div className="source-status-bar__foot">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void window.novelTrans.sourceFolder.openFolder(projectId)}>
            {t('sourceFolder.openFolder')}
          </Button>
          <span className="muted">
            {t('chaptersPage.lastScanLabel')}: {formatScanTime(settings?.lastFolderScanAt, 'vi-VN')}
          </span>
        </div>
      </div>

      {summary ? (
        <div className="source-metrics-row">
          <Metric value={summary.recognizedFiles} label={t('chaptersPage.metricChapters')} />
          <Metric
            value={summary.newCount}
            label={t('chaptersPage.metricNew')}
            quiet={summary.newCount === 0}
          />
          <Metric
            value={summary.modifiedCount}
            label={t('chaptersPage.metricChanged')}
            quiet={summary.modifiedCount === 0}
          />
          <Metric
            value={needsAttentionCount}
            label={t('chaptersPage.metricNeedsAttention')}
            quiet={needsAttentionCount === 0}
            highlight={needsAttentionCount > 0}
          />
        </div>
      ) : null}

      {detection ? (
        <SourceLanguageCompact
          detection={detection}
          detecting={redetectBusy}
          onRedetect={() => {
            void runRedetect(false);
          }}
        />
      ) : null}

      {redetectPending ? (
        <SourceLanguageRedetectBanner
          pending={redetectPending}
          busy={redetectBusy}
          onApply={() => {
            void runRedetect(true);
          }}
          onKeep={() => {
            setRedetectPending(null);
          }}
        />
      ) : null}

      <ChapterListSection
        projectId={projectId}
        editionId={project?.activeEditionId}
        chapters={chapters}
        translatingNumbers={translatingNumbers}
        busy={busy}
        onMessage={setMessage}
        onError={setError}
      />

      {showSettings && settings ? (
        <SourceFolderSettingsDrawer
          projectId={projectId}
          settings={settings}
          onClose={() => {
            setShowSettings(false);
          }}
          onSaved={(next) => {
            setSettings(next);
            setShowSettings(false);
            void refresh();
          }}
        />
      ) : null}

      <ChangeFolderDrawer
        open={showChangeFolder}
        busy={busy}
        projectId={projectId}
        currentPath={settings?.sourceFolderPath ?? null}
        onClose={() => {
          setShowChangeFolder(false);
        }}
        onApplied={() => {
          void refresh();
        }}
        onError={setError}
      />
    </div>
  );
}

function Metric({
  value,
  label,
  quiet = false,
  highlight = false,
}: {
  value: number;
  label: string;
  quiet?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={[
        'source-metric',
        quiet ? 'source-metric--quiet' : '',
        highlight ? 'source-metric--highlight' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="source-metric__value">{value}</span>
      <span className="source-metric__label">{label}</span>
    </div>
  );
}
