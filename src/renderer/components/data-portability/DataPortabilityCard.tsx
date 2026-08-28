import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  BookOpen,
  Brain,
  FileText,
  FolderOpen,
  Users,
} from 'lucide-react';
import type { DataSectionId } from '@shared/constants/data-portability';
import { DATA_SECTIONS } from '@shared/constants/data-portability';
import { useT } from '../../i18n';
import { Button, Card } from '../ui';
import { DataExportMenu, type DataExportResult } from './DataExportMenu';
import { DataImportWizard } from './DataImportWizard';

const SECTION_ICONS: Record<DataSectionId, LucideIcon> = {
  translations: FileText,
  terms: BookOpen,
  characters: Users,
  knowledge: Brain,
  source: FolderOpen,
  reports: BarChart3,
};

interface DataPortabilityCardProps {
  sectionId: DataSectionId;
  projectId: string;
  editionId?: string;
  countLabel: string;
  onImportComplete: (message: string) => void;
  onExportComplete: (result: DataExportResult) => void;
  onError: (message: string) => void;
}

export function DataPortabilityCard({
  sectionId,
  projectId,
  editionId,
  countLabel,
  onImportComplete,
  onExportComplete,
  onError,
}: DataPortabilityCardProps) {
  const t = useT();
  const section = DATA_SECTIONS[sectionId];
  const [importOpen, setImportOpen] = useState(false);
  const Icon = SECTION_ICONS[sectionId];

  return (
    <>
      <Card className="data-hub-card">
        <div className="data-hub-card__icon" aria-hidden>
          <Icon size={22} />
        </div>
        <h3 className="data-hub-card-title">{t(`dataHub.sections.${sectionId}`)}</h3>
        <p className="data-hub-card-count">{countLabel}</p>
        <p className="data-hub-card-desc muted">{t(`dataHub.sectionDesc.${sectionId}`)}</p>
        <div className="data-hub-card-actions">
          {section.importable ? (
            <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
              {t('dataHub.importShort')}
            </Button>
          ) : null}
          {section.exportable ? (
            <DataExportMenu
              sectionId={sectionId}
              projectId={projectId}
              editionId={editionId}
              onComplete={onExportComplete}
              onError={onError}
            />
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
          onComplete={onImportComplete}
        />
      ) : null}
    </>
  );
}
