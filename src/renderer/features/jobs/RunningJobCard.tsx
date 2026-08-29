import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import type { JobDto } from '@shared/schemas/job';
import type { GoogleAccountDto } from '@shared/schemas/account';
import { measureJobProgress } from '@shared/utils/job-progress';
import { Button, Card, IconButton, ProgressBar } from '../../components/ui';
import { DropdownMenu } from '../../components/overlay';
import { useT } from '../../i18n';
import { statusLabel } from '../../i18n/status';
import { useUiShellStore } from '../../stores/ui-shell-store';
import {
  accountDisplayName,
  chapterRange,
  friendlyChannel,
} from './jobs-utils';
import { JobSelectCheckbox } from './JobSelectCheckbox';

export interface RunningJobCardProps {
  job: JobDto;
  titleFor: (projectId: string) => string;
  accountById: Map<string, GoogleAccountDto>;
  accountOrder: Map<string, number>;
  busy: boolean;
  selected: boolean;
  onToggleSelect: (jobId: string) => void;
  onOpen: (jobId: string) => void;
  onPauseAll: () => void;
  onCancel: (jobId: string) => void;
  onOpenGemini: (accountId: string) => void;
}

export function RunningJobCard({
  job,
  titleFor,
  accountById,
  accountOrder,
  busy,
  selected,
  onToggleSelect,
  onOpen,
  onPauseAll,
  onCancel,
  onOpenGemini,
}: RunningJobCardProps) {
  const t = useT();
  const navigate = useNavigate();
  const setCurrentProject = useUiShellStore((s) => s.setCurrentProject);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);

  const measure = measureJobProgress(job);
  const range = chapterRange(job);
  const accountId = job.progress?.accountId ?? job.pinnedAccountId;
  const account = accountId ? accountById.get(accountId) : undefined;
  const channel = friendlyChannel(job);
  const progressHint =
    typeof job.progress?.paragraphsDone === 'number' &&
    typeof job.progress?.paragraphsTotal === 'number' &&
    job.progress.paragraphsTotal > 0
      ? t('jobs.paragraphsProgress', {
          done: String(job.progress.paragraphsDone),
          total: String(job.progress.paragraphsTotal),
        })
      : measure.labelParts.length > 0
        ? measure.labelParts.join(' · ')
        : statusLabel(job.state);

  const openTranslator = () => {
    const title = titleFor(job.projectId);
    setCurrentProject(job.projectId, title);
    navigate(`/projects/${job.projectId}/translate`);
  };

  return (
    <Card className="jobs-running-card">
      <div className="jobs-card-row">
        <JobSelectCheckbox
          jobId={job.id}
          checked={selected}
          disabled={busy}
          ariaLabel={t('jobs.selectJobAria', { project: titleFor(job.projectId) })}
          onToggle={onToggleSelect}
        />
        <div className="jobs-card-main">
          <strong>{titleFor(job.projectId)}</strong>
          {range ? (
            <p className="muted jobs-card-sub">{t('jobs.chapterLabel', { range })}</p>
          ) : null}
          <p className="jobs-card-detail">{progressHint}</p>
          {account ? (
            <p className="muted jobs-card-sub">
              {t('jobs.aiAccount')}:{' '}
              {accountDisplayName(
                account,
                accountOrder.get(account.id) ?? 0,
                t('jobs.accountFallback'),
              )}
              {channel ? ` · ${channel}` : ''}
            </p>
          ) : null}
          <ProgressBar
            value={measure.percent}
            indeterminate={measure.indeterminate}
            label={progressHint}
            aria-label={t('jobs.progressAria', {
              project: titleFor(job.projectId),
              percent: String(measure.percent ?? 0),
            })}
          />
        </div>
        <div className="jobs-card-actions btn-row">
          <Button size="sm" variant="primary" onClick={openTranslator}>
            {t('jobs.openTranslator')}
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void onPauseAll()}>
            {t('actions.pause')}
          </Button>
          <IconButton
            ref={menuRef}
            label={t('jobs.moreActions')}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => {
              setMenuOpen((v) => !v);
            }}
          >
            <MoreHorizontal size={18} aria-hidden />
          </IconButton>
          <DropdownMenu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            anchorRef={menuRef}
            className="translation-menu"
            placement="bottom-end"
            minWidth={200}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                void onOpen(job.id);
              }}
            >
              {t('jobs.detail')}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onCancel(job.id);
              }}
            >
              {t('actions.cancel')}
            </button>
            {accountId ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void onOpenGemini(accountId);
                }}
              >
                {t('jobs.openGemini')}
              </button>
            ) : null}
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
}
