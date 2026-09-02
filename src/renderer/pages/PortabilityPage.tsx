import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ProjectDto } from '@shared/schemas/import';
import type { AutoBackupConfig } from '@shared/schemas/portability';
import type { NovelExportFormat } from '@shared/constants/portability';
import { useT, t as i18nT } from '../i18n';
import { useUiShellStore } from '../stores/ui-shell-store';
import { ProjectExportSettingsPanel } from '../components/settings/ProjectExportSettingsPanel';
import { buildNovelExportFilename } from '@shared/utils/sanitize-filename';

type BackupEntry = {
  fileName: string;
  filePath: string;
  createdAt: string;
  sizeBytes: number;
  kind?: 'auto' | 'manual' | 'migration' | 'archive';
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PortabilityPage() {
  const t = useT();
  const { projectId: routeProjectId } = useParams();
  const storeProjectId = useUiShellStore((s) => s.currentProjectId) ?? '';
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [projectId, setProjectId] = useState(routeProjectId ?? storeProjectId);
  const [format, setFormat] = useState<NovelExportFormat>('txt');
  const [chapterFrom, setChapterFrom] = useState('');
  const [chapterTo, setChapterTo] = useState('');
  const [translatedOnly, setTranslatedOnly] = useState(true);
  const [includeTitles, setIncludeTitles] = useState(true);
  const [includeParagraphIds, setIncludeParagraphIds] = useState(false);
  const [autoBackup, setAutoBackup] = useState<AutoBackupConfig | null>(null);
  const [backupDirectory, setBackupDirectory] = useState<string>('');
  const [backupDirCustom, setBackupDirCustom] = useState(false);
  const [backupList, setBackupList] = useState<BackupEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [backupPath, setBackupPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    kind: string;
    projectTitle: string | null;
    schemaVersion: number;
    compatible: boolean;
    warnings: string[];
    requiresOverwrite: boolean;
    sourceLanguage: string | null;
    targetLanguage: string | null;
    chapterCount: number | null;
    translationCount: number | null;
    backupDate: string;
  } | null>(null);

  useEffect(() => {
    if (routeProjectId) setProjectId(routeProjectId);
  }, [routeProjectId]);

  const refresh = useCallback(async () => {
    const [{ projects: list }, backupCfg, backups, dirInfo] = await Promise.all([
      window.khepreeNovelAI.projects.list(),
      window.khepreeNovelAI.portability.getAutoBackupConfig(),
      window.khepreeNovelAI.portability.listBackups(),
      window.khepreeNovelAI.portability.getBackupDirectory(),
    ]);
    setProjects(list);
    if (routeProjectId) {
      setProjectId(routeProjectId);
    } else if (!projectId && list[0]) {
      setProjectId(list[0].id);
    }
    setAutoBackup(backupCfg);
    setBackupList(backups.backups);
    setBackupDirectory(dirInfo.directory);
    setBackupDirCustom(dirInfo.isCustom);
  }, [projectId, routeProjectId]);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : i18nT('portability.loadFailed'));
    });
  }, [refresh]);

  const exportNovel = async () => {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const project = projects.find((p) => p.id === projectId);
      const resolved = await window.khepreeNovelAI.portability.resolveExportDirectory({ projectId });
      let outputPath: string | undefined;
      if (resolved.status !== 'ok') {
        const pick = await window.khepreeNovelAI.portability.selectExportPath({
          defaultName: buildNovelExportFilename(project?.title ?? 'novel', format),
          format,
          projectId,
        });
        if (pick.canceled || !pick.filePath) return;
        outputPath = pick.filePath;
      }
      const result = await window.khepreeNovelAI.portability.exportNovel({
        projectId,
        format,
        chapterFrom: chapterFrom ? Number(chapterFrom) : undefined,
        chapterTo: chapterTo ? Number(chapterTo) : undefined,
        translatedOnly,
        includeChapterTitles: includeTitles,
        includeParagraphIds,
        outputPath,
      });
      setMessage(
        t('portability.exportOk', {
          chapters: result.chapterCount,
          paragraphs: result.paragraphCount,
          path: result.filePath,
        }),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('portability.exportFailed'));
    } finally {
      setBusy(false);
    }
  };

  const createFullBackup = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.khepreeNovelAI.portability.createBackup({
        kind: 'full',
        includeCredentials: false,
      });
      setMessage(t('portability.fullBackupOk', { path: result.filePath }));
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('portability.backupFailed'));
    } finally {
      setBusy(false);
    }
  };

  const createProjectBackup = async () => {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.khepreeNovelAI.portability.createBackup({
        kind: 'project',
        projectId,
      });
      setMessage(t('portability.projectBackupOk', { path: result.filePath }));
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('portability.projectBackupFailed'));
    } finally {
      setBusy(false);
    }
  };

  const saveAutoBackup = async () => {
    if (!autoBackup) return;
    setBusy(true);
    try {
      const next = await window.khepreeNovelAI.portability.setAutoBackupConfig({
        enabled: autoBackup.enabled,
        intervalHours: autoBackup.intervalHours,
        retentionDaily: autoBackup.retentionDaily,
        retentionWeekly: autoBackup.retentionWeekly,
        retentionMonthly: autoBackup.retentionMonthly,
      });
      setAutoBackup(next);
      setMessage(t('portability.autoBackupSaved'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('portability.autoBackupSaveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const pickBackupDirectory = async () => {
    setError(null);
    try {
      const pick = await window.khepreeNovelAI.portability.selectBackupDirectory();
      if (pick.canceled || !pick.directory) return;
      const next = await window.khepreeNovelAI.portability.setBackupDirectory({
        directory: pick.directory,
      });
      setBackupDirectory(next.directory);
      setBackupDirCustom(next.isCustom);
      setMessage(t('portability.backupDirSaved', { path: next.directory }));
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('portability.backupDirFailed'));
    }
  };

  const resetBackupDirectory = async () => {
    setBusy(true);
    try {
      const next = await window.khepreeNovelAI.portability.setBackupDirectory({ directory: null });
      setBackupDirectory(next.directory);
      setBackupDirCustom(next.isCustom);
      setMessage(t('portability.backupDirReset'));
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('portability.backupDirFailed'));
    } finally {
      setBusy(false);
    }
  };

  const pickBackup = async () => {
    setError(null);
    setMessage(null);
    setPreview(null);
    try {
      const pick = await window.khepreeNovelAI.portability.selectBackupPath();
      if (pick.canceled || !pick.filePath) return;
      setBackupPath(pick.filePath);
      const p = await window.khepreeNovelAI.portability.previewRestore({
        archivePath: pick.filePath,
      });
      setPreview({
        kind: p.manifest.kind,
        projectTitle: p.summary.projectTitle ?? p.manifest.projectTitle,
        schemaVersion: p.manifest.schemaVersion,
        compatible: p.compatible,
        warnings: p.warnings,
        requiresOverwrite: p.requiresOverwrite,
        sourceLanguage: p.summary.sourceLanguage,
        targetLanguage: p.summary.targetLanguage,
        chapterCount: p.summary.chapterCount,
        translationCount: p.summary.translationCount,
        backupDate: p.summary.backupDate,
      });
      setMessage(t('portability.restorePreviewOk'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('portability.restoreFailed'));
    }
  };

  const confirmRestore = async () => {
    if (!backupPath) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await window.khepreeNovelAI.portability.restoreBackup({
        archivePath: backupPath,
        confirmOverwrite: true,
      });
      setMessage(t('portability.restoreOk', { message: result.message }));
      if (result.requiresRestart) {
        setError(t('portability.restoreNeedsRestart'));
      }
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('portability.restoreFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page">
      <header className="page-header">
        <h1>{t('portability.title')}</h1>
        <p className="muted">{t('portability.subtitle')}</p>
      </header>

      {error ? <div className="banner banner-error">{error}</div> : null}
      {message ? <div className="banner">{message}</div> : null}

      <div className="toolbar" style={{ gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {routeProjectId ? null : (
          <label>
            {t('portability.project')}{' '}
            <select value={projectId} disabled={busy} onChange={(e) => { setProjectId(e.target.value); }}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {projectId ? (
        <ProjectExportSettingsPanel
          projectId={projectId}
          projectTitle={projects.find((p) => p.id === projectId)?.title ?? projectId}
        />
      ) : null}

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h3>{t('portability.novelExport')}</h3>
        <div className="toolbar" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <label>
            {t('portability.format')}{' '}
            <select value={format} onChange={(e) => { setFormat(e.target.value as NovelExportFormat); }}>
              <option value="txt">TXT</option>
              <option value="docx">DOCX</option>
              <option value="epub">EPUB</option>
            </select>
          </label>
          <label>
            {t('portability.fromChapter')}{' '}
            <input value={chapterFrom} onChange={(e) => { setChapterFrom(e.target.value); }} style={{ width: '4rem' }} />
          </label>
          <label>
            {t('portability.toChapter')}{' '}
            <input value={chapterTo} onChange={(e) => { setChapterTo(e.target.value); }} style={{ width: '4rem' }} />
          </label>
          <label>
            <input type="checkbox" checked={translatedOnly} onChange={(e) => { setTranslatedOnly(e.target.checked); }} />{' '}
            {t('portability.translatedOnly')}
          </label>
          <label>
            <input type="checkbox" checked={includeTitles} onChange={(e) => { setIncludeTitles(e.target.checked); }} />{' '}
            {t('portability.chapterTitles')}
          </label>
          <label>
            <input type="checkbox" checked={includeParagraphIds} onChange={(e) => { setIncludeParagraphIds(e.target.checked); }} />{' '}
            {t('portability.paragraphIds')}
          </label>
          <button type="button" className="btn-primary" disabled={busy || !projectId} onClick={() => void exportNovel()}>
            {t('portability.exportNovel')}
          </button>
        </div>
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h3>{t('portability.backup')}</h3>
        <p className="muted">{t('portability.backupHint')}</p>
        <p className="muted" style={{ fontSize: '0.9rem' }}>
          {t('portability.backupDirLabel')}: {backupDirectory}
          {backupDirCustom ? ` (${t('portability.backupDirCustom')})` : ''}
        </p>
        <div className="toolbar" style={{ gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <button type="button" disabled={busy} onClick={() => void createFullBackup()}>{t('portability.fullBackup')}</button>
          <button type="button" disabled={busy || !projectId} onClick={() => void createProjectBackup()}>{t('portability.exportProject')}</button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void window.khepreeNovelAI.portability.createManualBackup()
                .then((r) => { setMessage(t('portability.manualBackupOk', { path: r.filePath })); return refresh(); })
                .catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : t('portability.manualBackupFailed'));
                })
            }
          >
            {t('portability.manualSnapshot')}
          </button>
          <button type="button" disabled={busy} onClick={() => void pickBackupDirectory()}>
            {t('portability.chooseBackupDir')}
          </button>
          {backupDirCustom ? (
            <button type="button" disabled={busy} onClick={() => void resetBackupDirectory()}>
              {t('portability.resetBackupDir')}
            </button>
          ) : null}
        </div>
        {backupList.length > 0 ? (
          <table style={{ width: '100%', fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th align="left">{t('portability.backupFile')}</th>
                <th align="left">{t('portability.backupKind')}</th>
                <th align="right">{t('portability.backupSize')}</th>
                <th align="left">{t('portability.backupDate')}</th>
              </tr>
            </thead>
            <tbody>
              {backupList.slice(0, 12).map((entry) => (
                <tr key={entry.filePath}>
                  <td>{entry.fileName}</td>
                  <td>{entry.kind ?? 'archive'}</td>
                  <td align="right">{formatBytes(entry.sizeBytes)}</td>
                  <td>{new Date(entry.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">{t('portability.noBackupsYet')}</p>
        )}
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h3>{t('portability.restoreTitle')}</h3>
        <p className="muted">{t('portability.restoreHint')}</p>
        <div className="toolbar" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" disabled={busy} onClick={() => void pickBackup()}>
            {t('portability.openBackup')}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !backupPath || (preview != null && !preview.compatible)}
            onClick={() => void confirmRestore()}
          >
            {t('portability.confirmRestore')}
          </button>
        </div>
        {backupPath ? <p className="muted" style={{ marginTop: '0.5rem' }}>{backupPath}</p> : null}
        {preview ? (
          <ul style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
            <li><strong>{preview.projectTitle ?? '—'}</strong> · {preview.kind}</li>
            <li>{t('portability.previewLanguages')}: {preview.sourceLanguage ?? '—'} → {preview.targetLanguage ?? '—'}</li>
            <li>{t('portability.previewCounts')}: {preview.chapterCount ?? '—'} {t('portability.chapters')} · {preview.translationCount ?? '—'} {t('portability.translations')}</li>
            <li>{t('portability.previewDate')}: {new Date(preview.backupDate).toLocaleString()}</li>
            <li>schema v{preview.schemaVersion} · compatible: {preview.compatible ? 'yes' : 'no'} · overwrite: {preview.requiresOverwrite ? 'yes' : 'no'}</li>
            {preview.warnings.length > 0 ? (
              <li>{t('portability.restoreWarnings', { warnings: preview.warnings.join('; ') })}</li>
            ) : null}
          </ul>
        ) : null}
      </section>

      {autoBackup ? (
        <section className="card">
          <h3>{t('portability.autoBackup')}</h3>
          <p className="muted">{t('portability.autoBackupHint')}</p>
          <div className="toolbar" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
            <label>
              <input
                type="checkbox"
                checked={autoBackup.enabled}
                onChange={(e) => { setAutoBackup({ ...autoBackup, enabled: e.target.checked }); }}
              />{' '}
              {t('portability.enabled')}
            </label>
            <label>
              {t('portability.everyHours')}{' '}
              <input
                type="number"
                min={1}
                value={autoBackup.intervalHours}
                onChange={(e) => { setAutoBackup({ ...autoBackup, intervalHours: Number(e.target.value) }); }}
                style={{ width: '4rem' }}
              />
            </label>
            <label>
              {t('portability.retainDaily')}{' '}
              <input
                type="number"
                min={1}
                value={autoBackup.retentionDaily}
                onChange={(e) => { setAutoBackup({ ...autoBackup, retentionDaily: Number(e.target.value) }); }}
                style={{ width: '3rem' }}
              />
            </label>
            <label>
              {t('portability.retainWeekly')}{' '}
              <input
                type="number"
                min={1}
                value={autoBackup.retentionWeekly}
                onChange={(e) => { setAutoBackup({ ...autoBackup, retentionWeekly: Number(e.target.value) }); }}
                style={{ width: '3rem' }}
              />
            </label>
            <label>
              {t('portability.retainMonthly')}{' '}
              <input
                type="number"
                min={1}
                value={autoBackup.retentionMonthly}
                onChange={(e) => { setAutoBackup({ ...autoBackup, retentionMonthly: Number(e.target.value) }); }}
                style={{ width: '3rem' }}
              />
            </label>
            <button type="button" disabled={busy} onClick={() => void saveAutoBackup()}>{t('actions.save')}</button>
            {autoBackup.lastRunAt ? (
              <span className="muted">
                {t('portability.lastRun', { time: new Date(autoBackup.lastRunAt).toLocaleString() })}
              </span>
            ) : null}
          </div>
        </section>
      ) : null}
    </section>
  );
}
