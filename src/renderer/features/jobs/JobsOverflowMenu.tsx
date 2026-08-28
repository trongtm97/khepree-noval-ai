import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { OperationalExportDialog } from '../../components/OperationalExportDialog';
import { DropdownMenu } from '../../components/overlay';
import { Drawer, IconButton } from '../../components/ui';
import { useT } from '../../i18n';
import { useUiShellStore } from '../../stores/ui-shell-store';
import type { SchedulerSnap } from './jobs-utils';

export interface JobsOverflowMenuProps {
  scheduler: SchedulerSnap | null;
  onMessage: (msg: string) => void;
}

export function JobsOverflowMenu({ scheduler, onMessage }: JobsOverflowMenuProps) {
  const t = useT();
  const navigate = useNavigate();
  const showAdvancedTools = useUiShellStore((s) => s.showAdvancedTools);
  const [open, setOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <IconButton
        ref={anchorRef}
        label={t('jobs.moreActions')}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        <MoreHorizontal size={18} aria-hidden />
      </IconButton>
      <DropdownMenu
        open={open}
        onOpenChange={setOpen}
        anchorRef={anchorRef}
        className="translation-menu"
        placement="bottom-end"
        minWidth={240}
        maxHeight={420}
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setOpen(false);
            navigate('/settings?tab=translation');
          }}
        >
          {t('jobs.concurrencySettings')}
        </button>
        <button
          type="button"
          role="menuitem"
          title={t('jobs.fairnessTooltip')}
          onClick={() => {
            setOpen(false);
            navigate('/settings?tab=translation');
          }}
        >
          {t('jobs.fairnessMenu')}
        </button>
        {scheduler ? (
          <div className="translation-menu__hint muted" role="note">
            {t('jobs.concurrencySummary', { n: String(scheduler.maxConcurrent) })}
          </div>
        ) : null}
        {showAdvancedTools ? (
          <>
            <div className="translation-menu__sep" role="separator" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setExportOpen(true);
              }}
            >
              {t('jobs.operationalExport')}
            </button>
          </>
        ) : null}
      </DropdownMenu>
      {showAdvancedTools ? (
        <Drawer
          open={exportOpen}
          title={t('jobs.operationalExport')}
          onClose={() => {
            setExportOpen(false);
          }}
          closeLabel={t('actions.close')}
        >
          <OperationalExportDialog
            kinds={['operational_jobs', 'operational_qa', 'operational_workbook']}
            onComplete={(msg) => {
              setExportOpen(false);
              onMessage(msg);
            }}
          />
        </Drawer>
      ) : null}
    </>
  );
}
