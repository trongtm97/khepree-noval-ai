import { useCallback, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { TabularFormat, TabularImportMode } from '@shared/constants/tabular';
import type { SourceWorkbookImportMode } from '@shared/constants/source-workbook-tabular';
import { SOURCE_WORKBOOK_WARNINGS } from '@shared/constants/source-workbook-tabular';
import type { TabularPreviewResponse, TabularPreviewRow } from '@shared/schemas/tabular';
import { useT } from '../i18n';
import { Button, Dialog, Select } from './ui';
import { DropdownMenu } from './overlay';

type RowFilter = 'all' | 'valid' | 'warning' | 'error' | 'blocked';

interface SourceWorkbookDialogProps {
  projectId: string;
  onComplete?: (message: string) => void;
}

export function SourceWorkbookDialog({ projectId, onComplete }: SourceWorkbookDialogProps) {
  const t = useT();
  const exportRef = useRef<HTMLButtonElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<TabularPreviewResponse | null>(null);
  const [rowFilter, setRowFilter] = useState<RowFilter>('all');
  const [importMode, setImportMode] = useState<TabularImportMode>('IMPORT_VALID_ONLY');
  const [sourceImportMode, setSourceImportMode] =
    useState<SourceWorkbookImportMode>('METADATA_ONLY');
  const [error, setError] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    if (!preview) return [];
    if (rowFilter === 'all') return preview.rows;
    if (rowFilter === 'blocked') {
      return preview.rows.filter((r) =>
        r.messages.includes(SOURCE_WORKBOOK_WARNINGS.SOURCE_OVERWRITE_BLOCKED),
      );
    }
    return preview.rows.filter((r: TabularPreviewRow) => r.status === rowFilter);
  }, [preview, rowFilter]);

  const startImport = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const selected = await window.khepreeNovelAI.tabular.selectImportFile({
        dataType: 'source_workbook',
        format: 'any',
      });
      if (selected.canceled || !selected.filePath) return;
      const result = await window.khepreeNovelAI.tabular.preview({
        filePath: selected.filePath,
        projectId,
        dataTypeHint: 'source_workbook',
        sourceImportMode,
      });
      setPreview(result);
      setImportOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  }, [projectId, sourceImportMode, t]);

  const runExport = useCallback(
    async (format: TabularFormat) => {
      setBusy(true);
      setError(null);
      try {
        const picked = await window.khepreeNovelAI.tabular.selectExportPath({
          dataType: 'source_workbook',
          format,
          defaultName: `source-${projectId.slice(0, 8)}`,
        });
        if (picked.canceled || !picked.filePath) return;
        const result = await window.khepreeNovelAI.tabular.export({
          dataType: 'source_workbook',
          format,
          outputPath: picked.filePath,
          projectId,
          utf8Bom: true,
        });
        onComplete?.(t('sourceWorkbook.exported', { count: result.rowCount, format: result.format }));
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
      } finally {
        setBusy(false);
      }
    },
    [onComplete, projectId, t],
  );

  const commitImport = useCallback(async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.khepreeNovelAI.tabular.commit({
        previewId: preview.previewId,
        mode: importMode,
        projectId,
        sourceImportMode,
      });
      if (result.rolledBack) {
        setError(result.message);
        return;
      }
      setImportOpen(false);
      setPreview(null);
      onComplete?.(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  }, [importMode, onComplete, preview, projectId, sourceImportMode, t]);

  const cancelImport = useCallback(async () => {
    if (preview) {
      await window.khepreeNovelAI.tabular.discardPreview({ previewId: preview.previewId });
    }
    setImportOpen(false);
    setPreview(null);
  }, [preview]);

  return (
    <div className="nt-tabular-actions" style={{ display: 'grid', gap: 8 }}>
      <p className="nt-muted-text" style={{ margin: 0, fontSize: 13 }}>
        {t('sourceWorkbook.importHint')}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Select
          value={sourceImportMode}
          onChange={(e) => {
            setSourceImportMode(e.target.value as SourceWorkbookImportMode);
          }}
          aria-label={t('sourceWorkbook.sourceImportMode')}
        >
          <option value="METADATA_ONLY">{t('sourceWorkbook.modeMetadataOnly')}</option>
          <option value="UPDATE_SOURCE_CONTENT">{t('sourceWorkbook.modeUpdateSource')}</option>
        </Select>
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void startImport()}>
          {t('tabular.importShort')}
        </Button>
        <Button
          ref={exportRef}
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => {
            setExportOpen((v) => !v);
          }}
        >
          {t('tabular.exportMenu')}
          <ChevronDown size={14} style={{ marginLeft: 4 }} aria-hidden />
        </Button>
        <DropdownMenu
          open={exportOpen}
          onOpenChange={setExportOpen}
          anchorRef={exportRef}
          className="translation-menu"
          placement="bottom-end"
          minWidth={200}
        >
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setExportOpen(false);
              void runExport('xlsx');
            }}
          >
            {t('tabular.exportXlsxLabel')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setExportOpen(false);
              void runExport('csv');
            }}
          >
            {t('tabular.exportCsvLabel')}
          </button>
        </DropdownMenu>
        {error ? <span className="nt-error-text">{error}</span> : null}
      </div>

      <Dialog
        open={importOpen}
        title={t('sourceWorkbook.previewTitle')}
        description={
          preview
            ? t('sourceWorkbook.previewStats', {
                total: preview.totalRows,
                valid: preview.validCount,
                warnings: preview.warningCount,
                errors: preview.errorCount,
                conflicts: preview.conflictCount ?? 0,
              })
            : undefined
        }
        confirmLabel={t('sourceWorkbook.confirmImport')}
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
                onChange={(e) => { setRowFilter(e.target.value as RowFilter); }}
                aria-label={t('tabular.filterRows')}
              >
                <option value="all">{t('tabular.filterAll')}</option>
                <option value="valid">{t('tabular.filterValid')}</option>
                <option value="warning">{t('tabular.filterWarning')}</option>
                <option value="error">{t('tabular.filterError')}</option>
                <option value="blocked">{t('sourceWorkbook.filterBlocked')}</option>
              </Select>
              <Select
                value={importMode}
                onChange={(e) => { setImportMode(e.target.value as TabularImportMode); }}
                aria-label={t('tabular.importMode')}
              >
                <option value="IMPORT_VALID_ONLY">{t('tabular.modeValidOnly')}</option>
                <option value="REQUIRE_ALL_VALID">{t('tabular.modeRequireAll')}</option>
              </Select>
            </div>
            <div
              style={{
                maxHeight: 320,
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
                    <th>{t('tabular.colMessages')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row: TabularPreviewRow) => (
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
      </Dialog>
    </div>
  );
}
