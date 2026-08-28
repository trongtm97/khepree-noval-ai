import { useState } from 'react';
import type { DataSectionId } from '@shared/constants/data-portability';
import { DATA_SECTIONS } from '@shared/constants/data-portability';
import { useT } from '../../i18n';
import { Button, Card } from '../ui';
import { DataExportDialog } from './DataExportDialog';
import { DataImportWizard } from './DataImportWizard';

interface DataPortabilityCardProps {
  sectionId: DataSectionId;
  projectId: string;
  editionId?: string;
  countLabel: string;
  onComplete: (message: string) => void;
}

export function DataPortabilityCard({
  sectionId,
  projectId,
  editionId,
  countLabel,
  onComplete,
}: DataPortabilityCardProps) {
  const t = useT();
  const section = DATA_SECTIONS[sectionId];
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <>
      <Card className="data-hub-card">
        <h3 className="data-hub-card-title">{t(`dataHub.sections.${sectionId}`)}</h3>
        <p className="data-hub-card-count">{countLabel}</p>
        <div className="data-hub-card-actions">
          {section.importable ? (
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              {t('dataHub.import')}
            </Button>
          ) : null}
          {section.exportable ? (
            <Button variant="secondary" onClick={() => setExportOpen(true)}>
              {t('dataHub.export')}
            </Button>
          ) : null}
          {section.templateDownload ? (
            <Button
              variant="ghost"
              onClick={() => {
                void window.novelTrans.tabular
                  .downloadTermTemplate({})
                  .then((r) => onComplete(t('terms.tabularTemplateSaved', { path: r.filePath })))
                  .catch(() => undefined);
              }}
            >
              {t('dataHub.downloadTemplate')}
            </Button>
          ) : null}
        </div>
      </Card>

      {section.importable ? (
        <DataImportWizard
          open={importOpen}
          sectionId={sectionId}
          projectId={projectId}
          editionId={editionId}
          onClose={() => setImportOpen(false)}
          onComplete={onComplete}
        />
      ) : null}

      {section.exportable ? (
        <DataExportDialog
          open={exportOpen}
          sectionId={sectionId}
          projectId={projectId}
          editionId={editionId}
          onClose={() => setExportOpen(false)}
          onComplete={onComplete}
        />
      ) : null}
    </>
  );
}
