import { useCallback, useState } from 'react';
import type { TabularDataType, TabularFormat } from '@shared/constants/tabular';
import { useT } from '../i18n';
import { Button } from './ui';

type OperationalExportKind =
  | 'operational_jobs'
  | 'operational_qa'
  | 'operational_activity'
  | 'operational_conflicts'
  | 'operational_workbook';

interface OperationalExportDialogProps {
  projectId?: string;
  kinds?: OperationalExportKind[];
  onComplete?: (message: string) => void;
}

const DEFAULT_KINDS: OperationalExportKind[] = [
  'operational_jobs',
  'operational_qa',
  'operational_activity',
  'operational_conflicts',
  'operational_workbook',
];

export function OperationalExportDialog({
  projectId,
  kinds = DEFAULT_KINDS,
  onComplete,
}: OperationalExportDialogProps) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runExport = useCallback(
    async (dataType: TabularDataType, format: TabularFormat) => {
      setBusy(true);
      setError(null);
      try {
        const defaultName = projectId
          ? `${dataType}-${projectId.slice(0, 8)}`
          : `${dataType}-all`;
        const picked = await window.khepreeNovelAI.tabular.selectExportPath({
          dataType,
          format,
          defaultName,
        });
        if (picked.canceled || !picked.filePath) return;
        const result = await window.khepreeNovelAI.tabular.export({
          dataType,
          format,
          outputPath: picked.filePath,
          projectId,
          utf8Bom: true,
          operationalOptions: { sanitizeEmail: true },
        });
        onComplete?.(
          t('operationalExport.exported', { count: result.rowCount, format: result.format }),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
      } finally {
        setBusy(false);
      }
    },
    [onComplete, projectId, t],
  );

  const labelFor = (kind: OperationalExportKind): string => {
    switch (kind) {
      case 'operational_jobs':
        return t('operationalExport.jobs');
      case 'operational_qa':
        return t('operationalExport.qa');
      case 'operational_activity':
        return t('operationalExport.activity');
      case 'operational_conflicts':
        return t('operationalExport.conflicts');
      case 'operational_workbook':
        return t('operationalExport.workbook');
      default:
        return kind;
    }
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <p className="nt-muted-text" style={{ margin: 0, fontSize: 13 }}>
        {t('operationalExport.hint')}
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        {kinds.map((kind) => {
          const needsProject = kind === 'operational_conflicts';
          const disabled = busy || (needsProject && !projectId);
          return (
            <div
              key={kind}
              style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}
            >
              <span style={{ minWidth: 140, fontSize: 13 }}>{labelFor(kind)}</span>
              {kind === 'operational_workbook' ? (
                <Button variant="secondary" disabled={disabled} onClick={() => void runExport(kind, 'xlsx')}>
                  {t('operationalExport.exportXlsx')}
                </Button>
              ) : (
                <>
                  <Button variant="secondary" disabled={disabled} onClick={() => void runExport(kind, 'csv')}>
                    {t('operationalExport.exportCsv')}
                  </Button>
                  <Button variant="ghost" disabled={disabled} onClick={() => void runExport(kind, 'xlsx')}>
                    {t('operationalExport.exportXlsx')}
                  </Button>
                </>
              )}
            </div>
          );
        })}
      </div>
      {error ? <span className="nt-error-text">{error}</span> : null}
    </div>
  );
}
