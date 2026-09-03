import { useCallback, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { TabularFormat, TabularImportMode } from '@shared/constants/tabular';
import type {
  TermTabularDefaultStatus,
  TermTabularDuplicateStrategy,
  TermTabularExportScope,
} from '@shared/constants/term-tabular';
import { TERM_TABULAR_DUPLICATE_STRATEGIES, TERM_TABULAR_EXPORT_SCOPES } from '@shared/constants/term-tabular';
import type { TabularPreviewResponse, TabularPreviewRow } from '@shared/schemas/tabular';
import { useT } from '../i18n';
import { Button, Dialog, Select } from './ui';
import { DropdownMenu } from './overlay';
import { useUiShellStore } from '../stores/ui-shell-store';

type RowFilter = 'all' | 'valid' | 'warning' | 'error';

interface TermVaultTabularDialogProps {
  projectId?: string;
  editionId?: string;
  onComplete?: (message: string) => void;
  /** `dropdown` = single Nhập/Xuất menu trigger; `inline` = separate buttons (legacy). */
  variant?: 'inline' | 'dropdown';
}

function parseTermCommitMessage(message: string): { inserted: number; updated: number; skipped: number } | null {
  if (!message.startsWith('terms:')) return null;
  const parts = message.split(':');
  if (parts.length < 4) return null;
  return {
    inserted: Number(parts[1]) || 0,
    updated: Number(parts[2]) || 0,
    skipped: Number(parts[3]) || 0,
  };
}

export function TermVaultTabularDialog({
  projectId,
  editionId,
  onComplete,
  variant = 'inline',
}: TermVaultTabularDialogProps) {
  const t = useT();
  const showAdvancedTools = useUiShellStore((s) => s.showAdvancedTools);
  const menuRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<TabularPreviewResponse | null>(null);
  const [rowFilter, setRowFilter] = useState<RowFilter>('all');
  const [importMode, setImportMode] = useState<TabularImportMode>('IMPORT_VALID_ONLY');
  const [duplicateStrategy, setDuplicateStrategy] =
    useState<TermTabularDuplicateStrategy>('MERGE');
  const defaultImportStatus: TermTabularDefaultStatus = projectId ? 'PROJECT_VERIFIED' : 'CANDIDATE';
  const [allowElevatedStatus, setAllowElevatedStatus] = useState(false);
  const [exportFormat, setExportFormat] = useState<TabularFormat>('xlsx');
  const [exportScope, setExportScope] = useState<TermTabularExportScope>(
    projectId && editionId ? 'current_edition' : projectId ? 'current_project' : 'all_terms',
  );
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
      const selected = await window.khepreeNovelAI.tabular.selectImportFile({
        dataType: 'terms',
        format: 'any',
      });
      if (selected.canceled || !selected.filePath) return;
      const result = await window.khepreeNovelAI.tabular.preview({
        filePath: selected.filePath,
        projectId,
        editionId,
        dataTypeHint: 'terms',
        duplicateStrategy,
        defaultImportStatus,
        allowElevatedStatus,
      });
      setPreview(result);
      setImportOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  }, [
    allowElevatedStatus,
    defaultImportStatus,
    duplicateStrategy,
    editionId,
    projectId,
    t,
  ]);

  const runExport = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const picked = await window.khepreeNovelAI.tabular.selectExportPath({
        dataType: 'terms',
        format: exportFormat,
        defaultName: `terms-${exportScope}`,
      });
      if (picked.canceled || !picked.filePath) return;
      const result = await window.khepreeNovelAI.tabular.export({
        dataType: 'terms',
        format: exportFormat,
        outputPath: picked.filePath,
        projectId,
        editionId,
        utf8Bom: true,
        exportScope,
      });
      setExportOpen(false);
      onComplete?.(t('terms.tabularExported', { count: result.rowCount, format: result.format }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  }, [editionId, exportFormat, exportScope, onComplete, projectId, t]);

  const downloadTemplate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.khepreeNovelAI.tabular.downloadTermTemplate({});
      onComplete?.(t('terms.tabularTemplateSaved', { path: result.filePath }));
    } catch (err) {
      if (err instanceof Error && err.message.includes('canceled')) return;
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  }, [onComplete, t]);

  const commitImport = useCallback(async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.khepreeNovelAI.tabular.commit({
        previewId: preview.previewId,
        mode: importMode,
        projectId,
        editionId,
        duplicateStrategy,
        defaultImportStatus,
        allowElevatedStatus,
      });
      if (result.rolledBack) {
        setError(result.message);
        return;
      }
      setImportOpen(false);
      setPreview(null);
      const parsed = parseTermCommitMessage(result.message);
      onComplete?.(
        parsed
          ? t('terms.tabularImported', parsed)
          : result.message,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  }, [
    allowElevatedStatus,
    defaultImportStatus,
    duplicateStrategy,
    editionId,
    importMode,
    onComplete,
    preview,
    projectId,
    t,
  ]);

  const cancelImport = useCallback(async () => {
    if (preview) {
      await window.khepreeNovelAI.tabular.discardPreview({ previewId: preview.previewId });
    }
    setImportOpen(false);
    setPreview(null);
  }, [preview]);

  const rawImport = useCallback(async () => {
    const content = window.prompt(t('terms.promptImport'));
    if (!content?.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const format: 'csv' | 'json' = content.trim().startsWith('[') ? 'json' : 'csv';
      const result = await window.khepreeNovelAI.terms.import({
        format,
        content,
        scope: 'GLOBAL',
      });
      onComplete?.(t('terms.imported', { count: result.terms.length }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  }, [onComplete, t]);

  const rawExportJson = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.khepreeNovelAI.terms.export({ format: 'json', filters: {} });
      await navigator.clipboard.writeText(result.content);
      onComplete?.(t('terms.exported', { count: result.count, format: 'json' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  }, [onComplete, t]);

  const dialogs = (
    <>
      <Dialog
        open={importOpen}
        title={t('terms.tabularPreviewTitle')}
        description={
          preview
            ? t('terms.tabularPreviewStats', {
                total: preview.totalRows,
                valid: preview.validCount,
                warnings: preview.warningCount,
                errors: preview.errorCount,
                duplicates: preview.duplicateCount ?? 0,
              })
            : undefined
        }
        confirmLabel={t('terms.tabularConfirmImport')}
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
              </Select>
              <Select
                value={duplicateStrategy}
                onChange={(e) =>
                  { setDuplicateStrategy(e.target.value as TermTabularDuplicateStrategy); }
                }
                aria-label={t('terms.tabularDuplicateStrategy')}
              >
                {TERM_TABULAR_DUPLICATE_STRATEGIES.map((s) => (
                  <option key={s} value={s}>
                    {t(`terms.tabularDup.${s}`)}
                  </option>
                ))}
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
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={allowElevatedStatus}
                onChange={(e) => { setAllowElevatedStatus(e.target.checked); }}
              />
              {t('terms.tabularAllowElevated')}
            </label>
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
                    <th>{t('terms.source')}</th>
                    <th>{t('terms.target')}</th>
                    <th>{t('tabular.colMessages')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row: TabularPreviewRow) => (
                    <tr key={row.rowIndex}>
                      <td>{row.rowIndex}</td>
                      <td>{row.status}</td>
                      <td>{row.data.source_text || '—'}</td>
                      <td>{row.data.target_text || '—'}</td>
                      <td>{row.messages.join('; ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={exportOpen}
        title={t('terms.tabularExportTitle')}
        description={t('terms.tabularExportDesc')}
        confirmLabel={t('terms.tabularExport')}
        cancelLabel={t('actions.cancel')}
        busy={busy}
        onConfirm={() => void runExport()}
        onCancel={() => { setExportOpen(false); }}
      >
        <div style={{ display: 'grid', gap: 12, marginBottom: 12 }}>
          <Select
            value={exportScope}
            onChange={(e) => { setExportScope(e.target.value as TermTabularExportScope); }}
            aria-label={t('terms.tabularExportScope')}
          >
            {TERM_TABULAR_EXPORT_SCOPES.map((scope) => (
              <option key={scope} value={scope} disabled={scopeNeedsProject(scope, projectId, editionId)}>
                {t(`terms.tabularScope.${scope}`)}
              </option>
            ))}
          </Select>
          <Select
            value={exportFormat}
            onChange={(e) => { setExportFormat(e.target.value as TabularFormat); }}
            aria-label={t('terms.tabularExportFormat')}
          >
            <option value="xlsx">XLSX</option>
            <option value="csv">CSV</option>
          </Select>
        </div>
      </Dialog>
    </>
  );

  if (variant === 'dropdown') {
    return (
      <>
        <Button
          ref={menuRef}
          variant="secondary"
          disabled={busy}
          onClick={() => { setMenuOpen((o) => !o); }}
        >
          {t('terms.importExportMenu')}
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
            {t('terms.tabularImport')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setMenuOpen(false);
              setExportFormat('xlsx');
              setExportOpen(true);
            }}
          >
            {t('terms.exportXlsx')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setMenuOpen(false);
              setExportFormat('csv');
              void runExport();
            }}
          >
            {t('terms.exportCsvMenu')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setMenuOpen(false);
              void downloadTemplate();
            }}
          >
            {t('terms.tabularTemplate')}
          </button>
          {showAdvancedTools ? (
            <>
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  setMenuOpen(false);
                  void rawExportJson();
                }}
              >
                {t('terms.exportJsonMenu')}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  setMenuOpen(false);
                  void rawImport();
                }}
              >
                {t('terms.rawImportMenu')}
              </button>
            </>
          ) : null}
        </DropdownMenu>
        {error ? <span className="nt-error-text">{error}</span> : null}
        {dialogs}
      </>
    );
  }

  return (
    <div className="nt-term-tabular-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Button variant="secondary" disabled={busy} onClick={() => void startImport()}>
        {t('terms.tabularImport')}
      </Button>
      <Button variant="secondary" disabled={busy} onClick={() => { setExportOpen(true); }}>
        {t('terms.tabularExport')}
      </Button>
      <Button variant="ghost" disabled={busy} onClick={() => void downloadTemplate()}>
        {t('terms.tabularTemplate')}
      </Button>
      {error ? <span className="nt-error-text">{error}</span> : null}
      {dialogs}
    </div>
  );
}

function scopeNeedsProject(
  scope: TermTabularExportScope,
  projectId?: string,
  editionId?: string,
): boolean {
  if (scope === 'current_project') return !projectId;
  if (scope === 'current_edition') return !projectId || !editionId;
  return false;
}
