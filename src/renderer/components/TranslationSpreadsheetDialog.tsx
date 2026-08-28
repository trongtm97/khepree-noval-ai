import { useCallback, useMemo, useState } from 'react';
import type { TabularFormat, TabularImportMode } from '@shared/constants/tabular';
import type { TranslationSpreadsheetConflictStrategy } from '@shared/constants/translation-spreadsheet';
import { TRANSLATION_SPREADSHEET_WARNINGS } from '@shared/constants/translation-spreadsheet';
import type { TabularPreviewResponse, TabularPreviewRow } from '@shared/schemas/tabular';
import { useT } from '../i18n';
import { Button, Dialog, Drawer, Select } from './ui';

type RowFilter = 'all' | 'valid' | 'warning' | 'error' | 'conflicts';

interface TranslationSpreadsheetDialogProps {
  projectId: string;
  editionId: string;
  open: boolean;
  onClose: () => void;
  onComplete?: (message: string) => void;
  onImported?: () => void;
}

function parseTranslationCommitMessage(
  message: string,
): { inserted: number; updated: number; skipped: number } | null {
  if (!message.startsWith('translations:')) return null;
  const parts = message.split(':');
  if (parts.length < 4) return null;
  return {
    inserted: Number(parts[1]) || 0,
    updated: Number(parts[2]) || 0,
    skipped: Number(parts[3]) || 0,
  };
}

export function TranslationSpreadsheetDialog({
  projectId,
  editionId,
  open,
  onClose,
  onComplete,
  onImported,
}: TranslationSpreadsheetDialogProps) {
  const t = useT();
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<TabularPreviewResponse | null>(null);
  const [rowFilter, setRowFilter] = useState<RowFilter>('all');
  const [importMode, setImportMode] = useState<TabularImportMode>('IMPORT_VALID_ONLY');
  const [conflictStrategy, setConflictStrategy] =
    useState<TranslationSpreadsheetConflictStrategy>('USE_EXCEL');
  const [compareRow, setCompareRow] = useState<TabularPreviewRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    if (!preview) return [];
    if (rowFilter === 'all') return preview.rows;
    if (rowFilter === 'conflicts') {
      return preview.rows.filter((r) =>
        r.messages.includes(TRANSLATION_SPREADSHEET_WARNINGS.CONFLICT_APP_NEWER),
      );
    }
    return preview.rows.filter((r: TabularPreviewRow) => r.status === rowFilter);
  }, [preview, rowFilter]);

  const startImport = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const selected = await window.novelTrans.tabular.selectImportFile({
        dataType: 'translations',
        format: 'any',
      });
      if (selected.canceled || !selected.filePath) return;
      const result = await window.novelTrans.tabular.preview({
        filePath: selected.filePath,
        projectId,
        editionId,
        dataTypeHint: 'translations',
        conflictStrategy,
      });
      setPreview(result);
      setImportOpen(true);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  }, [conflictStrategy, editionId, onClose, projectId, t]);

  const runExport = useCallback(
    async (format: TabularFormat) => {
      setBusy(true);
      setError(null);
      try {
        const picked = await window.novelTrans.tabular.selectExportPath({
          dataType: 'translations',
          format,
          defaultName: `translations-${projectId.slice(0, 8)}`,
        });
        if (picked.canceled || !picked.filePath) return;
        const result = await window.novelTrans.tabular.export({
          dataType: 'translations',
          format,
          outputPath: picked.filePath,
          projectId,
          editionId,
          utf8Bom: true,
        });
        onComplete?.(
          t('translationSpreadsheet.exported', { count: result.rowCount, format: result.format }),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
      } finally {
        setBusy(false);
      }
    },
    [editionId, onComplete, projectId, t],
  );

  const commitImport = useCallback(async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.novelTrans.tabular.commit({
        previewId: preview.previewId,
        mode: importMode,
        projectId,
        editionId,
        conflictStrategy,
      });
      if (result.rolledBack) {
        setError(result.message);
        return;
      }
      setImportOpen(false);
      setPreview(null);
      const parsed = parseTranslationCommitMessage(result.message);
      onComplete?.(
        parsed ? t('translationSpreadsheet.imported', parsed) : result.message,
      );
      onImported?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  }, [conflictStrategy, editionId, importMode, onComplete, onImported, preview, projectId, t]);

  const cancelImport = useCallback(async () => {
    if (preview) {
      await window.novelTrans.tabular.discardPreview({ previewId: preview.previewId });
    }
    setImportOpen(false);
    setPreview(null);
    setCompareRow(null);
  }, [preview]);

  return (
    <>
      <Drawer open={open} title={t('translation.excelCsvData')} onClose={onClose}>
        <div className="translation-spreadsheet-hub">
          <Button variant="secondary" disabled={busy} onClick={() => void startImport()}>
            {t('translationSpreadsheet.import')}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void runExport('xlsx')}>
            {t('translationSpreadsheet.exportXlsx')}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => void runExport('csv')}>
            {t('translationSpreadsheet.exportCsv')}
          </Button>
          {error ? <span className="nt-error-text">{error}</span> : null}
        </div>
      </Drawer>

      <Dialog
        open={importOpen}
        title={t('translationSpreadsheet.previewTitle')}
        description={
          preview
            ? t('translationSpreadsheet.previewStats', {
                total: preview.totalRows,
                valid: preview.validCount,
                warnings: preview.warningCount,
                errors: preview.errorCount,
                conflicts: preview.conflictCount ?? 0,
              })
            : undefined
        }
        confirmLabel={t('translationSpreadsheet.confirmImport')}
        cancelLabel={t('actions.cancel')}
        busy={busy}
        onConfirm={() => void commitImport()}
        onCancel={() => void cancelImport()}
      >
        {preview ? (
          <div style={{ display: 'grid', gap: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Select
                value={rowFilter}
                onChange={(e) => {
                  setRowFilter(e.target.value as RowFilter);
                }}
                aria-label={t('tabular.filterRows')}
              >
                <option value="all">{t('tabular.filterAll')}</option>
                <option value="valid">{t('tabular.filterValid')}</option>
                <option value="warning">{t('tabular.filterWarning')}</option>
                <option value="error">{t('tabular.filterError')}</option>
                <option value="conflicts">{t('translationSpreadsheet.filterConflicts')}</option>
              </Select>
              <Select
                value={conflictStrategy}
                onChange={(e) => {
                  setConflictStrategy(e.target.value as TranslationSpreadsheetConflictStrategy);
                }}
                aria-label={t('translationSpreadsheet.conflictStrategy')}
              >
                <option value="USE_EXCEL">{t('translationSpreadsheet.useExcel')}</option>
                <option value="KEEP_APP">{t('translationSpreadsheet.keepApp')}</option>
              </Select>
              <Select
                value={importMode}
                onChange={(e) => {
                  setImportMode(e.target.value as TabularImportMode);
                }}
                aria-label={t('tabular.importMode')}
              >
                <option value="IMPORT_VALID_ONLY">{t('tabular.modeValidOnly')}</option>
                <option value="REQUIRE_ALL_VALID">{t('tabular.modeRequireAll')}</option>
              </Select>
            </div>
            <div
              style={{
                maxHeight: 280,
                overflow: 'auto',
                border: '1px solid var(--nt-border)',
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('tabular.colStatus')}</th>
                    <th>ID</th>
                    <th>{t('translationSpreadsheet.colMessages')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row: TabularPreviewRow) => (
                    <tr key={row.rowIndex}>
                      <td>{row.rowIndex}</td>
                      <td>{row.status}</td>
                      <td>{row.data.paragraph_id}</td>
                      <td>{row.messages.join('; ') || '—'}</td>
                      <td>
                        {row.messages.includes(
                          TRANSLATION_SPREADSHEET_WARNINGS.CONFLICT_APP_NEWER,
                        ) ? (
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setCompareRow(row);
                            }}
                          >
                            {t('translationSpreadsheet.compare')}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {compareRow ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  fontSize: 12,
                  border: '1px solid var(--nt-border)',
                  borderRadius: 6,
                  padding: 8,
                }}
              >
                <div>
                  <strong>{t('translationSpreadsheet.excelValue')}</strong>
                  <pre style={{ whiteSpace: 'pre-wrap' }}>{compareRow.data.translated_text}</pre>
                </div>
                <div>
                  <strong>{t('translationSpreadsheet.appValue')}</strong>
                  <pre style={{ whiteSpace: 'pre-wrap' }}>
                    {compareRow.data.db_translated_text}
                  </pre>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
