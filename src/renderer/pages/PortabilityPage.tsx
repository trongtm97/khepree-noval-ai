import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ProjectDto } from '@shared/schemas/import';
import type { AutoBackupConfig } from '@shared/schemas/portability';
import type { NovelExportFormat } from '@shared/constants/portability';
import { useT, t as i18nT } from '../i18n';
import { useUiShellStore } from '../stores/ui-shell-store';

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
  } | null>(null);

  useEffect(() => {
    if (routeProjectId) setProjectId(routeProjectId);
  }, [routeProjectId]);

  const refresh = useCallback(async () => {
    const [{ projects: list }, backupCfg, backups] = await Promise.all([
      window.novelTrans.projects.list(),
      window.novelTrans.portability.getAutoBackupConfig(),
      window.novelTrans.portability.listBackups(),
    ]);
    setProjects(list);
    if (routeProjectId) {
      setProjectId(routeProjectId);
    } else if (!projectId && list[0]) {
      setProjectId(list[0].id);
    }
    setAutoBackup(backupCfg);
    void backups;
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
      const pick = await window.novelTrans.portability.selectExportPath({
        defaultName: `${project?.title ?? 'novel'}.${format}`,
        format,
      });
      if (pick.canceled || !pick.filePath) return;
      const result = await window.novelTrans.portability.exportNovel({
        projectId,
        format,
        chapterFrom: chapterFrom ? Number(chapterFrom) : undefined,
        chapterTo: chapterTo ? Number(chapterTo) : undefined,
        translatedOnly,
        includeChapterTitles: includeTitles,
        includeParagraphIds,
        outputPath: pick.filePath,
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
      const result = await window.novelTrans.portability.createBackup({
        kind: 'full',
        includeCredentials: false,
      });
      setMessage(t('portability.fullBackupOk', { path: result.filePath }));
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
      const result = await window.novelTrans.portability.createBackup({
        kind: 'project',
        projectId,
      });
      setMessage(t('portability.projectBackupOk', { path: result.filePath }));
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
      const next = await window.novelTrans.portability.setAutoBackupConfig({
        enabled: autoBackup.enabled,
        intervalHours: autoBackup.intervalHours,
        retentionCount: autoBackup.retentionCount,
      });
      setAutoBackup(next);
      setMessage(t('portability.autoBackupSaved'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('portability.autoBackupSaveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const pickBackup = async () => {
    setError(null);
    setMessage(null);
    setPreview(null);
    try {
      const pick = await window.novelTrans.portability.selectBackupPath();
      if (pick.canceled || !pick.filePath) return;
      setBackupPath(pick.filePath);
      const p = await window.novelTrans.portability.previewRestore({
        archivePath: pick.filePath,
      });
      setPreview({
        kind: p.manifest.kind,
        projectTitle: p.manifest.projectTitle,
        schemaVersion: p.manifest.schemaVersion,
        compatible: p.compatible,
        warnings: p.warnings,
        requiresOverwrite: p.requiresOverwrite,
      });
      setMessage(
        t('portability.restorePreviewOk', {
          kind: p.manifest.kind,
          title: p.manifest.projectTitle ?? '—',
          schema: p.manifest.schemaVersion,
          ok: p.compatible ? 'yes' : 'no',
        }),
      );
      if (p.warnings.length > 0) {
        setError(t('portability.restoreWarnings', { warnings: p.warnings.join('; ') }));
      }
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
      const result = await window.novelTrans.portability.restoreBackup({
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
        <div className="toolbar" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" disabled={busy} onClick={() => void createFullBackup()}>{t('portability.fullBackup')}</button>
          <button type="button" disabled={busy || !projectId} onClick={() => void createProjectBackup()}>{t('portability.projectBackup')}</button>
          <button type="button" disabled={busy || !projectId} onClick={() => void createProjectBackup()}>{t('portability.exportProject')}</button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void window.novelTrans.portability.createManualBackup()
                .then((r) => { setMessage(t('portability.manualBackupOk', { path: r.filePath })); })
                .catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : t('portability.manualBackupFailed'));
                })
            }
          >
            {t('portability.manualSnapshot')}
          </button>
        </div>
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
            <li>{preview.kind} · {preview.projectTitle ?? '—'} · schema v{preview.schemaVersion}</li>
            <li>compatible: {preview.compatible ? 'yes' : 'no'} · overwrite: {preview.requiresOverwrite ? 'yes' : 'no'}</li>
          </ul>
        ) : null}
      </section>

      {autoBackup ? (
        <section className="card">
          <h3>{t('portability.autoBackup')}</h3>
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
              {t('portability.retain')}{' '}
              <input
                type="number"
                min={1}
                value={autoBackup.retentionCount}
                onChange={(e) => { setAutoBackup({ ...autoBackup, retentionCount: Number(e.target.value) }); }}
                style={{ width: '4rem' }}
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
