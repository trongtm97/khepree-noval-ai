import { useCallback, useState } from 'react';
import type { TabularFormat } from '@shared/constants/tabular';
import type { DataSectionId } from '@shared/constants/data-portability';
import { DATA_SECTIONS } from '@shared/constants/data-portability';
import type { TermTabularExportScope } from '@shared/constants/term-tabular';
import { TERM_TABULAR_EXPORT_SCOPES } from '@shared/constants/term-tabular';
import { useT } from '../../i18n';
import { Button, Dialog, Select } from '../ui';

interface DataExportDialogProps {
  open: boolean;
  sectionId: DataSectionId;
  projectId: string;
  editionId?: string;
  onClose: () => void;
  onComplete: (message: string) => void;
}

export function DataExportDialog({
  open,
  sectionId,
  projectId,
  editionId,
  onClose,
  onComplete,
}: DataExportDialogProps) {
  const t = useT();
  const section = DATA_SECTIONS[sectionId];
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState<TabularFormat>(
    section.dataType === 'operational_workbook' ? 'xlsx' : 'xlsx',
  );
  const [scope, setScope] = useState<TermTabularExportScope>(
    editionId ? 'current_edition' : 'current_project',
  );
  const [error, setError] = useState<string | null>(null);

  const runExport = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const exportFormat =
        section.dataType === 'operational_workbook' ? 'xlsx' : format;
      const picked = await window.khepreeNovelAI.tabular.selectExportPath({
        dataType: section.dataType,
        format: exportFormat,
        defaultName: `${sectionId}-${projectId.slice(0, 8)}`,
      });
      if (picked.canceled || !picked.filePath) return;
      const result = await window.khepreeNovelAI.tabular.export({
        dataType: section.dataType,
        format: exportFormat,
        outputPath: picked.filePath,
        projectId,
        editionId: scope === 'current_edition' ? editionId : projectId ? editionId : undefined,
        utf8Bom: true,
        exportScope: section.dataType === 'terms' ? scope : undefined,
        operationalOptions:
          section.dataType.startsWith('operational_') ? { sanitizeEmail: true } : undefined,
      });
      onComplete(t('dataHub.exported', { count: result.rowCount, format: result.format }));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  }, [editionId, format, onClose, onComplete, projectId, scope, section.dataType, sectionId, t]);

  const downloadTemplate = useCallback(async () => {
    if (!section.templateDownload) return;
    setBusy(true);
    try {
      const result = await window.khepreeNovelAI.tabular.downloadTermTemplate({});
      onComplete(t('terms.tabularTemplateSaved', { path: result.filePath }));
    } catch (err) {
      if (err instanceof Error && err.message.includes('canceled')) return;
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  }, [onComplete, section.templateDownload, t]);

  return (
    <Dialog
      open={open}
      title={t('dataHub.exportTitle', { section: t(`dataHub.sections.${sectionId}`) })}
      description={t('dataHub.exportDesc')}
      confirmLabel={t('dataHub.exportAction')}
      cancelLabel={t('actions.cancel')}
      busy={busy}
      onConfirm={() => void runExport()}
      onCancel={onClose}
    >
      <div style={{ display: 'grid', gap: 12, marginBottom: 12 }}>
        {error ? <div className="banner banner-error">{error}</div> : null}
        {section.dataType !== 'operational_workbook' ? (
          <label className="data-export-field">
            <span>{t('dataHub.exportFormat')}</span>
            <Select value={format} onChange={(e) => { setFormat(e.target.value as TabularFormat); }}>
              <option value="xlsx">{t('dataHub.formatXlsx')}</option>
              <option value="csv">{t('dataHub.formatCsv')}</option>
            </Select>
          </label>
        ) : null}
        {section.dataType === 'terms' ? (
          <label className="data-export-field">
            <span>{t('dataHub.exportScope')}</span>
            <Select
              value={scope}
              onChange={(e) => { setScope(e.target.value as TermTabularExportScope); }}
            >
              {TERM_TABULAR_EXPORT_SCOPES.filter((s) => s !== 'all_terms').map((s) => (
                <option key={s} value={s} disabled={scopeDisabled(s, projectId, editionId)}>
                  {t(`dataHub.scope.${s}`)}
                </option>
              ))}
            </Select>
          </label>
        ) : (
          <label className="data-export-field">
            <span>{t('dataHub.exportScope')}</span>
            <Select value={editionId ? 'current_edition' : 'current_project'} disabled>
              <option value="current_edition">{t('dataHub.scope.current_edition')}</option>
              <option value="current_project">{t('dataHub.scope.current_project')}</option>
            </Select>
          </label>
        )}
        {section.templateDownload ? (
          <Button variant="ghost" disabled={busy} onClick={() => void downloadTemplate()}>
            {t('dataHub.downloadTemplate')}
          </Button>
        ) : null}
      </div>
    </Dialog>
  );
}

function scopeDisabled(
  scope: TermTabularExportScope,
  projectId: string,
  editionId?: string,
): boolean {
  if (scope === 'current_project') return !projectId;
  if (scope === 'current_edition') return !projectId || !editionId;
  return false;
}
