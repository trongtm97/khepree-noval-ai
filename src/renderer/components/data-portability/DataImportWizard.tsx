import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TabularImportMode } from '@shared/constants/tabular';
import type { DataSectionId } from '@shared/constants/data-portability';
import { DATA_SECTIONS } from '@shared/constants/data-portability';
import type { SourceWorkbookImportMode } from '@shared/constants/source-workbook-tabular';
import type { TermTabularDuplicateStrategy } from '@shared/constants/term-tabular';
import type { TranslationSpreadsheetConflictStrategy } from '@shared/constants/translation-spreadsheet';
import type { TabularPreviewResponse } from '@shared/schemas/tabular';
import { useT } from '../../i18n';
import { Button, Select } from '../ui';
import { loadMappingPreset, saveMappingPreset } from './column-mapping-presets';

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

interface DataImportWizardProps {
  open: boolean;
  sectionId: DataSectionId;
  projectId: string;
  editionId?: string;
  onClose: () => void;
  onComplete: (message: string) => void;
}

export function DataImportWizard({
  open,
  sectionId,
  projectId,
  editionId,
  onClose,
  onComplete,
}: DataImportWizardProps) {
  const t = useT();
  const section = DATA_SECTIONS[sectionId];
  const [step, setStep] = useState<WizardStep>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [preview, setPreview] = useState<TabularPreviewResponse | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [savePreset, setSavePreset] = useState(true);
  const [importMode, setImportMode] = useState<TabularImportMode>('IMPORT_VALID_ONLY');
  const [duplicateStrategy, setDuplicateStrategy] = useState<TermTabularDuplicateStrategy>('MERGE');
  const [conflictStrategy, setConflictStrategy] =
    useState<TranslationSpreadsheetConflictStrategy>('USE_EXCEL');
  const [sourceImportMode, setSourceImportMode] =
    useState<SourceWorkbookImportMode>('METADATA_ONLY');

  const reset = useCallback(() => {
    setStep(1);
    setBusy(false);
    setError(null);
    setFilePath(null);
    setPreview(null);
    setColumnMapping(loadMappingPreset(sectionId));
    setImportMode('IMPORT_VALID_ONLY');
  }, [sectionId]);

  useEffect(() => {
    if (open) {
      reset();
      setColumnMapping(loadMappingPreset(sectionId));
    }
  }, [open, reset, sectionId]);

  const runPreview = useCallback(
    async (path: string, mapping?: Record<string, string>) => {
      const result = await window.novelTrans.tabular.preview({
        filePath: path,
        projectId,
        editionId,
        dataTypeHint: section.dataType,
        duplicateStrategy,
        conflictStrategy,
        sourceImportMode,
        columnMapping: mapping,
      });
      setPreview(result);
      return result;
    },
    [conflictStrategy, duplicateStrategy, editionId, projectId, section.dataType, sourceImportMode],
  );

  const pickFile = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const selected = await window.novelTrans.tabular.selectImportFile({
        dataType: section.dataType,
        format: 'any',
      });
      if (selected.canceled || !selected.filePath) return;
      setFilePath(selected.filePath);
      const result = await runPreview(selected.filePath);
      setStep(result.needsColumnMapping ? 3 : 2);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  }, [runPreview, section.dataType, t]);

  const applyMappingAndPreview = useCallback(async () => {
    if (!filePath) return;
    setBusy(true);
    setError(null);
    try {
      if (savePreset) saveMappingPreset(sectionId, columnMapping);
      await runPreview(filePath, columnMapping);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  }, [columnMapping, filePath, runPreview, savePreset, sectionId, t]);

  const commit = useCallback(async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.novelTrans.tabular.commit({
        previewId: preview.previewId,
        mode: importMode,
        projectId,
        editionId,
        duplicateStrategy,
        conflictStrategy,
        sourceImportMode,
      });
      if (result.rolledBack) {
        setError(result.message);
        return;
      }
      onComplete(result.message);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  }, [
    conflictStrategy,
    duplicateStrategy,
    editionId,
    importMode,
    onClose,
    onComplete,
    preview,
    projectId,
    sourceImportMode,
    t,
  ]);

  const cancel = useCallback(async () => {
    if (preview) {
      await window.novelTrans.tabular.discardPreview({ previewId: preview.previewId });
    }
    onClose();
  }, [onClose, preview]);

  const stepTitle = useMemo(() => t(`dataHub.wizard.step${step}`), [step, t]);
  const mappingFields = section.mappingFields;
  const sourceHeaders = preview?.sourceHeaders ?? [];

  if (!open) return null;

  return (
    <div className="nt-dialog-backdrop" role="presentation" onClick={() => void cancel()}>
      <div
        className="nt-dialog data-wizard-dialog"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>
          {t('dataHub.wizard.title', { section: t(`dataHub.sections.${sectionId}`) })}
        </h2>
        <p className="nt-muted-text">
          {t('dataHub.wizard.stepLabel', { step, total: 6 })} — {stepTitle}
        </p>

        <div className="data-wizard-body">
          {error ? <div className="banner banner-error">{error}</div> : null}

          {step === 1 ? <p className="nt-muted-text">{t('dataHub.wizard.step1Hint')}</p> : null}

          {step >= 2 && filePath ? (
            <p className="data-wizard-file">
              <strong>{t('dataHub.wizard.file')}:</strong> {filePath.split(/[/\\]/).pop()}
            </p>
          ) : null}

          {step === 2 && preview ? (
            <div className="data-wizard-detect">
              <p>{t('dataHub.wizard.detected')}</p>
              <strong>{t(`dataHub.sections.${sectionId}`)}</strong>
              <p className="nt-muted-text">
                {t('dataHub.wizard.detectedType', { type: preview.dataType })}
              </p>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="data-wizard-mapping">
              <p>{t('dataHub.wizard.mappingHint')}</p>
              {mappingFields.map((field) => (
                <label key={field.key} className="data-wizard-mapping-row">
                  <span>
                    {field.key}
                    {field.required ? ' *' : ''}
                  </span>
                  <Select
                    value={sourceHeaders.find((h) => columnMapping[h] === field.key) ?? ''}
                    onChange={(e) => {
                      const src = e.target.value;
                      setColumnMapping((prev) => {
                        const next = { ...prev };
                        for (const [k, v] of Object.entries(next)) {
                          if (v === field.key) delete next[k];
                        }
                        if (src) next[src] = field.key;
                        return next;
                      });
                    }}
                  >
                    <option value="">{t('dataHub.wizard.unmapped')}</option>
                    {sourceHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </Select>
                </label>
              ))}
              <label className="data-wizard-save-preset">
                <input
                  type="checkbox"
                  checked={savePreset}
                  onChange={(e) => setSavePreset(e.target.checked)}
                />
                {t('dataHub.wizard.savePreset')}
              </label>
            </div>
          ) : null}

          {step === 4 && preview ? (
            <div className="data-wizard-preview">
              <p>
                {t('dataHub.wizard.previewStats', {
                  total: preview.totalRows,
                  valid: preview.validCount,
                  warnings: preview.warningCount,
                  errors: preview.errorCount,
                })}
              </p>
              <div className="data-wizard-preview-table">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t('tabular.colStatus')}</th>
                      <th>{t('tabular.colMessages')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 50).map((row) => (
                      <tr key={row.rowIndex}>
                        <td>{row.rowIndex}</td>
                        <td>{row.status}</td>
                        <td>{row.messages.join('; ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="data-wizard-policy">
              {section.dataType === 'terms' ? (
                <Select
                  value={duplicateStrategy}
                  onChange={(e) =>
                    setDuplicateStrategy(e.target.value as TermTabularDuplicateStrategy)
                  }
                >
                  <option value="SKIP">{t('terms.tabularDup.SKIP')}</option>
                  <option value="MERGE">{t('terms.tabularDup.MERGE')}</option>
                  <option value="REPLACE_TARGET">{t('terms.tabularDup.REPLACE_TARGET')}</option>
                  <option value="CREATE_CANDIDATE">{t('terms.tabularDup.CREATE_CANDIDATE')}</option>
                </Select>
              ) : null}
              {section.dataType === 'translations' ? (
                <Select
                  value={conflictStrategy}
                  onChange={(e) =>
                    setConflictStrategy(e.target.value as TranslationSpreadsheetConflictStrategy)
                  }
                >
                  <option value="USE_EXCEL">{t('translationSpreadsheet.useExcel')}</option>
                  <option value="KEEP_APP">{t('translationSpreadsheet.keepApp')}</option>
                </Select>
              ) : null}
              {section.dataType === 'source_workbook' ? (
                <Select
                  value={sourceImportMode}
                  onChange={(e) =>
                    setSourceImportMode(e.target.value as SourceWorkbookImportMode)
                  }
                >
                  <option value="METADATA_ONLY">{t('sourceWorkbook.modeMetadataOnly')}</option>
                  <option value="UPDATE_SOURCE_CONTENT">
                    {t('sourceWorkbook.modeUpdateSource')}
                  </option>
                </Select>
              ) : null}
              <Select
                value={importMode}
                onChange={(e) => setImportMode(e.target.value as TabularImportMode)}
              >
                <option value="IMPORT_VALID_ONLY">{t('tabular.modeValidOnly')}</option>
                <option value="REQUIRE_ALL_VALID">{t('tabular.modeRequireAll')}</option>
              </Select>
            </div>
          ) : null}

          {step === 6 ? <p>{t('dataHub.wizard.confirmImport')}</p> : null}
        </div>

        <div className="data-wizard-footer nt-dialog-actions">
          <Button variant="secondary" disabled={busy} onClick={() => void cancel()}>
            {t('actions.cancel')}
          </Button>
          <div className="data-wizard-footer-right">
            {step > 1 && step < 6 ? (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setStep((s) => Math.max(1, s - 1) as WizardStep)}
              >
                {t('dataHub.wizard.back')}
              </Button>
            ) : null}
            {step === 1 ? (
              <Button variant="primary" disabled={busy} onClick={() => void pickFile()}>
                {t('dataHub.wizard.chooseFile')}
              </Button>
            ) : null}
            {step === 2 ? (
              <Button variant="primary" disabled={busy} onClick={() => setStep(4)}>
                {t('dataHub.wizard.next')}
              </Button>
            ) : null}
            {step === 3 ? (
              <Button variant="primary" disabled={busy} onClick={() => void applyMappingAndPreview()}>
                {t('dataHub.wizard.next')}
              </Button>
            ) : null}
            {step === 4 ? (
              <Button variant="primary" disabled={busy} onClick={() => setStep(5)}>
                {t('dataHub.wizard.next')}
              </Button>
            ) : null}
            {step === 5 ? (
              <Button variant="primary" disabled={busy} onClick={() => setStep(6)}>
                {t('dataHub.wizard.next')}
              </Button>
            ) : null}
            {step === 6 ? (
              <Button variant="primary" disabled={busy} onClick={() => void commit()}>
                {t('dataHub.wizard.import')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
