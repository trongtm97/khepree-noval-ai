import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { SourceFolderSettingsDto } from '@shared/schemas/source-folder';
import type { ProjectDto } from '@shared/schemas/import';
import type { SourceLanguageDetection } from '@shared/schemas/source-language';
import { formatLanguagePickerStacked, getLanguageProfile } from '@shared/constants/language-profile';
import { Button, Card, Input, PageHeader } from '../components/ui';
import { useT } from '../i18n';
import { SourceFolderSettingsDrawer } from '../components/source-folder/SourceFolderSettingsDrawer';
import { HelpContextButton } from '../features/help/HelpContextButton';
import { SourceWorkbookDialog } from '../components/SourceWorkbookDialog';
import { SourceLanguageDetectionBanner } from '../components/SourceLanguageDetectionBanner';

export function ProjectSourcePage() {
  const t = useT();
  const navigate = useNavigate();
  const { projectId = '' } = useParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const [showSettings, setShowSettings] = useState(false);
  const [newFolderPath, setNewFolderPath] = useState('');
  const [pendingFolderPreview, setPendingFolderPreview] = useState<{
    path: string;
    changeCount: number;
  } | null>(null);
  const [tabularMessage, setTabularMessage] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectDto | null>(null);
  const [redetectBusy, setRedetectBusy] = useState(false);
  const [redetectDetection, setRedetectDetection] = useState<SourceLanguageDetection | null>(
    null,
  );
  const [redetectPending, setRedetectPending] = useState<{
    currentLanguage: string;
    detection: SourceLanguageDetection;
  } | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const [status, projectRes] = await Promise.all([
      window.novelTrans.sourceFolder.getStatus(projectId),
      window.novelTrans.projects.get(projectId),
    ]);
    setSettings(status.settings);
    setSummary(status.scanSummary);
    setProject(projectRes.project);
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
    if (!projectId || !settings) return;
    setBusy(true);
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('sourceFolder.importFailed'));
    } finally {
      setBusy(false);
    }
  };

  const previewChangeFolder = async () => {
    if (!projectId || !newFolderPath.trim()) return;
    setBusy(true);
    try {
      const preview = await window.novelTrans.sourceFolder.changeFolder({
        projectId,
        newFolderPath: newFolderPath.trim(),
        confirm: false,
      });
      setPendingFolderPreview({
        path: newFolderPath.trim(),
        changeCount:
          preview.preview.newChapters.length + preview.preview.modifiedChapters.length,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('sourceFolder.changeFailed'));
    } finally {
      setBusy(false);
    }
  };

  const confirmChangeFolder = async () => {
    if (!projectId || !pendingFolderPreview) return;
    setBusy(true);
    try {
      await window.novelTrans.sourceFolder.changeFolder({
        projectId,
        newFolderPath: pendingFolderPreview.path,
        confirm: true,
      });
      setPendingFolderPreview(null);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('sourceFolder.changeFailed'));
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
        setTabularMessage(t('sourceFolder.redetectUnchanged'));
      } else if (result.applied) {
        await refresh();
        setTabularMessage(
          t('createProjectWizard.sourceDetectedTitle') +
            ': ' +
            formatLanguagePickerStacked({
              internationalName: result.detection.internationalName,
              nativeName: result.detection.nativeName,
              code: result.detection.detectedLanguage,
            }).nativeLine,
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('sourceFolder.redetectFailed'));
    } finally {
      setRedetectBusy(false);
    }
  };

  if (!projectId) {
    return <div className="banner banner-error">{t('sourceFolder.noProject')}</div>;
  }

  return (
    <div>
      <PageHeader
        title={t('sourceFolder.title')}
        description={t('sourceFolder.subtitle')}
        actions={
          <>
            <HelpContextButton articleId="source-file-types" />
            <Button onClick={() => { navigate('/projects'); }}>{t('sourceFolder.backProjects')}</Button>
          </>
        }
      />

      {error ? <div className="banner banner-error">{error}</div> : null}
      {tabularMessage ? <div className="banner banner-success">{tabularMessage}</div> : null}

      <Card>
        <h3>{t('sourceFolder.sectionTitle')}</h3>
        <p><strong>{t('sourceFolder.folderPath')}:</strong> {settings?.sourceFolderPath ?? '—'}</p>
        <p>
          <strong>{t('sourceFolder.watchStatus')}:</strong>{' '}
          {summary?.watching ? t('sourceFolder.watchingOn') : t('sourceFolder.watchingOff')}
        </p>
        <p>
          <strong>{t('sourceFolder.lastScan')}:</strong>{' '}
          {settings?.lastFolderScanAt
            ? new Date(settings.lastFolderScanAt).toLocaleString('vi-VN')
            : '—'}
        </p>
        {summary ? (
          <ul>
            <li>{t('sourceFolder.statFiles', { count: summary.filesTotal })}</li>
            <li>{t('sourceFolder.statChapters', { count: summary.recognizedFiles })}</li>
            <li>{t('sourceFolder.statNew', { count: summary.newCount })}</li>
            <li>{t('sourceFolder.statModified', { count: summary.modifiedCount })}</li>
            <li>{t('sourceFolder.statMissing', { count: summary.missingCount })}</li>
            <li>{t('sourceFolder.statConflicts', { count: summary.conflictCount })}</li>
            <li>{t('sourceFolder.statErrors', { count: summary.errorCount })}</li>
          </ul>
        ) : null}

        <div className="btn-row" style={{ marginTop: '1rem' }}>
          <Button variant="primary" disabled={busy} onClick={() => { void runScan(); }}>
            {t('sourceFolder.syncNow')}
          </Button>
          <Button disabled={busy} onClick={() => { void importNew(); }}>
            {t('sourceFolder.scanNew')}
          </Button>
          <Button disabled={busy} onClick={() => { void window.novelTrans.sourceFolder.openFolder(projectId); }}>
            {t('sourceFolder.openFolder')}
          </Button>
          <Button disabled={busy} onClick={() => { setShowSettings(true); }}>
            {t('sourceFolder.settings')}
          </Button>
        </div>

        <div className="form-stack" style={{ marginTop: '1.5rem' }}>
          <label>
            {t('sourceFolder.changeFolder')}
            <Input value={newFolderPath} onChange={(e) => { setNewFolderPath(e.target.value); }} />
          </label>
          <Button disabled={busy || !newFolderPath.trim()} onClick={() => { void previewChangeFolder(); }}>
            {t('sourceFolder.applyFolder')}
          </Button>
          {pendingFolderPreview ? (
            <div className="banner banner-warn">
              <p>{t('sourceFolder.changeConfirm', { count: pendingFolderPreview.changeCount })}</p>
              <div className="btn-row">
                <Button variant="primary" disabled={busy} onClick={() => { void confirmChangeFolder(); }}>
                  {t('actions.confirm')}
                </Button>
                <Button disabled={busy} onClick={() => { setPendingFolderPreview(null); }}>
                  {t('actions.cancel')}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <Card style={{ marginTop: '1rem' }}>
        <h3>{t('sourceFolder.sourceLanguageSection')}</h3>
        <p className="muted">{t('sourceFolder.sourceLanguageSectionHelp')}</p>
        {project ? (
          <SourceLanguageDetectionBanner
            detection={
              redetectDetection ?? (() => {
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
              })()
            }
            detecting={redetectBusy}
          />
        ) : null}
        <div className="btn-row" style={{ marginTop: '0.75rem' }}>
          <Button
            variant="secondary"
            disabled={busy || redetectBusy}
            onClick={() => {
              void runRedetect(false);
            }}
          >
            {redetectBusy ? t('sourceFolder.redetectRunning') : t('sourceFolder.redetectSourceLanguage')}
          </Button>
        </div>
        {redetectPending ? (
          <div className="banner banner-warn" style={{ marginTop: '0.75rem' }}>
            <p style={{ margin: '0 0 0.35rem', fontWeight: 600 }}>
              {t('sourceFolder.redetectChangedTitle')}
            </p>
            <p style={{ margin: 0 }}>
              {t('sourceFolder.redetectChangedBody', {
                current: redetectPending.currentLanguage,
                detected: redetectPending.detection.detectedLanguage,
              })}
            </p>
            <div className="btn-row" style={{ marginTop: '0.5rem' }}>
              <Button
                variant="primary"
                disabled={redetectBusy}
                onClick={() => {
                  void runRedetect(true);
                }}
              >
                {t('sourceFolder.redetectApply')}
              </Button>
              <Button
                disabled={redetectBusy}
                onClick={() => {
                  setRedetectPending(null);
                }}
              >
                {t('sourceFolder.redetectKeepCurrent')}
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <Card style={{ marginTop: '1rem' }}>
        <h3>{t('sourceWorkbook.sectionTitle')}</h3>
        <p>{t('sourceWorkbook.sectionDesc')}</p>
        <SourceWorkbookDialog
          projectId={projectId}
          onComplete={(message) => {
            setTabularMessage(message);
            void refresh();
          }}
        />
      </Card>

      {showSettings && settings ? (
        <SourceFolderSettingsDrawer
          projectId={projectId}
          settings={settings}
          onClose={() => { setShowSettings(false); }}
          onSaved={(next) => {
            setSettings(next);
            setShowSettings(false);
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}
