import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import type { JobDto } from '@shared/schemas/job';
import { Button, Card, IconButton, SectionHeader, Select } from '../../components/ui';
import { DropdownMenu } from '../../components/overlay';
import { useT } from '../../i18n';
import { chapterRange, isQueuedForDisplay, priorityBand, type PriorityBand } from './jobs-utils';
import { JobSelectCheckbox } from './JobSelectCheckbox';

export interface ProjectQueueSectionProps {
  queuedByProject: [string, JobDto[]][];
  titleFor: (projectId: string) => string;
  busy: boolean;
  selectedJobIds: Set<string>;
  onToggleSelect: (jobId: string) => void;
  onSetPriority: (jobIds: string[], band: PriorityBand) => void;
}

export function ProjectQueueSection({
  queuedByProject,
  titleFor,
  busy,
  selectedJobIds,
  onToggleSelect,
  onSetPriority,
}: ProjectQueueSectionProps) {
  const t = useT();
  const navigate = useNavigate();

  if (queuedByProject.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="jobs-queue-heading">
      <SectionHeader id="jobs-queue-heading" title={t('jobs.queueTitle')} />
      <div className="jobs-card-list">
        {queuedByProject.map(([projectId, projectJobs]) => (
          <QueueProjectCard
            key={projectId}
            projectJobs={projectJobs}
            title={titleFor(projectId)}
            busy={busy}
            selectedJobIds={selectedJobIds}
            onToggleSelect={onToggleSelect}
            onSetPriority={onSetPriority}
            onOpenProject={() => {
              navigate(`/projects/${projectId}`);
            }}
          />
        ))}
      </div>
    </section>
  );
}

function QueueProjectCard({
  projectJobs,
  title,
  busy,
  selectedJobIds,
  onToggleSelect,
  onSetPriority,
  onOpenProject,
}: {
  projectJobs: JobDto[];
  title: string;
  busy: boolean;
  selectedJobIds: Set<string>;
  onToggleSelect: (jobId: string) => void;
  onSetPriority: (jobIds: string[], band: PriorityBand) => void;
  onOpenProject: () => void;
}) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const next = projectJobs[0];
  const band = priorityBand(next.priority);
  const range = chapterRange(next);
  const queuedIds = projectJobs.filter((j) => isQueuedForDisplay(j.state)).map((j) => j.id);

  return (
    <Card className="jobs-queue-card">
      <div className="jobs-card-row">
        <div className="jobs-card-main">
          <h3 className="jobs-queue-title">{title}</h3>
          <p className="muted jobs-card-sub">
            {t('jobs.queueProjectSummary', {
              n: String(projectJobs.length),
              range: range ?? '—',
            })}
          </p>
        </div>
        <div className="jobs-card-actions">
          <label className="jobs-priority-field">
            <span className="muted">{t('jobs.priority')}</span>
            <Select
              value={band}
              disabled={busy}
              aria-label={t('jobs.priority')}
              title={t('jobs.priorityTooltip')}
              onChange={(e) => {
                onSetPriority(queuedIds, e.target.value as PriorityBand);
              }}
            >
              <option value="high">{t('jobs.priorityHigh')}</option>
              <option value="normal">{t('jobs.priorityNormal')}</option>
              <option value="low">{t('jobs.priorityLow')}</option>
            </Select>
          </label>
          <Button size="sm" variant="ghost" onClick={onOpenProject}>
            {t('jobs.openProject')}
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
                onSetPriority(queuedIds, 'high');
              }}
            >
              {t('jobs.queueMoveTop')}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onSetPriority(queuedIds, 'low');
              }}
            >
              {t('jobs.queueMoveBottom')}
            </button>
          </DropdownMenu>
        </div>
      </div>
      <ul className="jobs-queue-job-list">
        {projectJobs.map((job) => {
          const range = chapterRange(job);
          return (
            <li key={job.id} className="jobs-queue-job-item">
              <JobSelectCheckbox
                jobId={job.id}
                checked={selectedJobIds.has(job.id)}
                disabled={busy}
                ariaLabel={t('jobs.selectJobAria', {
                  project: range ? `${title} · ${range}` : title,
                })}
                onToggle={onToggleSelect}
              />
              <span className="jobs-queue-job-label">
                {range ? t('jobs.chapterLabel', { range }) : title}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
