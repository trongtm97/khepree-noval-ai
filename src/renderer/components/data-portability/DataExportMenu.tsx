import { useCallback, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { TabularFormat } from '@shared/constants/tabular';
import type { DataSectionId } from '@shared/constants/data-portability';
import { DATA_SECTIONS } from '@shared/constants/data-portability';
import type { TermTabularExportScope } from '@shared/constants/term-tabular';
import { useT } from '../../i18n';
import { Button } from '../ui';
import { DropdownMenu } from '../overlay';
import { useUiShellStore } from '../../stores/ui-shell-store';
import { buildDataExportOutputPath, defaultExportFileName } from './data-export-path';

export interface DataExportResult {
  message: string;
  filePath: string;
}

interface DataExportMenuProps {
  sectionId: DataSectionId;
  projectId: string;
  editionId?: string;
  disabled?: boolean;
  onComplete: (result: DataExportResult) => void;
  onError: (message: string) => void;
}

export function DataExportMenu({
  sectionId,
  projectId,
  editionId,
  disabled = false,
  onComplete,
  onError,
}: DataExportMenuProps) {
  const t = useT();
  const showAdvancedTools = useUiShellStore((s) => s.showAdvancedTools);
  const section = DATA_SECTIONS[sectionId];
  const menuRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const scope: TermTabularExportScope = editionId ? 'current_edition' : 'current_project';

  const runExport = useCallback(
    async (format: TabularFormat | 'json') => {
      setBusy(true);
      try {
        if (format === 'json' && section.dataType === 'terms') {
          const result = await window.khepreeNovelAI.terms.export({ format: 'json', filters: {} });
          await navigator.clipboard.writeText(result.content);
          onComplete({
            message: t('dataHub.exportJsonClipboard', { count: result.count }),
            filePath: '',
          });
          return;
        }

        const exportFormat = section.dataType === 'operational_workbook' ? 'xlsx' : (format as TabularFormat);
        const ext = exportFormat === 'xlsx' ? 'xlsx' : 'csv';
        const fileName = defaultExportFileName(sectionId, projectId, ext);
        let outputPath: string;

        const built = await buildDataExportOutputPath({ projectId, editionId, fileName });
        if (built.ok) {
          outputPath = built.outputPath;
        } else {
          const picked = await window.khepreeNovelAI.tabular.selectExportPath({
            dataType: section.dataType,
            format: exportFormat,
            defaultName: `${sectionId}-export`,
          });
          if (picked.canceled || !picked.filePath) return;
          outputPath = picked.filePath;
        }

        const result = await window.khepreeNovelAI.tabular.export({
          dataType: section.dataType,
          format: exportFormat,
          outputPath,
          projectId,
          editionId: scope === 'current_edition' ? editionId : editionId,
          utf8Bom: true,
          exportScope: section.dataType === 'terms' ? scope : undefined,
          operationalOptions:
            section.dataType.startsWith('operational_') ? { sanitizeEmail: true } : undefined,
        });

        onComplete({
          message: t('dataHub.exportSuccessSection', { section: t(`dataHub.sections.${sectionId}`) }),
          filePath: result.filePath,
        });
      } catch (err) {
        onError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
      } finally {
        setBusy(false);
      }
    },
    [editionId, onComplete, onError, projectId, scope, section.dataType, sectionId, t],
  );

  if (!section.exportable) return null;

  return (
    <>
      <Button
        ref={menuRef}
        variant="secondary"
        size="sm"
        disabled={disabled || busy}
        onClick={() => setOpen((v) => !v)}
      >
        {t('dataHub.exportMenu')}
        <ChevronDown size={14} style={{ marginLeft: 4 }} aria-hidden />
      </Button>
      <DropdownMenu
        open={open}
        onOpenChange={setOpen}
        anchorRef={menuRef}
        className="translation-menu"
        placement="bottom-end"
        minWidth={200}
      >
        {section.dataType !== 'operational_workbook' ? (
          <>
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                void runExport('xlsx');
              }}
            >
              {t('dataHub.formatXlsx')}
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                void runExport('csv');
              }}
            >
              {t('dataHub.formatCsv')}
            </button>
          </>
        ) : (
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setOpen(false);
              void runExport('xlsx');
            }}
          >
            {t('dataHub.formatXlsx')}
          </button>
        )}
        {showAdvancedTools && section.dataType === 'terms' ? (
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setOpen(false);
              void runExport('json');
            }}
          >
            {t('dataHub.formatJson')}
          </button>
        ) : null}
      </DropdownMenu>
    </>
  );
}
