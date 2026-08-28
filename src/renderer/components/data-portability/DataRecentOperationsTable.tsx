import { MoreHorizontal } from 'lucide-react';
import type { TabularImportHistoryEntry } from '@shared/schemas/tabular';
import type { DataSectionId } from '@shared/constants/data-portability';
import { useT } from '../../i18n';
import { Button, DataTable, IconButton } from '../ui';

const DATA_TYPE_SECTION: Record<string, DataSectionId | 'unknown'> = {
  terms: 'terms',
  characters: 'characters',
  project_data: 'knowledge',
  source_workbook: 'source',
  translations: 'translations',
  operational_workbook: 'reports',
};

interface DataRecentOperationsTableProps {
  entries: TabularImportHistoryEntry[];
  busy: boolean;
  onUndo: (entryId: string) => void;
  onViewReport: (entry: TabularImportHistoryEntry) => void;
}

export function DataRecentOperationsTable({
  entries,
  busy,
  onUndo,
  onViewReport,
}: DataRecentOperationsTableProps) {
  const t = useT();
  const locale = 'vi-VN';

  if (entries.length === 0) {
    return <p className="muted">{t('dataHub.recentEmpty')}</p>;
  }

  const latestId = entries[0]?.id;

  const columns = [
    {
      key: 'time',
      header: t('dataHub.recentColTime'),
      width: '5.5rem',
      render: (e: TabularImportHistoryEntry) =>
        new Date(e.createdAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
    },
    {
      key: 'type',
      header: t('dataHub.recentColType'),
      width: '9rem',
      render: (e: TabularImportHistoryEntry) => {
        const section = DATA_TYPE_SECTION[e.dataType] ?? 'unknown';
        return section === 'unknown'
          ? e.dataType
          : t(`dataHub.sections.${section}`);
      },
    },
    {
      key: 'action',
      header: t('dataHub.recentColAction'),
      width: '8rem',
      render: (e: TabularImportHistoryEntry) =>
        t('dataHub.recentActionImport', { format: e.fileFormat.toUpperCase() }),
    },
    {
      key: 'file',
      header: t('dataHub.recentColFile'),
      render: (e: TabularImportHistoryEntry) => e.fileName,
    },
    {
      key: 'result',
      header: t('dataHub.recentColResult'),
      width: '10rem',
      render: (e: TabularImportHistoryEntry) => {
        const ok = e.status === 'completed' || e.status === 'success' || e.errorCount === 0;
        return ok
          ? t('dataHub.recentResultOk', { count: e.rowCount })
          : t('dataHub.recentResultPartial', { count: e.rowCount, errors: e.errorCount });
      },
    },
    {
      key: 'actions',
      header: '',
      width: '6rem',
      render: (e: TabularImportHistoryEntry) => (
        <div className="data-recent-row-actions">
          {e.id === latestId && e.dataType !== 'operational_workbook' ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onUndo(e.id)}>
              {t('dataHub.undoImport')}
            </Button>
          ) : null}
          <IconButton label={t('common.moreActions')} onClick={() => onViewReport(e)}>
            <MoreHorizontal size={16} />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={entries.slice(0, 20)}
      rowKey={(row) => row.id}
    />
  );
}
