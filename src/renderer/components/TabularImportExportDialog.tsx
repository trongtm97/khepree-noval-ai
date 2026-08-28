import { useCallback, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { TabularDataType, TabularFormat, TabularImportMode } from '@shared/constants/tabular';
import type { TabularPreviewResponse, TabularPreviewRow } from '@shared/schemas/tabular';
import { useT } from '../i18n';
import { Button, Dialog, Select } from './ui';
import { DropdownMenu } from './overlay';

type RowFilter = 'all' | 'valid' | 'warning' | 'error';

interface TabularImportExportDialogProps {
  dataType: TabularDataType;
  projectId?: string;
  editionId?: string;
  onComplete?: (message: string) => void;
  /** `dropdown` = single Nhập/Xuất menu; `inline` = separate import + export dropdown. */
  variant?: 'inline' | 'dropdown';
}

export function TabularImportExportDialog({
  dataType,
  projectId,
  editionId,
  onComplete,
  variant = 'dropdown',
}: TabularImportExportDialogProps) {
  const t = useT();
  const menuRef = useRef<HTMLButtonElement>(null);
  const exportRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<TabularPreviewResponse | null>(null);
  const [rowFilter, setRowFilter] = useState<RowFilter>('all');
  const [importMode, setImportMode] = useState<TabularImportMode>('IMPORT_VALID_ONLY');
  const [error, setError] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    if (!preview) return [];
    if (rowFilter === 'all') return preview.rows;
    return preview.rows.filter((r: TabularPreviewRow) => r.status === rowFilter);
  }, [preview, rowFilter]);

  const startImport = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const selected = await window.novelTrans.tabular.selectImportFile({
        dataType,
        format: 'any',
      });
      if (selected.canceled || !selected.filePath) return;
      const result = await window.novelTrans.tabular.preview({
        filePath: selected.filePath,
        projectId,
        editionId,
        dataTypeHint: dataType,
      });
      setPreview(result);
      setImportOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  }, [dataType, editionId, projectId, t]);

  const runExport = useCallback(
    async (format: TabularFormat) => {
      setBusy(true);
      setError(null);
      try {
        const picked = await window.novelTrans.tabular.selectExportPath({
          dataType,
          format,
          defaultName: `${dataType}-export`,
        });
        if (picked.canceled || !picked.filePath) return;
        const result = await window.novelTrans.tabular.export({
          dataType,
          format,
          outputPath: picked.filePath,
          projectId,
          editionId,
          utf8Bom: true,
        });
        onComplete?.(t('tabular.exported', { count: result.rowCount, format: result.format }));
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
      } finally {
        setBusy(false);
      }
    },
    [dataType, editionId, onComplete, projectId, t],
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
  }, [editionId, importMode, onComplete, preview, projectId, t]);

  const cancelImport = useCallback(async () => {
    if (preview) {
      await window.novelTrans.tabular.discardPreview({ previewId: preview.previewId });
    }
    setImportOpen(false);
    setPreview(null);
  }, [preview]);

  const exportMenu = (
    <>
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
    </>
  );

  const importDialog = (
    <Dialog
      open={importOpen}
      title={t('tabular.previewTitle')}
      description={
        preview
          ? t('tabular.previewStats', {
              total: preview.totalRows,
              valid: preview.validCount,
              warnings: preview.warningCount,
              errors: preview.errorCount,
            })
          : undefined
      }
      confirmLabel={t('tabular.confirmImport')}
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
              onChange={(e) => setRowFilter(e.target.value as RowFilter)}
              aria-label={t('tabular.filterRows')}
            >
              <option value="all">{t('tabular.filterAll')}</option>
              <option value="valid">{t('tabular.filterValid')}</option>
              <option value="warning">{t('tabular.filterWarning')}</option>
              <option value="error">{t('tabular.filterError')}</option>
            </Select>
            <Select
              value={importMode}
              onChange={(e) => setImportMode(e.target.value as TabularImportMode)}
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
  );

  const trigger =
    variant === 'dropdown' ? (
      <>
        <Button
          ref={menuRef}
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setMenuOpen((v) => !v);
          }}
        >
          {t('tabular.importExportMenu')}
          <ChevronDown size={14} style={{ marginLeft: 4 }} aria-hidden />
        </Button>
        <DropdownMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          anchorRef={menuRef}
          className="translation-menu"
          placement="bottom-end"
          minWidth={220}
        >
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setMenuOpen(false);
              void startImport();
            }}
          >
            {t('tabular.importShort')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setMenuOpen(false);
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
              setMenuOpen(false);
              void runExport('csv');
            }}
          >
            {t('tabular.exportCsvLabel')}
          </button>
        </DropdownMenu>
      </>
    ) : (
      <div className="nt-tabular-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void startImport()}>
          {t('tabular.importShort')}
        </Button>
        {exportMenu}
      </div>
    );

  return (
    <>
      {trigger}
      {error ? <span className="nt-error-text">{error}</span> : null}
      {importDialog}
    </>
  );
}
