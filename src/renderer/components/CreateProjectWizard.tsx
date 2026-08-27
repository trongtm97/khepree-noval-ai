import { useEffect, useState } from 'react';
import type { FolderPreviewDto } from '@shared/schemas/source-folder';
import type { GoogleAccountDto } from '@shared/schemas/account';
import type { ProjectDto } from '@shared/schemas/import';
import type { LanguageProfileDto } from '@shared/schemas/language-profile';
import {
  DEFAULT_SOURCE_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
  LANGUAGE_AUTO,
  canSwapLanguages,
} from '@shared/constants/language-profile';
import { Button, Input, Select } from './ui';
import { useT } from '../i18n';

type Step = 'metadata' | 'folder' | 'preview' | 'confirm' | 'bootstrap';

export interface CreateProjectWizardProps {
  onCancel: () => void;
  onComplete: (result: {
    project: ProjectDto;
    chapterCount: number;
    paragraphCount: number;
  }) => void | Promise<void>;
  onError: (message: string) => void;
}

export function CreateProjectWizard({
  onCancel,
  onComplete,
  onError,
}: CreateProjectWizardProps) {
  const t = useT();
  const [step, setStep] = useState<Step>('metadata');
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [chineseTitle, setChineseTitle] = useState('');
  const [genre, setGenre] = useState('');
  const [accountId, setAccountId] = useState('');
  const [stylePreset, setStylePreset] = useState('balanced');
  const [sourceLanguage, setSourceLanguage] = useState(DEFAULT_SOURCE_LANGUAGE);
  const [targetLanguage, setTargetLanguage] = useState(DEFAULT_TARGET_LANGUAGE);
  const [languages, setLanguages] = useState<LanguageProfileDto[]>([]);
  const [detectionBanner, setDetectionBanner] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [expectedStart, setExpectedStart] = useState('');
  const [expectedEnd, setExpectedEnd] = useState('');
  const [preview, setPreview] = useState<FolderPreviewDto | null>(null);
  const [accounts, setAccounts] = useState<GoogleAccountDto[]>([]);
  const [imported, setImported] = useState<{
    project: ProjectDto;
    chapterCount: number;
    paragraphCount: number;
  } | null>(null);
  const [bootstrapPhase, setBootstrapPhase] = useState<string | null>(null);
  const [bootstrapWarn, setBootstrapWarn] = useState<string | null>(null);

  useEffect(() => {
    void window.novelTrans.accounts
      .list()
      .then((res) => { setAccounts(res.accounts); })
      .catch(() => { setAccounts([]); });
    void window.novelTrans.languages
      .list()
      .then((res) => { setLanguages(res.languages); })
      .catch(() => { setLanguages([]); });
  }, []);

  const swapLanguages = () => {
    if (!canSwapLanguages(sourceLanguage, targetLanguage)) return;
    setSourceLanguage(targetLanguage);
    setTargetLanguage(sourceLanguage);
    setDetectionBanner(null);
  };

  const pickFolder = async () => {
    setBusy(true);
    try {
      const selected = await window.novelTrans.sourceFolder.selectFolder();
      if (selected.canceled || !selected.folderPath) return;
      setFolderPath(selected.folderPath);
      const parts = selected.folderPath.replace(/[/\\]+$/, '').split(/[/\\]/);
      const folderName = parts.at(-1) ?? '';
      if (!title.trim()) setTitle(folderName);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('createProjectWizard.scanFailed'));
    } finally {
      setBusy(false);
    }
  };

  const scanFolder = async () => {
    if (!folderPath) return;
    setBusy(true);
    try {
      const { preview: next } = await window.novelTrans.sourceFolder.scanPreview({
        folderPath,
        expectedStartChapter: expectedStart ? Number.parseInt(expectedStart, 10) : undefined,
        expectedEndChapter: expectedEnd ? Number.parseInt(expectedEnd, 10) : undefined,
      });
      setPreview(next);

      if (sourceLanguage === LANGUAGE_AUTO) {
        const sample = next.scanResult.newChapters
          .slice(0, 3)
          .map((c) => c.chapterTitle || c.sourceFileName)
          .join('\n');
        if (sample.trim()) {
          const detected = await window.novelTrans.languages.detect({ sampleText: sample });
          setSourceLanguage(detected.code);
          setDetectionBanner(
            t('createProjectWizard.detectedLanguage', { name: detected.displayNameVi }),
          );
        }
      }

      setStep('preview');
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('createProjectWizard.scanFailed'));
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const result = await window.novelTrans.sourceFolder.import({
        previewId: preview.previewId,
        projectTitle: title.trim() || t('createProjectWizard.defaultTitle'),
        genre: genre.trim() || null,
        chineseTitle: chineseTitle.trim() || null,
        sourceLanguage,
        targetLanguage,
        accountId: accountId || null,
        styleConfig: { preset: stylePreset },
        expectedStartChapter: expectedStart ? Number.parseInt(expectedStart, 10) : null,
        expectedEndChapter: expectedEnd ? Number.parseInt(expectedEnd, 10) : null,
      });
      setImported(result);
      setStep('bootstrap');
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('createProjectWizard.importFailed'));
    } finally {
      setBusy(false);
    }
  };

  const finishBootstrapAnalyze = async () => {
    if (!imported) return;
    setBusy(true);
    setBootstrapWarn(null);
    try {
      setBootstrapPhase(t('createProjectWizard.bootstrapPhasePreparing'));
      setBootstrapPhase(t('createProjectWizard.bootstrapPhaseMatching'));
      setBootstrapPhase(t('createProjectWizard.bootstrapPhaseAnalyzing'));
      const result = await window.novelTrans.notebook.runBootstrapAnalysis({
        projectId: imported.project.id,
        mode: 'BALANCED',
        googleAccountId: accountId || null,
      });
      if (result.status === 'FAILED') {
        setBootstrapWarn(result.message);
        return;
      }
      if (result.warnings.length > 0) {
        setBootstrapWarn(result.warnings.join(' '));
      }
      setBootstrapPhase(t('createProjectWizard.bootstrapPhaseReady'));
      await onComplete(imported);
    } catch (err: unknown) {
      setBootstrapWarn(
        err instanceof Error ? err.message : t('createProjectWizard.bootstrapFailed'),
      );
    } finally {
      setBusy(false);
    }
  };

  const finishBootstrapSkip = async () => {
    if (!imported) return;
    setBusy(true);
    try {
      const result = await window.novelTrans.notebook.skipBootstrap(imported.project.id);
      setBootstrapWarn(result.warnings[0] ?? null);
      await onComplete(imported);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('createProjectWizard.bootstrapFailed'));
    } finally {
      setBusy(false);
    }
  };

  const importCount = preview?.scanResult.newChapters.length ?? 0;
  const gaps = preview?.scanResult.missingSequenceGaps ?? [];
  const dupes = preview?.scanResult.duplicateChapters.length ?? 0;
  const errors = preview?.scanResult.errors.length ?? 0;

  return (
    <div className="card import-wizard">
      <div className="page-header-row">
        <h2 style={{ margin: 0 }}>{t('createProjectWizard.title')}</h2>
        <span className="muted">{t(`createProjectWizard.step_${step}`)}</span>
      </div>

      {step === 'metadata' ? (
        <div className="form-stack">
          <label>
            {t('createProjectWizard.storyTitle')}
            <Input value={title} onChange={(e) => { setTitle(e.target.value); }} />
          </label>
          <label>
            {t('createProjectWizard.chineseTitle')}
            <Input value={chineseTitle} onChange={(e) => { setChineseTitle(e.target.value); }} />
          </label>
          <div className="btn-row" style={{ alignItems: 'flex-end', gap: 12 }}>
            <label style={{ flex: 1 }}>
              {t('createProjectWizard.sourceLanguage')}
              <Select
                value={sourceLanguage}
                onChange={(e) => {
                  setSourceLanguage(e.target.value);
                  setDetectionBanner(null);
                }}
              >
                <option value={LANGUAGE_AUTO}>{t('createProjectWizard.languageAuto')}</option>
                {languages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.displayNameVi}
                  </option>
                ))}
              </Select>
            </label>
            <Button
              type="button"
              disabled={!canSwapLanguages(sourceLanguage, targetLanguage)}
              onClick={swapLanguages}
              title={t('createProjectWizard.swapLanguages')}
            >
              ↔
            </Button>
            <label style={{ flex: 1 }}>
              {t('createProjectWizard.targetLanguage')}
              <Select
                value={targetLanguage}
                onChange={(e) => { setTargetLanguage(e.target.value); }}
              >
                {languages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.displayNameVi}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          {detectionBanner ? (
            <p className="muted">
              {detectionBanner} {t('createProjectWizard.detectedEditHint')}
            </p>
          ) : null}
          <label>
            {t('createProjectWizard.genre')}
            <Input value={genre} onChange={(e) => { setGenre(e.target.value); }} />
          </label>
          <label>
            {t('createProjectWizard.googleAccount')}
            <Select value={accountId} onChange={(e) => { setAccountId(e.target.value); }}>
              <option value="">{t('createProjectWizard.noAccount')}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </Select>
          </label>
          <label>
            {t('createProjectWizard.translationStyle')}
            <Select value={stylePreset} onChange={(e) => { setStylePreset(e.target.value); }}>
              <option value="balanced">{t('createProjectWizard.styleBalanced')}</option>
              <option value="literal">{t('createProjectWizard.styleLiteral')}</option>
              <option value="literary">{t('createProjectWizard.styleLiterary')}</option>
            </Select>
          </label>
          <div className="btn-row">
            <Button variant="primary" onClick={() => { setStep('folder'); }}>
              {t('actions.continue')}
            </Button>
            <Button onClick={onCancel}>{t('actions.cancel')}</Button>
          </div>
        </div>
      ) : null}

      {step === 'folder' ? (
        <div className="form-stack">
          <p className="muted">{t('createProjectWizard.folderHint')}</p>
          <div className="btn-row">
            <Button onClick={() => { void pickFolder(); }} disabled={busy}>
              {t('createProjectWizard.chooseFolder')}
            </Button>
            <span>{folderPath ?? t('createProjectWizard.noFolder')}</span>
          </div>
          <div className="btn-row">
            <label>
              {t('createProjectWizard.expectedStart')}
              <Input value={expectedStart} onChange={(e) => { setExpectedStart(e.target.value); }} />
            </label>
            <label>
              {t('createProjectWizard.expectedEnd')}
              <Input value={expectedEnd} onChange={(e) => { setExpectedEnd(e.target.value); }} />
            </label>
          </div>
          <div className="btn-row">
            <Button
              variant="primary"
              disabled={!folderPath || busy}
              onClick={() => { void scanFolder(); }}
            >
              {busy ? t('createProjectWizard.scanning') : t('createProjectWizard.scanFolder')}
            </Button>
            <Button onClick={() => { setStep('metadata'); }}>{t('importWizard.back')}</Button>
            <Button onClick={onCancel}>{t('actions.cancel')}</Button>
          </div>
        </div>
      ) : null}

      {step === 'preview' && preview ? (
        <div>
          <p>{t('createProjectWizard.scanSummary', {
            files: preview.scanResult.filesTotal,
            chapters: preview.scanResult.recognizedFiles,
            newCount: importCount,
            gaps: gaps.length,
            dupes,
            errors,
          })}</p>

          {preview.scanResult.bookMetadata ? (
            <div className="card" style={{ marginBottom: '1rem' }}>
              <h3>{t('createProjectWizard.metadataDetected')}</h3>
              <p className="muted">{t('createProjectWizard.metadataFromBookInfo')}</p>
              <ul>
                {(preview.scanResult.bookMetadata.parsed.sourceTitle ??
                  preview.scanResult.bookMetadata.parsed.titleCn) ? (
                  <li>
                    Tên gốc:{' '}
                    {preview.scanResult.bookMetadata.parsed.sourceTitle ??
                      preview.scanResult.bookMetadata.parsed.titleCn}
                  </li>
                ) : null}
                {(preview.scanResult.bookMetadata.parsed.targetTitle ??
                  preview.scanResult.bookMetadata.parsed.titleVi) ? (
                  <li>
                    Tên dịch:{' '}
                    {preview.scanResult.bookMetadata.parsed.targetTitle ??
                      preview.scanResult.bookMetadata.parsed.titleVi}
                  </li>
                ) : null}
                {preview.scanResult.bookMetadata.parsed.authorName ? (
                  <li>Tác giả: {preview.scanResult.bookMetadata.parsed.authorName}</li>
                ) : null}
                {preview.scanResult.bookMetadata.parsed.genre ? (
                  <li>Thể loại: {preview.scanResult.bookMetadata.parsed.genre}</li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {preview.scanResult.projectDocuments.length > 0 ? (
            <p>{t('createProjectWizard.documentFiles')}: {preview.scanResult.projectDocuments.map((d) => d.sourceFileName).join(', ')}</p>
          ) : null}

          {preview.scanResult.specialChapterCount > 0 ? (
            <p>{t('createProjectWizard.prologueCount', { count: preview.scanResult.specialChapterCount })}</p>
          ) : null}

          <p>{t('createProjectWizard.normalChapters')}: {preview.scanResult.normalChapterCount}</p>

          {gaps.length > 0 ? (
            <p className="banner banner-warn">
              {t('createProjectWizard.gaps', { list: gaps.slice(0, 10).join(', ') })}
            </p>
          ) : null}
          <table className="import-chapter-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('importWizard.colTitle')}</th>
                <th>{t('createProjectWizard.colFile')}</th>
              </tr>
            </thead>
            <tbody>
              {preview.scanResult.newChapters.slice(0, 200).map((ch) => (
                <tr key={ch.sourceFilePath}>
                  <td>{ch.chapterNumber}</td>
                  <td>{ch.chapterTitle}</td>
                  <td>{ch.sourceFileName}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="btn-row" style={{ marginTop: '1rem' }}>
            <Button variant="primary" onClick={() => { setStep('confirm'); }}>
              {t('actions.continue')}
            </Button>
            <Button onClick={() => { setStep('folder'); }}>{t('importWizard.back')}</Button>
          </div>
        </div>
      ) : null}

      {step === 'confirm' && preview ? (
        <div className="form-stack">
          <p>{t('createProjectWizard.confirmBody', { count: importCount, title: title.trim() })}</p>
          <div className="btn-row">
            <Button variant="primary" disabled={busy || importCount === 0} onClick={() => { void commit(); }}>
              {busy ? t('createProjectWizard.importing') : t('createProjectWizard.importChapters', { count: importCount })}
            </Button>
            <Button onClick={() => { setStep('preview'); }}>{t('importWizard.back')}</Button>
            <Button onClick={onCancel}>{t('actions.cancel')}</Button>
          </div>
        </div>
      ) : null}

      {step === 'bootstrap' && imported ? (
        <div className="form-stack">
          <h3 style={{ margin: 0 }}>{t('createProjectWizard.bootstrapTitle')}</h3>
          <p>{t('createProjectWizard.bootstrapBody')}</p>
          <p className="muted">{t('createProjectWizard.bootstrapDefault')}</p>
          {bootstrapPhase ? <p>{bootstrapPhase}</p> : null}
          {bootstrapWarn ? <p className="banner banner-warn">{bootstrapWarn}</p> : null}
          <div className="btn-row">
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => { void finishBootstrapAnalyze(); }}
            >
              {busy
                ? t('createProjectWizard.bootstrapRunning')
                : t('createProjectWizard.bootstrapAnalyze')}
            </Button>
            <Button disabled={busy} onClick={() => { void finishBootstrapSkip(); }}>
              {t('createProjectWizard.bootstrapSkip')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
