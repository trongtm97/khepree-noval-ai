import { useState } from 'react';
import type { ImportPreviewDto, ProjectDto } from '@shared/schemas/import';
import { useT } from '../i18n';

type Step = 'file' | 'preview' | 'confirm';

export interface ImportWizardProps {
  onCancel: () => void;
  onComplete: (result: {
    project: ProjectDto;
    chapterCount: number;
    paragraphCount: number;
  }) => void | Promise<void>;
  onError: (message: string) => void;
}

export function ImportWizard({ onCancel, onComplete, onError }: ImportWizardProps) {
  const t = useT();
  const [step, setStep] = useState<Step>('file');
  const [busy, setBusy] = useState(false);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewDto | null>(null);
  const [projectTitle, setProjectTitle] = useState('');
  const [titleDrafts, setTitleDrafts] = useState<Record<number, string>>({});
  const [excluded, setExcluded] = useState<Record<number, boolean>>({});
  const [manualOffset, setManualOffset] = useState('');
  const [manualTitle, setManualTitle] = useState('');

  const stepText =
    step === 'file'
      ? t('importWizard.stepFile')
      : step === 'preview'
        ? t('importWizard.stepPreview')
        : t('importWizard.stepConfirm');

  const pickFile = async () => {
    setBusy(true);
    try {
      const selected = await window.novelTrans.import.selectFile();
      if (selected.canceled || !selected.filePath) {
        return;
      }
      setFilePath(selected.filePath);
      const { preview: next } = await window.novelTrans.import.preview(selected.filePath);
      setPreview(next);
      setProjectTitle(next.fileName.replace(/\.[^.]+$/, ''));
      setTitleDrafts({});
      setExcluded({});
      setStep('preview');
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('importWizard.previewFailed'));
    } finally {
      setBusy(false);
    }
  };

  const applyTitlePatches = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const chapterPatches = preview.chapters.map((ch) => ({
        chapterNumber: ch.chapterNumber,
        title: (titleDrafts[ch.chapterNumber] ?? '').trim() || undefined,
        include: !excluded[ch.chapterNumber],
      }));
      const { preview: next } = await window.novelTrans.import.updatePreview({
        previewId: preview.previewId,
        chapterPatches,
      });
      setPreview(next);
      setTitleDrafts({});
      setExcluded({});
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('importWizard.updatePreviewFailed'));
    } finally {
      setBusy(false);
    }
  };

  const addManualSplit = async () => {
    if (!preview) return;
    const offset = Number.parseInt(manualOffset, 10);
    if (!Number.isFinite(offset) || offset < 0) {
      onError(t('importWizard.manualOffsetInvalid'));
      return;
    }
    setBusy(true);
    try {
      const existing = preview.chapters.map((ch) => ({
        offset: ch.startOffset,
        title: ch.title,
      }));
      const { preview: next } = await window.novelTrans.import.updatePreview({
        previewId: preview.previewId,
        manualSplits: [
          ...existing,
          { offset, title: manualTitle.trim() || undefined },
        ],
      });
      setPreview(next);
      setManualOffset('');
      setManualTitle('');
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('importWizard.manualSplitFailed'));
    } finally {
      setBusy(false);
    }
  };

  const redetect = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const { preview: next } = await window.novelTrans.import.updatePreview({
        previewId: preview.previewId,
        redetect: true,
      });
      setPreview(next);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('importWizard.redetectFailed'));
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      await applyTitlePatchesQuiet();
      const result = await window.novelTrans.import.commit({
        previewId: preview.previewId,
        projectTitle: projectTitle.trim() || preview.fileName,
      });
      await onComplete(result);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('importWizard.commitFailed'));
    } finally {
      setBusy(false);
    }
  };

  const applyTitlePatchesQuiet = async () => {
    if (!preview) return;
    const hasPatches =
      Object.keys(titleDrafts).length > 0 || Object.keys(excluded).length > 0;
    if (!hasPatches) return;
    const chapterPatches = preview.chapters.map((ch) => ({
      chapterNumber: ch.chapterNumber,
      title: (titleDrafts[ch.chapterNumber] ?? '').trim() || undefined,
      include: !excluded[ch.chapterNumber],
    }));
    const { preview: next } = await window.novelTrans.import.updatePreview({
      previewId: preview.previewId,
      chapterPatches,
    });
    setPreview(next);
    setTitleDrafts({});
    setExcluded({});
  };

  const cancel = async () => {
    if (preview) {
      try {
        await window.novelTrans.import.discard(preview.previewId);
      } catch {
        // ignore discard errors
      }
    }
    onCancel();
  };

  return (
    <div className="import-wizard">
      <div className="import-wizard-header">
        <h3>{t('importWizard.title')}</h3>
        <p className="muted">{t('importWizard.stepLabel', { step: stepText })}</p>
      </div>

      {step === 'file' ? (
        <div className="import-wizard-body">
          <p>{t('importWizard.fileHint')}</p>
          <div className="account-controls">
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void pickFile()}>
              {busy ? t('importWizard.reading') : t('importWizard.chooseFile')}
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void cancel()}>
              {t('actions.cancel')}
            </button>
          </div>
          {filePath ? <p className="muted"><code>{filePath}</code></p> : null}
        </div>
      ) : null}

      {step === 'preview' && preview ? (
        <div className="import-wizard-body">
          <dl className="import-meta">
            <div>
              <dt>{t('importWizard.file')}</dt>
              <dd>{preview.fileName} ({preview.format})</dd>
            </div>
            <div>
              <dt>{t('importWizard.encoding')}</dt>
              <dd>
                {preview.encoding ?? t('importWizard.na')}
                {preview.encodingConfidence != null
                  ? ` (${(preview.encodingConfidence * 100).toFixed(0)}%)`
                  : ''}
              </dd>
            </div>
            <div>
              <dt>{t('importWizard.confidence')}</dt>
              <dd>{(preview.overallConfidence * 100).toFixed(0)}%</dd>
            </div>
            <div>
              <dt>{t('importWizard.sourceHash')}</dt>
              <dd><code>{preview.sourceHash.slice(0, 16)}…</code></dd>
            </div>
            <div>
              <dt>{t('importWizard.chapters')}</dt>
              <dd>{preview.chapterCount}</dd>
            </div>
          </dl>

          {preview.warnings.length > 0 ? (
            <div className="banner banner-info">
              {preview.warnings.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
          ) : null}

          <div className="import-manual-split">
            <h4>{t('importWizard.manualSplit')}</h4>
            <p className="muted">{t('importWizard.manualSplitHint')}</p>
            <div className="complete-login-row">
              <input
                type="number"
                min={0}
                placeholder={t('importWizard.offset')}
                value={manualOffset}
                onChange={(e) => { setManualOffset(e.target.value); }}
              />
              <input
                type="text"
                placeholder={t('importWizard.titleOptional')}
                value={manualTitle}
                onChange={(e) => { setManualTitle(e.target.value); }}
              />
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => void addManualSplit()}>
                {t('importWizard.addSplit')}
              </button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => void redetect()}>
                {t('importWizard.redetect')}
              </button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => void applyTitlePatches()}>
                {t('importWizard.applyEdits')}
              </button>
            </div>
          </div>

          <div className="import-chapter-table-wrap">
            <table className="import-chapter-table">
              <thead>
                <tr>
                  <th>{t('importWizard.colInclude')}</th>
                  <th>{t('importWizard.colNum')}</th>
                  <th>{t('importWizard.colTitle')}</th>
                  <th>{t('importWizard.colChars')}</th>
                  <th>{t('importWizard.colParas')}</th>
                  <th>{t('importWizard.colFlags')}</th>
                </tr>
              </thead>
              <tbody>
                {preview.chapters.map((ch) => (
                  <tr key={ch.chapterNumber}>
                    <td>
                      <input
                        type="checkbox"
                        checked={!excluded[ch.chapterNumber]}
                        onChange={(e) =>
                          { setExcluded((prev) => ({
                            ...prev,
                            [ch.chapterNumber]: !e.target.checked,
                          })); }
                        }
                      />
                    </td>
                    <td>{ch.chapterNumber}</td>
                    <td>
                      <input
                        className="import-title-input"
                        value={titleDrafts[ch.chapterNumber] ?? ch.title}
                        onChange={(e) =>
                          { setTitleDrafts((prev) => ({
                            ...prev,
                            [ch.chapterNumber]: e.target.value,
                          })); }
                        }
                      />
                    </td>
                    <td>{ch.characterCount}</td>
                    <td>{ch.paragraphCount}</td>
                    <td>
                      {ch.isDuplicateTitle ? (
                        <span className="status-pill status-limited">{t('importWizard.dupTitle')}</span>
                      ) : null}
                      {ch.isDuplicateHash ? (
                        <span className="status-pill status-limited">{t('importWizard.dupHash')}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="account-controls">
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => { setStep('confirm'); }}
            >
              {t('importWizard.continue')}
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void cancel()}>
              {t('actions.cancel')}
            </button>
          </div>
        </div>
      ) : null}

      {step === 'confirm' && preview ? (
        <div className="import-wizard-body">
          <label className="import-title-label">
            {t('importWizard.projectTitle')}
            <input
              type="text"
              value={projectTitle}
              onChange={(e) => { setProjectTitle(e.target.value); }}
            />
          </label>
          <p>
            {t('importWizard.confirmSummary', {
              chapters: preview.chapterCount,
              paragraphs: preview.chapters.reduce((n, c) => n + c.paragraphCount, 0),
            })}
          </p>
          <div className="account-controls">
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void commit()}>
              {busy ? t('importWizard.importing') : t('importWizard.confirmImport')}
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => { setStep('preview'); }}>
              {t('importWizard.back')}
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void cancel()}>
              {t('actions.cancel')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
